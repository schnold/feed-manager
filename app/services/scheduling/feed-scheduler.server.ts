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
  _toleranceMinutes: number = 60 // Unused but kept for backward compatibility
): boolean {
  // If never run before, run it now
  if (!lastRunAt) {
    return true;
  }

  const now = new Date();
  const scheduledHours = getScheduledHours(maxUpdatesPerDay);

  // We need to find the *most recent* scheduled time slot that has passed.
  // If the last run was *before* this slot, then we are due for an update.

  // 1. Get current time in the feed's timezone to determine the date references
  const tzOptions = { timeZone: timezone, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' } as const;
  const parts = new Intl.DateTimeFormat('en-US', tzOptions).formatToParts(now);
  const part = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');

  const currentYear = part('year');
  const currentMonth = part('month') - 1; // 0-indexed
  const currentDay = part('day');
  const currentHour = part('hour');

  // 2. Identify candidate slots for today and yesterday
  // We construct Date objects relative to the feed's timezone but represented in local server time for comparison?
  // No, we should construct timestamps. 
  // It's safer to work with ISO strings to avoid local server timezone confusion.

  const getTimestampForSlot = (year: number, month: number, day: number, hour: number) => {
    // Create a date object for this specific slot in the feed's timezone
    // We use the string parsing behavior of Date which is reliable with explicit timezones in some envs, 
    // but here we can rely on `toLocaleString` reverse logic or simpler:
    // Create UTC date -> shift by offset? No, offset changes (DST).

    // Most robust: Construct a string like "YYYY-MM-DDTHH:00:00" and append implicit offset? 
    // No, standard JS Date doesn't support parsing with arbitrary IANA timezone.

    // Hacky but effective way to get absolute timestamp for a timezone-relative time:
    // 1. Guess UTC
    // 2. Check simple offset
    // 3. Adjust

    // Better: We only need to know if "Now" is past "Slot".
    // We know "Now" is `currentHour` on `currentDay`.

    // Simple logic:
    // Find the latest passed slot *in feed time*.
    // Example: Now is 14:00. Schedule is [2, 14]. 
    // Passed slots today: 2, 14.
    // Latest passed slot: Today 14:00.

    // Example: Now is 10:00. Schedule is [2, 14].
    // Passed slots today: 2.
    // Latest passed slot: Today 02:00.

    // Example: Now is 01:00. Schedule is [2, 14].
    // Passed slots today: None.
    // Latest passed slot: Yesterday 14:00.

    return { year, month, day, hour };
  };

  // Find latest passed slot
  let latestPassedSlot: { year: number, month: number, day: number, hour: number } | null = null;

  // Check today's slots
  const passedToday = scheduledHours.filter(h => h <= currentHour).sort((a, b) => b - a);

  if (passedToday.length > 0) {
    latestPassedSlot = { year: currentYear, month: currentMonth, day: currentDay, hour: passedToday[0] };
  } else {
    // Check yesterday's slots (take the latest one)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yParts = new Intl.DateTimeFormat('en-US', tzOptions).formatToParts(yesterday);
    const yPart = (type: string) => parseInt(yParts.find(p => p.type === type)?.value || '0');

    const sortedHours = [...scheduledHours].sort((a, b) => b - a);
    if (sortedHours.length > 0) {
      latestPassedSlot = {
        year: yPart('year'),
        month: yPart('month') - 1,
        day: yPart('day'),
        hour: sortedHours[0]
      };
    }
  }

  if (!latestPassedSlot) return true; // Should ideally have a slot if maxUpdates > 0

  // 3. Now verify if lastRunAt was BEFORE this `latestPassedSlot`
  // We need to compare specific points in time.
  // Convert `lastRunAt` to feed's timezone components
  const lParts = new Intl.DateTimeFormat('en-US', tzOptions).formatToParts(lastRunAt);
  const lPart = (type: string) => parseInt(lParts.find(p => p.type === type)?.value || '0');

  const lastRun = {
    year: lPart('year'),
    month: lPart('month') - 1,
    day: lPart('day'),
    hour: lPart('hour'),
    minute: lPart('minute')
  };

  // Compare lexicographically: Year, Month, Day, Hour
  // If LastRun < LatestPassedSlot, then REGENERATE

  if (lastRun.year < latestPassedSlot.year) return true;
  if (lastRun.year > latestPassedSlot.year) return false;

  if (lastRun.month < latestPassedSlot.month) return true;
  if (lastRun.month > latestPassedSlot.month) return false;

  if (lastRun.day < latestPassedSlot.day) return true;
  if (lastRun.day > latestPassedSlot.day) return false;

  if (lastRun.hour < latestPassedSlot.hour) return true;

  // If same hour, we assume it ran for this slot (checking minutes is overkill for hourly slots)
  return false;
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
