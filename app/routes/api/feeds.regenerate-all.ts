import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { ShopRepository } from "../../db/repositories/shop.server";
import { FeedRepository } from "../../db/repositories/feed.server";
import { enqueueFeedGeneration } from "../../services/queue/feed-queue.server";

/**
 * API endpoint to regenerate all feeds for a shop or all shops
 * This can be called by:
 * - Cron jobs (scheduled tasks)
 * - Netlify scheduled functions
 * - External automation services
 * 
 * Authentication: Uses a secret token (FEED_REGENERATION_SECRET)
 * 
 * Usage:
 * POST /api/feeds/regenerate-all
 * Headers: { "X-Regeneration-Secret": "your-secret-token" }
 * Body: { "shopDomain": "optional-shop.myshopify.com" }
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
    const { shopDomain } = body;

    let shops;
    
    if (shopDomain) {
      // Regenerate feeds for a specific shop
      const shop = await ShopRepository.findByDomain(shopDomain);
      if (!shop) {
        return json({ error: "Shop not found" }, { status: 404 });
      }
      shops = [shop];
      console.log(`Regenerating feeds for shop: ${shopDomain}`);
    } else {
      // Regenerate feeds for all shops
      shops = await ShopRepository.findAll();
      console.log(`Regenerating feeds for all shops (${shops.length} shops)`);
    }

    let totalFeeds = 0;
    let enqueuedFeeds = 0;
    const errors: string[] = [];

    for (const shop of shops) {
      try {
        const feeds = await FeedRepository.findByShopId(shop.id);
        totalFeeds += feeds.length;

        for (const feed of feeds) {
          try {
            await enqueueFeedGeneration({
              feedId: feed.id,
              shopId: shop.id,
              shopDomain: shop.myshopifyDomain,
              accessToken: shop.accessToken,
              triggeredBy: "scheduled"
            });
            enqueuedFeeds++;
          } catch (error) {
            const errorMsg = `Failed to enqueue feed ${feed.id} for shop ${shop.myshopifyDomain}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to process shop ${shop.myshopifyDomain}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return json({
      success: true,
      message: `Enqueued ${enqueuedFeeds} of ${totalFeeds} feeds for regeneration`,
      stats: {
        totalShops: shops.length,
        totalFeeds,
        enqueuedFeeds,
        failedFeeds: totalFeeds - enqueuedFeeds
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Error in regenerate-all endpoint:", error);
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
    endpoint: "Feed Regeneration API",
    method: "POST",
    authentication: "X-Regeneration-Secret header required",
    documentation: "Use POST with optional shopDomain in body to regenerate feeds"
  });
}

