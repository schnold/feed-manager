import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { FeedRepository } from "../db/repositories/feed.server";
import { enqueueFeedGeneration } from "../services/queue/feed-queue.server";

/**
 * Webhook handler for products/update events
 * 
 * HMAC verification: Automatically handled by authenticate.webhook()
 * - Verifies X-Shopify-Hmac-SHA256 header
 * - Returns 401 Unauthorized if HMAC is invalid
 * - Only processes webhook if verification passes
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // authenticate.webhook automatically verifies HMAC signature
    // If HMAC is invalid, it will throw an error or return a 401 Response
    const { shop, topic, payload } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    try {
      const productData = JSON.parse(payload);
      console.log(`Product updated: ${productData.title} (ID: ${productData.id})`);

      // Find the shop and enqueue feed regeneration
      const shopRecord = await ShopRepository.findByDomain(shop);
      if (shopRecord) {
        const feeds = await FeedRepository.findByShopId(shopRecord.id);

        // Enqueue regeneration for all feeds of this shop
        for (const feed of feeds) {
          await enqueueFeedGeneration({
            feedId: feed.id,
            shopId: shopRecord.id,
            shopDomain: shopRecord.myshopifyDomain,
            accessToken: shopRecord.accessToken,
            triggeredBy: "webhook"
          });
        }

        console.log(`Enqueued ${feeds.length} feed(s) for regeneration`);
      }
    } catch (error) {
      console.error("Error processing product update webhook:", error);
    }

    return new Response();
  } catch (error) {
    // If authenticate.webhook throws, it means HMAC verification failed
    // It will automatically return 401, but we should handle other errors
    if (error instanceof Response) {
      return error; // Return the 401 Response from authenticate.webhook
    }
    
    console.error("Error in products/update webhook handler:", error);
    return new Response(null, { status: 500 });
  }
};