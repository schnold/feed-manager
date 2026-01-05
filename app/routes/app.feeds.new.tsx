import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { FeedRepository } from "../db/repositories/feed.server";
import { getShopLocales } from "../services/shopify/locales.server";
import { getShopLocations } from "../services/shopify/locations.server";
import { EnhancedTabbedFeedForm } from "../components/EnhancedTabbedFeedForm";
import { Page, Layout, Banner } from "@shopify/polaris";
import { enqueueFeedGeneration } from "../services/queue/feed-queue.server";
import { randomUUID } from "crypto";
import { requireActivePlan, canCreateFeed } from "../services/shopify/subscription.server";
import { createOrUpdateFeedSchedule } from "../services/scheduling/feed-scheduler.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // SECURITY: Require active subscription (minimum BASE plan)
  const subscription = await requireActivePlan(request, 'base');

  const { session } = await authenticate.admin(request);

  const shop = await ShopRepository.findByDomain(session.shop) || await ShopRepository.upsert({
    myshopifyDomain: session.shop,
    accessToken: session.accessToken
  });

  // Sync shop plan with subscription if needed
  if (subscription.plan !== shop.plan) {
    await ShopRepository.updatePlan(session.shop, subscription.plan);
    shop.plan = subscription.plan;
  }

  // Check if this is edit mode by looking for feedId in query params
  const url = new URL(request.url);
  const feedId = url.searchParams.get("feedId");

  try {
    const [locales, locations] = await Promise.all([
      getShopLocales(request),
      getShopLocations(request)
    ]);

    // If feedId is provided, load the feed data for editing
    if (feedId) {
      const feed = await FeedRepository.findById(feedId);
      if (!feed) {
        throw new Response("Feed not found", { status: 404 });
      }

      // Verify the feed belongs to this shop
      if (feed.shopId !== shop.id) {
        throw new Response("Unauthorized", { status: 403 });
      }

      // Transform feed data for the form
      const feedData = {
        id: feed.id,
        name: feed.name,
        title: feed.title || "",
        channel: feed.channel,
        language: feed.language,
        country: feed.country,
        currency: feed.currency,
        timezone: feed.timezone,
        targetMarkets: feed.targetMarkets,
        locationId: feed.locationId || locations[0]?.id || "",
        settings: feed.settings as any || {}
      };

      return json({ locales, locations, feed: feedData, isEdit: true });
    }

    return json({ locales, locations, feed: null, isEdit: false });
  } catch (error) {
    console.error("Failed to fetch shop data:", error);
    return json({ locales: [], locations: [], feed: null, isEdit: false });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // SECURITY: Require active subscription
  const subscription = await requireActivePlan(request, 'base');

  const { session } = await authenticate.admin(request);

  const shop = await ShopRepository.upsert({
    myshopifyDomain: session.shop,
    accessToken: session.accessToken
  });

  // Sync shop plan with subscription if needed
  if (subscription.plan !== shop.plan) {
    await ShopRepository.updatePlan(session.shop, subscription.plan);
    shop.plan = subscription.plan;
  }

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;
  const feedId = formData.get("feedId") as string;
  const name = formData.get("name") as string;
  const title = formData.get("title") as string;
  const channel = formData.get("channel") as string;
  const language = formData.get("language") as string;
  const country = formData.get("country") as string;
  const currency = formData.get("currency") as string;
  const timezone = formData.get("timezone") as string;
  const locationId = formData.get("locationId") as string;
  const settingsJson = formData.get("settings") as string;

  if (!name || !channel || !language || !country || !currency || !timezone) {
    return json({ error: "Please fill in all required fields" }, { status: 400 });
  }

  try {
    let settings = {};
    try {
      settings = settingsJson ? JSON.parse(settingsJson) : {};
    } catch (error) {
      console.error("Failed to parse settings:", error);
    }

    // Handle delete action
    if (actionType === "delete" && feedId) {
      const feed = await FeedRepository.findById(feedId);
      if (!feed || feed.shopId !== shop.id) {
        return json({ error: "Feed not found or unauthorized" }, { status: 403 });
      }
      await FeedRepository.deleteWithRelations(feedId);
      return redirect("/app/feeds");
    }

    // Handle update action
    if (feedId) {
      const feed = await FeedRepository.findById(feedId);
      if (!feed || feed.shopId !== shop.id) {
        return json({ error: "Feed not found or unauthorized" }, { status: 403 });
      }

      await FeedRepository.updateFeed(feedId, {
        name,
        title: title || null,
        channel,
        language,
        country,
        currency,
        timezone,
        locationId: locationId || null,
        targetMarkets: [country],
        settings
      });

      // Update or create the daily schedule for this feed
      // This ensures the feed is regenerated once per day at 2 AM in its timezone
      await createOrUpdateFeedSchedule(feedId, {
        hourOfDay: 2,
        enabled: true
      });

      return redirect("/app/feeds");
    }

    // SECURITY: Check feed creation limit before allowing new feed
    const feedCheck = await canCreateFeed(request);

    if (!feedCheck.allowed) {
      return json({
        error: `Feed limit reached. You have ${feedCheck.currentCount} of ${feedCheck.maxAllowed} feeds on the ${feedCheck.plan.toUpperCase()} plan. Please upgrade to create more feeds.`
      }, { status: 403 });
    }

    const token = randomUUID();

    // Create feed with placeholder values first
    const feed = await FeedRepository.create({
      shopId: shop.id,
      name,
      title: title || null,
      channel,
      type: "products",
      language,
      country,
      currency,
      fileType: "xml",
      timezone,
      locationId: locationId || null,
      targetMarkets: [country],
      publicPath: "placeholder",
      publicUrl: "placeholder",
      token,
      settings
    });

    // Now update with the correct path and URL using the actual feed ID
    const publicPath = `${shop.id}/${feed.id}.xml`;

    // Generate the public URL using the same logic as s3.server.ts
    const cdnBase = process.env.FEED_CDN_BASE;
    let publicUrl = "";

    if (cdnBase) {
      publicUrl = `${cdnBase.replace(/\/$/, "")}/${publicPath}`;
    } else {
      // Fallback - will be updated when feed is generated
      publicUrl = `pending-generation`;
    }

    // Update the feed with correct path and URL, and set initial status to pending
    await FeedRepository.update(feed.id, {
      publicPath,
      publicUrl,
      status: "pending"
    });

    // Set up daily scheduled regeneration for this feed
    // This ensures the feed is regenerated once per day at 2 AM in its timezone
    await createOrUpdateFeedSchedule(feed.id, {
      hourOfDay: 2,
      enabled: true
    });

    // Automatically trigger feed generation after creation
    try {
      await enqueueFeedGeneration({
        feedId: feed.id,
        shopId: shop.id,
        shopDomain: shop.myshopifyDomain,
        accessToken: shop.accessToken,
        triggeredBy: "creation"
      });
      console.log(`Feed ${feed.id} creation complete, generation started`);
    } catch (error) {
      // Generation will fall back to synchronous processing if queue fails
      // This is expected in serverless environments without Redis
      console.warn(`Feed generation processing for ${feed.id}:`, error instanceof Error ? error.message : 'completed with fallback');
    }

    return redirect(`/app/feeds`);
  } catch (error) {
    console.error("Failed to save feed:", error);
    return json({ error: "Failed to save feed" }, { status: 500 });
  }
};

export default function NewFeed() {
  const actionData = useActionData<typeof action>();
  const { locales, locations, feed, isEdit } = useLoaderData<typeof loader>();

  return (
    <Page
        title={isEdit ? `Edit Feed: ${feed?.name}` : "Create New Feed"}
        breadcrumbs={[{ content: "Feeds", url: "/app/feeds" }]}
      >
        {actionData?.error && (
          <Layout>
            <Layout.Section>
              <Banner tone="critical" title="Error">
                {actionData.error}
              </Banner>
            </Layout.Section>
          </Layout>
        )}
        <EnhancedTabbedFeedForm
          locales={locales}
          locations={locations}
          feed={feed}
          isEdit={isEdit}
        />
      </Page>
  );
}


