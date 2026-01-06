import { FeedRepository } from "../../db/repositories/feed.server";
import { ShopRepository } from "../../db/repositories/shop.server";
import { enqueueFeedGeneration } from "../queue/feed-queue.server";
import db from "../../db.server";
import { PLAN_FEATURES } from "../shopify/subscription.server";

/**
 * Feed Scheduler Service
 * Handles timezone-aware scheduling of feed regenerations
 *
 * Each feed can have its own timezone, and regeneration happens once per day
 * at the configured time in that timezone (default: 2 AM local time)
 */

interface FeedScheduleConfig {
  feedId: string;
  timezone: string;
  hourOfDay: number; // 0-23, hour in the feed's timezone when regeneration should occur
  enabled: boolean;
}

/**
 * Get the next scheduled run time for a feed based on its timezone
 */
export function getNextScheduledRun(timezone: string, hourOfDay: number = 2): Date {
  const now = new Date();

  // Create a date for the next occurrence of the specified hour in the feed's timezone
  const nextRun = new Date(
    now.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    })
  );

  // Set to the desired hour
  nextRun.setHours(hourOfDay, 0, 0, 0);

  // If that time has already passed today, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun;
}

/**
 * Get the scheduled hours for regeneration based on max updates per day
 * E.g., 1 update = [2], 4 updates = [2, 8, 14, 20], 8 updates = [2, 5, 8, 11, 14, 17, 20, 23]
 */
function getScheduledHours(maxUpdatesPerDay: number): number[] {
  if (maxUpdatesPerDay <= 0) return [];
  if (maxUpdatesPerDay === 1) return [2]; // 2 AM
  if (maxUpdatesPerDay === 2) return [2, 14]; // 2 AM, 2 PM
  if (maxUpdatesPerDay === 4) return [2, 8, 14, 20]; // Every 6 hours
  if (maxUpdatesPerDay === 8) return [2, 5, 8, 11, 14, 17, 20, 23]; // Every 3 hours
  
  // For other values, distribute evenly throughout the day
  const interval = Math.floor(24 / maxUpdatesPerDay);
  return Array.from({ length: maxUpdatesPerDay }, (_, i) => (2 + i * interval) % 24);
}

/**
 * Check if a feed should be regenerated now based on its timezone and last run time
 * Supports multiple updates per day based on maxUpdatesPerDay
 */
export function shouldRegenerateNow(
  timezone: string,
  lastRunAt: Date | null,
  maxUpdatesPerDay: number = 1,
  toleranceMinutes: number = 60 // Allow execution within 60 minutes of scheduled time
): boolean {
  const now = new Date();

  // Get current time in the feed's timezone
  const nowInFeedTZ = new Date(
    now.toLocaleString('en-US', { timeZone: timezone })
  );
  
  const currentHour = nowInFeedTZ.getHours();
  const currentMinute = nowInFeedTZ.getMinutes();
  const scheduledHours = getScheduledHours(maxUpdatesPerDay);

  // Find if current time is within tolerance of any scheduled hour
  const isScheduledHour = scheduledHours.some(hour => {
    const scheduledMinutes = hour * 60;
    const currentMinutes = currentHour * 60 + currentMinute;
    const minutesDiff = Math.abs(currentMinutes - scheduledMinutes);
    return minutesDiff <= toleranceMinutes;
  });

  if (!isScheduledHour) {
    return false;
  }

  // If never run before, run it now
  if (!lastRunAt) {
    return true;
  }

  // Get last run time in the feed's timezone
  const lastRunInFeedTZ = new Date(
    lastRunAt.toLocaleString('en-US', { timeZone: timezone })
  );

  // Calculate hours since last run
  const hoursSinceLastRun = (nowInFeedTZ.getTime() - lastRunInFeedTZ.getTime()) / (1000 * 60 * 60);
  
  // Calculate minimum hours between updates
  const minHoursBetweenUpdates = 24 / maxUpdatesPerDay;
  
  // Only regenerate if enough time has passed since last run
  return hoursSinceLastRun >= (minHoursBetweenUpdates - 1); // -1 hour for tolerance
}

/**
 * Get all feeds that need to be regenerated based on their timezones
 * This should be called periodically (e.g., every hour) to find feeds due for regeneration
 * IMPORTANT: Only includes feeds from shops with paid plans (maxScheduledUpdates > 0)
 */
