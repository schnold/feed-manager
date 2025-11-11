import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

/**
 * Netlify Scheduled Function to regenerate all feeds automatically
 * 
 * Setup Instructions:
 * 1. Add FEED_REGENERATION_SECRET to your Netlify environment variables
 * 2. Configure the schedule in netlify.toml:
 *    [functions."scheduled-feed-regeneration"]
 *    schedule = "0 2 * * *"  # Run daily at 2 AM UTC
 * 
 * Alternative schedules:
 * - "0 0,6,12,18 * * *"  # Every 6 hours
 * - "0 0 * * 0"          # Weekly on Sunday at midnight
 * - "0 0,2,4,6,8,10,12,14,16,18,20,22 * * *"  # Every 2 hours
 * 
 * To manually trigger: Deploy this function and use Netlify's Functions UI
 */

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log("Scheduled feed regeneration triggered");

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
  const apiUrl = `${siteUrl}/api/feeds/regenerate-all`;

  try {
    console.log(`Calling regeneration API: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Regeneration-Secret": secret
      },
      body: JSON.stringify({
        // Optional: specify a shop domain to regenerate only that shop's feeds
        // shopDomain: "your-shop.myshopify.com"
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

    console.log("Regeneration successful:", data);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Scheduled regeneration completed",
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

