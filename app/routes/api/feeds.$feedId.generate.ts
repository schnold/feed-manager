import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { enqueueFeedGeneration } from "../../services/queue/feed-queue.server";
import { FeedRepository } from "../../db/repositories/feed.server";

export async function action({ params, request }: ActionFunctionArgs) {
  const feedId = params.feedId;
  if (!feedId) return json({ error: "Feed ID missing" }, { status: 400 });

  try {
    // Get the feed to ensure it exists and get shop credentials
    const feed = await FeedRepository.findById(feedId);
    if (!feed) {
      return json({ error: "Feed not found" }, { status: 404 });
    }

    // Enqueue the generation job with shop credentials
    await enqueueFeedGeneration({
      feedId,
      shopId: feed.shopId,
      shopDomain: feed.shop.myshopifyDomain,
      accessToken: feed.shop.accessToken,
      triggeredBy: "manual"
    });

    return json({ ok: true, message: "Feed generation enqueued" });
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}