export async function getFeedsDueForRegeneration(
  hourOfDay: number = 2,
  toleranceMinutes: number = 60
): Promise<Array<{
  feed: any;
  shop: any;
  shouldRegenerate: boolean;
  nextScheduledRun: Date;
  plan: string;
  maxScheduledUpdates: number;
}>> {
  // Get all shops with their active subscriptions
  const shops = await db.shop.findMany({
    include: {
      subscriptions: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });
  
  const results = [];

  for (const shop of shops) {
    // Determine the shop's current plan
    const plan = shop.subscriptions[0]?.planId || shop.plan || 'free';
    const basePlan = plan.replace('_yearly', '');
    const planFeatures = PLAN_FEATURES[basePlan] || PLAN_FEATURES['free'];
    const maxScheduledUpdates = planFeatures.maxScheduledUpdates || 0;

    // Skip shops on free plan (no scheduled updates allowed)
    if (maxScheduledUpdates === 0) {
      console.log(`[Scheduler] Skipping shop ${shop.myshopifyDomain} - plan "${plan}" has no scheduled updates`);
      continue;
    }

    const feeds = await FeedRepository.findByShopId(shop.id);

    for (const feed of feeds) {
      const shouldRegenerate = shouldRegenerateNow(
        feed.timezone,
        feed.lastRunAt,
        maxScheduledUpdates,
        toleranceMinutes
      );

      const nextScheduledRun = getNextScheduledRun(feed.timezone, hourOfDay);

      results.push({
        feed,
        shop,
        shouldRegenerate,
        nextScheduledRun,
        plan,
        maxScheduledUpdates
      });
    }
  }

  return results;
}

/**
 * Regenerate all feeds that are due based on their timezone schedules
 * Returns statistics about the regeneration process
 * 
 * IMPORTANT: Respects subscription plan limits
 * - Free plan: No scheduled updates (manual only)
 * - Paid plans: Limited updates per day based on plan tier
 */
export async function regenerateDueFeeds(
  hourOfDay: number = 2,
  toleranceMinutes: number = 60
): Promise<{
  totalFeeds: number;
  dueFeeds: number;
  enqueuedFeeds: number;
  skippedFeeds: number;
  skippedFreePlan: number;
  errors: string[];
}> {
  const feedsData = await getFeedsDueForRegeneration(hourOfDay, toleranceMinutes);
  const dueFeeds = feedsData.filter(f => f.shouldRegenerate);

  let enqueuedFeeds = 0;
  let skippedFeeds = 0;
  let skippedFreePlan = 0;
  const errors: string[] = [];

  // Group feeds by shop to track daily update limits
  const shopUpdateCounts = new Map<string, number>();

  for (const { feed, shop, shouldRegenerate, plan, maxScheduledUpdates } of feedsData) {
    if (!shouldRegenerate) {
      skippedFeeds++;
      continue;
    }

    // Double-check plan allows scheduled updates (should already be filtered)
    if (maxScheduledUpdates === 0) {
      skippedFreePlan++;
      console.log(`[Scheduler] Skipping feed ${feed.id} - shop ${shop.myshopifyDomain} is on free plan`);
      continue;
    }

    // Check if shop has reached daily update limit
    const currentCount = shopUpdateCounts.get(shop.id) || 0;
    if (currentCount >= maxScheduledUpdates) {
      skippedFeeds++;
      console.log(
        `[Scheduler] Skipping feed ${feed.id} - shop ${shop.myshopifyDomain} ` +
        `has reached daily limit (${maxScheduledUpdates} updates for plan "${plan}")`
      );
      continue;
    }

    try {
      await enqueueFeedGeneration({
        feedId: feed.id,
        shopId: shop.id,
        shopDomain: shop.myshopifyDomain,
        accessToken: shop.accessToken,
        triggeredBy: "scheduled"
      });
      
      // Increment shop's update count for today
      shopUpdateCounts.set(shop.id, currentCount + 1);
      enqueuedFeeds++;

      console.log(
        `[Scheduler] ✅ Enqueued feed ${feed.id} (${feed.name}) for shop ${shop.myshopifyDomain} ` +
        `- Plan: ${plan}, Update ${currentCount + 1}/${maxScheduledUpdates}, Timezone: ${feed.timezone}`
      );
    } catch (error) {
      const errorMsg = `Failed to enqueue feed ${feed.id} (${feed.name}): ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[Scheduler] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  console.log(
    `[Scheduler] Summary: ${enqueuedFeeds} feeds enqueued, ${skippedFeeds} skipped (not due), ` +
    `${skippedFreePlan} skipped (free plan), ${errors.length} errors`
  );

  return {
    totalFeeds: feedsData.length,
    dueFeeds: dueFeeds.length,
    enqueuedFeeds,
    skippedFeeds,
    skippedFreePlan,
    errors
  };
}

/**
 * Create or update a feed schedule
 * This sets up when the feed should be regenerated (default: daily at 2 AM in feed's timezone)
 */
export async function createOrUpdateFeedSchedule(
  feedId: string,
  config: {
    hourOfDay?: number;
    enabled?: boolean;
    cron?: string;
  } = {}
): Promise<void> {
  const { hourOfDay = 2, enabled = true, cron } = config;

  // Generate cron expression for daily execution at specified hour
  // Format: "minute hour * * *" for daily execution
  const cronExpression = cron || `0 ${hourOfDay} * * *`;

  // Check if schedule already exists
  const existingSchedule = await db.feedSchedule.findFirst({
    where: { feedId }
  });

  if (existingSchedule) {
    await db.feedSchedule.update({
      where: { id: existingSchedule.id },
      data: {
        cron: cronExpression,
        enabled
      }
    });
  } else {
    await db.feedSchedule.create({
      data: {
        feedId,
        cron: cronExpression,
        enabled
      }
    });
  }

  console.log(`[Scheduler] ${existingSchedule ? 'Updated' : 'Created'} schedule for feed ${feedId}: ${cronExpression} (enabled: ${enabled})`);
}

/**
 * Disable scheduled regeneration for a feed
 */
export async function disableFeedSchedule(feedId: string): Promise<void> {
  await db.feedSchedule.updateMany({
    where: { feedId },
    data: { enabled: false }
  });

  console.log(`[Scheduler] Disabled schedule for feed ${feedId}`);
}

/**
 * Get feed schedule information
 */
export async function getFeedSchedule(feedId: string) {
  const feed = await FeedRepository.findById(feedId);
  if (!feed) return null;

  const schedule = await db.feedSchedule.findFirst({
    where: { feedId }
  });

  const nextScheduledRun = getNextScheduledRun(feed.timezone, 2);

  return {
    feed,
    schedule,
    nextScheduledRun,
    timezone: feed.timezone,
    lastRunAt: feed.lastRunAt,
    lastSuccessAt: feed.lastSuccessAt
  };
}
