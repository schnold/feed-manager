import { FeedRepository } from "~/db/repositories/feed.server";
import { ShopRepository } from "~/db/repositories/shop.server";
import { enqueueFeedGeneration } from "../queue/feed-queue.server";
import db from "~/db.server";

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
 * Check if a feed should be regenerated now based on its timezone and last run time
 * This accounts for the feed's timezone and ensures it only runs once per day
 */
export function shouldRegenerateNow(
  timezone: string,
  lastRunAt: Date | null,
  hourOfDay: number = 2,
  toleranceMinutes: number = 60 // Allow execution within 60 minutes of scheduled time
): boolean {
  const now = new Date();

  // Get current time in the feed's timezone
  const nowInFeedTZ = new Date(
    now.toLocaleString('en-US', { timeZone: timezone })
  );

  // If never run before, and we're past the scheduled hour, run it
  if (!lastRunAt) {
    const currentHour = nowInFeedTZ.getHours();
    return currentHour >= hourOfDay && currentHour < (hourOfDay + Math.floor(toleranceMinutes / 60) + 1);
  }

  // Get last run time in the feed's timezone
  const lastRunInFeedTZ = new Date(
    lastRunAt.toLocaleString('en-US', { timeZone: timezone })
  );

  // Check if last run was on a different day in the feed's timezone
  const lastRunDay = lastRunInFeedTZ.toDateString();
  const currentDay = nowInFeedTZ.toDateString();

  if (lastRunDay === currentDay) {
    // Already ran today in the feed's timezone
    return false;
  }

  // Check if we're within the tolerance window of the scheduled hour
  const currentHour = nowInFeedTZ.getHours();
  const currentMinute = nowInFeedTZ.getMinutes();
  const scheduledMinutes = hourOfDay * 60;
  const currentMinutes = currentHour * 60 + currentMinute;
  const minutesDiff = Math.abs(currentMinutes - scheduledMinutes);

  return minutesDiff <= toleranceMinutes;
}

/**
 * Get all feeds that need to be regenerated based on their timezones
 * This should be called periodically (e.g., every hour) to find feeds due for regeneration
 */
export async function getFeedsDueForRegeneration(
  hourOfDay: number = 2,
  toleranceMinutes: number = 60
): Promise<Array<{
  feed: any;
  shop: any;
  shouldRegenerate: boolean;
  nextScheduledRun: Date;
}>> {
  // Get all feeds with their shops
  const shops = await ShopRepository.findAll();
  const results = [];

  for (const shop of shops) {
    const feeds = await FeedRepository.findByShopId(shop.id);

    for (const feed of feeds) {
      const shouldRegenerate = shouldRegenerateNow(
        feed.timezone,
        feed.lastRunAt,
        hourOfDay,
        toleranceMinutes
      );

      const nextScheduledRun = getNextScheduledRun(feed.timezone, hourOfDay);

      results.push({
        feed,
        shop,
        shouldRegenerate,
        nextScheduledRun
      });
    }
  }

  return results;
}

/**
 * Regenerate all feeds that are due based on their timezone schedules
 * Returns statistics about the regeneration process
 */
export async function regenerateDueFeeds(
  hourOfDay: number = 2,
  toleranceMinutes: number = 60
): Promise<{
  totalFeeds: number;
  dueFeeds: number;
  enqueuedFeeds: number;
  skippedFeeds: number;
  errors: string[];
}> {
  const feedsData = await getFeedsDueForRegeneration(hourOfDay, toleranceMinutes);
  const dueFeeds = feedsData.filter(f => f.shouldRegenerate);

  let enqueuedFeeds = 0;
  let skippedFeeds = 0;
  const errors: string[] = [];

  for (const { feed, shop, shouldRegenerate } of feedsData) {
    if (!shouldRegenerate) {
      skippedFeeds++;
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
      enqueuedFeeds++;

      console.log(`[Scheduler] Enqueued feed ${feed.id} (${feed.name}) for shop ${shop.myshopifyDomain} - Timezone: ${feed.timezone}`);
    } catch (error) {
      const errorMsg = `Failed to enqueue feed ${feed.id} (${feed.name}): ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[Scheduler] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return {
    totalFeeds: feedsData.length,
    dueFeeds: dueFeeds.length,
    enqueuedFeeds,
    skippedFeeds,
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
