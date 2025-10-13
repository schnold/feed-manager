import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { FeedRepository } from "../db/repositories/feed.server";
import { enqueueFeedGeneration } from "../services/queue/feed-queue.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const productData = JSON.parse(payload);
    console.log(`Product created: ${productData.title} (ID: ${productData.id})`);

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
    console.error("Error processing product creation webhook:", error);
  }

  return new Response();
};