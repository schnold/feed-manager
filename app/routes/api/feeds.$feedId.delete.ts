import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { ShopRepository } from "../../db/repositories/shop.server";
import { FeedRepository } from "../../db/repositories/feed.server";

export async function action({ params, request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const feedId = params.feedId;

  if (!feedId) {
    return json({ error: "Feed ID is required" }, { status: 400 });
  }

  try {
    // Get the shop
    const shop = await ShopRepository.findByDomain(session.shop);
    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    // Get the feed
    const feed = await FeedRepository.findById(feedId);
    if (!feed) {
      return json({ error: "Feed not found" }, { status: 404 });
    }

    // Verify the feed belongs to this shop
    if (feed.shopId !== shop.id) {
      return json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete the feed and all related data
    await FeedRepository.deleteWithRelations(feedId);

    return json({ success: "Feed deleted successfully" });
  } catch (error) {
    console.error("Error deleting feed:", error);
    return json({ error: "Failed to delete feed" }, { status: 500 });
  }
}
