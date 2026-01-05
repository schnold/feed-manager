import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

/**
 * Netlify Scheduled Function to regenerate feeds based on their timezone schedules
 *
 * This function runs hourly to check which feeds need regeneration based on their
 * individual timezone settings. Each feed is regenerated once per day at 2 AM
 * in its configured timezone.
 *
 * Setup Instructions:
 * 1. Add FEED_REGENERATION_SECRET to your Netlify environment variables
 * 2. Configure the schedule in netlify.toml:
 *    [functions."scheduled-feed-regeneration"]
 *    schedule = "0 * * * *"  # Run every hour to check for feeds due in their timezones
 *
 * How it works:
 * - Each feed has a timezone setting (e.g., "America/New_York", "Europe/London")
 * - Feeds are regenerated once per day at 2 AM in their local timezone
 * - The function checks every hour which feeds are due for regeneration
 * - Feeds are only regenerated if they haven't been regenerated today in their timezone
 *
 * To manually trigger: Deploy this function and use Netlify's Functions UI
 */

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log("Timezone-aware feed regeneration check triggered");

  const secret = process.env.FEED_REGENERATION_SECRET;

  if (!secret) {
    console.error("FEED_REGENERATION_SECRET not configured");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Configuration missing" })
    };
  }

  // Get the site URL from Netlify environment
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:3000";
  const apiUrl = `${siteUrl}/api/feeds/regenerate-scheduled`;

  try {
    console.log(`Calling timezone-aware regeneration API: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Regeneration-Secret": secret
      },
      body: JSON.stringify({
        hourOfDay: 2, // Regenerate at 2 AM in each feed's timezone
        toleranceMinutes: 60 // Allow execution within 60 minutes of scheduled time
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Regeneration API error:", data);
      return {
        statusCode: response.status,
        body: JSON.stringify(data)
      };
    }

    console.log("Timezone-aware regeneration check completed:", data);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Timezone-aware regeneration check completed",
        result: data
      })
    };
  } catch (error) {
    console.error("Error calling regeneration API:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to trigger regeneration",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};

export { handler };

