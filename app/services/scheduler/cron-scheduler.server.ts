import cron from "node-cron";
import db from "../../db.server";
import { enqueueFeedGeneration } from "../queue/feed-queue.server";

interface ScheduledTask {
  id: string;
  feedId: string;
  cron: string;
  task?: cron.ScheduledTask;
}

class CronScheduler {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();

  async initialize() {
    console.log("🕒 Initializing cron scheduler...");
    
    // Load all enabled schedules from database
    const schedules = await db.feedSchedule.findMany({
      where: { enabled: true },
      include: { feed: true }
    });

    for (const schedule of schedules) {
      await this.scheduleTask(schedule.id, schedule.feedId, schedule.cron);
    }

    console.log(`📅 Loaded ${schedules.length} scheduled task(s)`);
  }

  async scheduleTask(scheduleId: string, feedId: string, cronExpression: string) {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`Invalid cron expression: ${cronExpression} for schedule ${scheduleId}`);
      return false;
    }

    // Remove existing task if any
    await this.unscheduleTask(scheduleId);

    try {
      const task = cron.schedule(cronExpression, async () => {
        console.log(`🔄 Cron trigger: generating feed ${feedId} (schedule ${scheduleId})`);

        try {
          // Get feed and shop info including credentials
          const feed = await db.feed.findUnique({
            where: { id: feedId },
            select: {
              id: true,
              shopId: true,
              name: true,
              shop: {
                select: {
                  myshopifyDomain: true,
                  accessToken: true
                }
              }
            }
          });

          if (feed) {
            await enqueueFeedGeneration({
              feedId: feed.id,
              shopId: feed.shopId,
              shopDomain: feed.shop.myshopifyDomain,
              accessToken: feed.shop.accessToken,
              triggeredBy: "schedule"
            });
            console.log(`✅ Scheduled generation enqueued for feed: ${feed.name}`);
          } else {
            console.warn(`Feed ${feedId} not found for schedule ${scheduleId}`);
          }
        } catch (error) {
          console.error(`Failed to enqueue scheduled generation for feed ${feedId}:`, error);
        }
      }, {
        scheduled: false // Don't start immediately
      });

      this.scheduledTasks.set(scheduleId, {
        id: scheduleId,
        feedId,
        cron: cronExpression,
        task
      });

      // Start the task
      task.start();
      
      console.log(`📅 Scheduled task ${scheduleId} for feed ${feedId}: ${cronExpression}`);
      return true;
    } catch (error) {
      console.error(`Failed to schedule task ${scheduleId}:`, error);
      return false;
    }
  }

  async unscheduleTask(scheduleId: string) {
    const existingTask = this.scheduledTasks.get(scheduleId);
    if (existingTask?.task) {
      existingTask.task.stop();
      existingTask.task.destroy();
      this.scheduledTasks.delete(scheduleId);
      console.log(`🗑️ Unscheduled task ${scheduleId}`);
    }
  }

  async updateSchedule(scheduleId: string, feedId: string, cronExpression: string, enabled: boolean) {
    if (enabled) {
      return await this.scheduleTask(scheduleId, feedId, cronExpression);
    } else {
      await this.unscheduleTask(scheduleId);
      return true;
    }
  }

  async refreshSchedules() {
    console.log("🔄 Refreshing all schedules...");
    
    // Stop all current tasks
    for (const [scheduleId] of this.scheduledTasks) {
      await this.unscheduleTask(scheduleId);
    }

    // Reload from database
    await this.initialize();
  }

  getScheduledTasks(): ScheduledTask[] {
    return Array.from(this.scheduledTasks.values()).map(({ task, ...rest }) => rest);
  }

  shutdown() {
    console.log("🛑 Shutting down cron scheduler...");
    for (const [scheduleId] of this.scheduledTasks) {
      this.unscheduleTask(scheduleId);
    }
    this.scheduledTasks.clear();
  }
}

// Singleton instance
export const cronScheduler = new CronScheduler();

// Initialize on import (when worker starts)
let isInitialized = false;
export async function initializeScheduler() {
  if (!isInitialized) {
    await cronScheduler.initialize();
    isInitialized = true;
  }
}