import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { regenerateDueFeeds } from "../../services/scheduling/feed-scheduler.server";

/**
 * API endpoint to regenerate feeds based on their timezone schedules
 * This endpoint is called by the Netlify scheduled function hourly
 * to check which feeds need regeneration based on their individual timezones
 *
 * Authentication: Uses a secret token (FEED_REGENERATION_SECRET)
 *
 * Usage:
 * POST /api/feeds/regenerate-scheduled
 * Headers: { "X-Regeneration-Secret": "your-secret-token" }
 * Body: {
 *   "hourOfDay": 2,           // Optional: hour when feeds should regenerate (default: 2 AM)
 *   "toleranceMinutes": 60    // Optional: tolerance window in minutes (default: 60)
 * }
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    // Verify the secret token for security
    const secret = request.headers.get("X-Regeneration-Secret");
    const expectedSecret = process.env.FEED_REGENERATION_SECRET;

    if (!expectedSecret) {
      console.warn("FEED_REGENERATION_SECRET not set. Scheduled regeneration is disabled.");
      return json({ error: "Scheduled regeneration not configured" }, { status: 503 });
    }

    if (secret !== expectedSecret) {
      console.warn("Invalid regeneration secret provided");
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse the request body
    const body = await request.json().catch(() => ({}));
    const { hourOfDay = 2, toleranceMinutes = 60 } = body;

    console.log(`[Scheduled Regeneration] Checking for feeds due at hour ${hourOfDay} with ${toleranceMinutes}min tolerance`);

    // Get and regenerate feeds that are due based on their timezones
    const result = await regenerateDueFeeds(hourOfDay, toleranceMinutes);

    console.log(
      `[Scheduled Regeneration] Processed ${result.totalFeeds} feeds: ` +
      `${result.enqueuedFeeds} enqueued, ${result.skippedFeeds} skipped, ` +
      `${result.skippedFreePlan} skipped (free plan)`
    );

    if (result.errors.length > 0) {
      console.error(`[Scheduled Regeneration] Errors:`, result.errors);
    }

    return json({
      success: true,
      message: `Processed ${result.totalFeeds} feeds. ${result.enqueuedFeeds} feeds enqueued for regeneration.`,
      stats: {
        totalFeeds: result.totalFeeds,
        dueFeeds: result.dueFeeds,
        enqueuedFeeds: result.enqueuedFeeds,
        skippedFeeds: result.skippedFeeds,
        skippedFreePlan: result.skippedFreePlan,
        failedFeeds: result.errors.length
      },
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error) {
    console.error("[Scheduled Regeneration] Error:", error);
    return json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Also support GET for simple health checks
export async function loader() {
  return json({
    endpoint: "Timezone-Aware Feed Regeneration API",
    method: "POST",
    authentication: "X-Regeneration-Secret header required",
    documentation: "Automatically regenerates feeds based on their timezone schedules",
    schedule: "Should be called hourly to check for feeds due in their local timezones"
  });
}
