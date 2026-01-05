import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { FeedRepository } from "../db/repositories/feed.server";
import { deleteXmlFromS3 } from "../services/storage/s3.server";
import { enqueueFeedGeneration } from "../services/queue/feed-queue.server";
import { getCurrencyDisplay } from "../utils/currency";
import { requireActivePlan, getMaxFeedsForPlan } from "../services/shopify/subscription.server";
import { getNextScheduledRun } from "../services/scheduling/feed-scheduler.server";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  EmptyState,
  Spinner,
  Banner
} from "@shopify/polaris";
import {
  ClipboardIcon,
  EditIcon,
  DeleteIcon,
  RefreshIcon,
  CheckIcon
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // SECURITY: Require active subscription (minimum FREE plan)
  // Free plan allows 1 feed, custom apps can't use Billing API
  const subscription = await requireActivePlan(request, 'free');

  const { session } = await authenticate.admin(request);

  // Get existing shop (should already exist from OAuth/install)
  let shop = await ShopRepository.findByDomain(session.shop);

  if (!shop) {
    // Shop should exist from OAuth - if not, create with free plan
    console.warn(`[feeds._index] Shop ${session.shop} not found, creating with free plan`);
    shop = await ShopRepository.create({
      myshopifyDomain: session.shop,
      accessToken: session.accessToken,
      plan: 'free'
    });
  }

  const feeds = await FeedRepository.findByShopId(shop.id);
  const maxFeeds = getMaxFeedsForPlan(subscription.plan);
  const canCreateMoreFeeds = feeds.length < maxFeeds;

  // Add next scheduled run time for each feed
  const feedsWithSchedule = feeds.map((feed: any) => {
    const nextScheduledRun = getNextScheduledRun(feed.timezone, 2);
    return {
      ...feed,
      nextScheduledRun: nextScheduledRun.toISOString()
    };
  });

  return json({
    feeds: feedsWithSchedule,
    shop,
    maxFeeds,
    canCreateMoreFeeds,
    currentPlan: subscription.plan
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // SECURITY: Require active subscription (minimum FREE plan)
  await requireActivePlan(request, 'free');

  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const feedId = formData.get("feedId") as string;
  const action = formData.get("_action") as string;

  if (action === "delete" && feedId) {
    try {
      // Get the feed to verify ownership
      const feed = await FeedRepository.findById(feedId);
      if (!feed) {
        return json({ error: "Feed not found" }, { status: 404 });
      }

      // Get shop to verify ownership
      const shop = await ShopRepository.findByDomain(session.shop);
      if (!shop || feed.shopId !== shop.id) {
        return json({ error: "Unauthorized" }, { status: 403 });
      }

      // Delete the XML file from S3/R2 if it exists
      if (feed.publicPath && feed.publicPath !== "placeholder") {
        await deleteXmlFromS3(feed.publicPath);
      }

      // Delete the feed and all related data from database
      await FeedRepository.deleteWithRelations(feedId);

      return json({ success: true, message: "Feed deleted successfully" });
    } catch (error) {
      console.error("Error deleting feed:", error);
      return json({ error: "Failed to delete feed" }, { status: 500 });
    }
  }

  if (action === "regenerate" && feedId) {
    try {
      // Get the feed to verify ownership and get shop credentials
      const feed = await FeedRepository.findById(feedId);
      if (!feed) {
        return json({ error: "Feed not found" }, { status: 404 });
      }

      // Get shop to verify ownership
      const shop = await ShopRepository.findByDomain(session.shop);
      if (!shop || feed.shopId !== shop.id) {
        return json({ error: "Unauthorized" }, { status: 403 });
      }

      // Enqueue the generation job with the feed's existing settings
      await enqueueFeedGeneration({
        feedId: feed.id,
        shopId: feed.shopId,
        shopDomain: feed.shop.myshopifyDomain,
        accessToken: feed.shop.accessToken,
        triggeredBy: "manual-regenerate"
      });

      return json({ success: true, message: "Feed regeneration started" });
    } catch (error) {
      console.error("Error regenerating feed:", error);
      return json({ error: "Failed to regenerate feed" }, { status: 500 });
    }
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

export default function FeedsIndex() {
  const { feeds: initialFeeds, maxFeeds, canCreateMoreFeeds, currentPlan } = useLoaderData<typeof loader>();
  const [feeds, setFeeds] = useState(initialFeeds);
  const [copiedFeedId, setCopiedFeedId] = useState<string | null>(null);
  const fetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const regenerateFetcher = useFetcher();
  const revalidator = useRevalidator();

  // Poll for feed status updates every 5 seconds if any feed is running or pending
  useEffect(() => {
    const hasActiveFeeds = feeds.some((feed: any) =>
      feed.status === "running" || feed.status === "pending"
    );

    if (hasActiveFeeds) {
      const interval = setInterval(() => {
        fetcher.load("/app/feeds");
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [feeds, fetcher]);

  // Update feeds when fetcher returns new data
  useEffect(() => {
    if (fetcher.data?.feeds) {
      setFeeds(fetcher.data.feeds);
    }
  }, [fetcher.data]);

  // Handle delete success
  useEffect(() => {
    if (deleteFetcher.data?.success) {
      // Revalidate the loader data to get fresh feed list without full page reload
      revalidator.revalidate();
    } else if (deleteFetcher.data?.error) {
      if (typeof window !== 'undefined') {
        alert(`Error: ${deleteFetcher.data.error}`);
      }
    }
  }, [deleteFetcher.data, revalidator]);

  // Handle regenerate success
  useEffect(() => {
    if (regenerateFetcher.data?.success) {
      // Revalidate to show updated status
      revalidator.revalidate();
      if (typeof window !== 'undefined') {
        // Optional: Show success message
        console.log('Feed regeneration started');
      }
    } else if (regenerateFetcher.data?.error) {
      if (typeof window !== 'undefined') {
        alert(`Error: ${regenerateFetcher.data.error}`);
      }
    }
  }, [regenerateFetcher.data, revalidator]);

  // Update feeds when loader data changes
  useEffect(() => {
    setFeeds(initialFeeds);
  }, [initialFeeds]);

  const handleDeleteFeed = (feedId: string, feedName: string) => {
    if (confirm(`Are you sure you want to delete the feed "${feedName}"? This action cannot be undone.`)) {
      const formData = new FormData();
      formData.append("feedId", feedId);
      formData.append("_action", "delete");
      deleteFetcher.submit(formData, { method: "post" });
    }
  };

  const handleRegenerateFeed = (feedId: string) => {
    const formData = new FormData();
    formData.append("feedId", feedId);
    formData.append("_action", "regenerate");
    regenerateFetcher.submit(formData, { method: "post" });
  };

  const formatDate = (dateString: string, timezone?: string) => {
    const date = new Date(dateString);

    if (timezone) {
      // Format in the feed's timezone
      try {
        const dateInTZ = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
        const year = dateInTZ.getFullYear();
        const month = String(dateInTZ.getMonth() + 1).padStart(2, '0');
        const day = String(dateInTZ.getDate()).padStart(2, '0');
        const hours = String(dateInTZ.getHours()).padStart(2, '0');
        const minutes = String(dateInTZ.getMinutes()).padStart(2, '0');

        return {
          date: `${year}-${month}-${day}`,
          time: `${hours}:${minutes}`,
          timezone: timezone.split('/').pop() || timezone
        };
      } catch (e) {
        // Fallback to UTC if timezone is invalid
      }
    }

    // Use UTC methods as fallback
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
      timezone: 'UTC'
    };
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "success":
        return "Ready";
      case "running":
        return "Generating...";
      case "pending":
        return "Queued...";
      case "error":
        return "Error";
      case "idle":
      default:
        return "Idle";
    }
  };

  const copyFeedLink = async (feedId: string, publicUrl: string) => {
    try {
      // Build the full feed URL
      const feedUrl = publicUrl && publicUrl !== "pending-generation" && publicUrl !== "placeholder"
        ? publicUrl
        : `/feeds/${feedId}.xml`;

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(feedUrl);
        
        // Set the copied state for this specific feed
        setCopiedFeedId(feedId);
        
        // Reset the copied state after 2 seconds
        setTimeout(() => {
          setCopiedFeedId(null);
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to copy:", error);
      // You could add a toast notification here for errors
    }
  };

  const tableRows = feeds.map((feed: any, index: number) => {
    // Show last successful run time instead of general updatedAt
    const lastSuccessful = feed.lastSuccessAt ? formatDate(feed.lastSuccessAt, feed.timezone) : null;
    const nextScheduled = feed.nextScheduledRun ? formatDate(feed.nextScheduledRun, feed.timezone) : null;
    const statusText = getStatusText(feed.status);
    const isGenerating = feed.status === "running" || feed.status === "pending";
    const isCopied = copiedFeedId === feed.id;

    return [
      // Feed Name column
      <BlockStack gap="200" key={`name-${feed.id}`}>
        <Link to={`/app/feeds/new?feedId=${feed.id}`} style={{ textDecoration: 'none' }}>
          <Text as="span" fontWeight="semibold">{index + 1}. {feed.name}</Text>
        </Link>
        <InlineStack gap="200">
          <Badge>{feed.language?.toUpperCase() || 'EN'}</Badge>
          <Badge>{feed.country?.toUpperCase() || 'US'}</Badge>
          <Badge>{getCurrencyDisplay(feed.currency || 'USD', feed.country)}</Badge>
        </InlineStack>
      </BlockStack>,
      // Status column
      <InlineStack gap="200" blockAlign="center" key={`status-${feed.id}`}>
        <Badge tone={feed.status === "success" ? "success" : feed.status === "error" ? "critical" : "info"}>
          {statusText}
        </Badge>
        {isGenerating && <Spinner size="small" />}
      </InlineStack>,
      // Feed Link column
      <Button
        key={`link-${feed.id}`}
        onClick={() => copyFeedLink(feed.id, feed.publicUrl)}
        disabled={feed.status !== "success"}
        icon={isCopied ? CheckIcon : ClipboardIcon}
        variant="plain"
        tone={isCopied ? "success" : undefined}
      >
        {isCopied ? "Copied" : "Copy Link"}
      </Button>,
      // Last Successful Update column
      lastSuccessful ? (
        <BlockStack gap="100" key={`updated-${feed.id}`}>
          <Text as="span" variant="bodySm" fontWeight="semibold">Last: {lastSuccessful.date}</Text>
          <Text as="span" variant="bodySm" tone="subdued">{lastSuccessful.time} {lastSuccessful.timezone}</Text>
        </BlockStack>
      ) : (
        <Text as="span" tone="subdued" key={`updated-${feed.id}`}>Never</Text>
      ),
      // Next Scheduled Update column
      nextScheduled ? (
        <BlockStack gap="100" key={`scheduled-${feed.id}`}>
          <Text as="span" variant="bodySm" fontWeight="semibold">Next: {nextScheduled.date}</Text>
          <Text as="span" variant="bodySm" tone="subdued">{nextScheduled.time} {nextScheduled.timezone}</Text>
        </BlockStack>
      ) : (
        <Text as="span" tone="subdued" key={`scheduled-${feed.id}`}>-</Text>
      ),
      // Actions column
      <InlineStack gap="200" key={`actions-${feed.id}`}>
        <Button
          icon={RefreshIcon}
          variant="plain"
          onClick={() => handleRegenerateFeed(feed.id)}
          disabled={isGenerating}
          loading={regenerateFetcher.state === "submitting" && regenerateFetcher.formData?.get("feedId") === feed.id}
        >
          Regenerate
        </Button>
        <Link to={`/app/feeds/new?feedId=${feed.id}`}>
          <Button icon={EditIcon} variant="plain">Edit</Button>
        </Link>
        <Button
          icon={DeleteIcon}
          variant="plain"
          tone="critical"
          onClick={() => handleDeleteFeed(feed.id, feed.name)}
        >
          Delete
        </Button>
      </InlineStack>
    ];
  });

  return (
    <Page
      title="Feed Manager"
      primaryAction={
        canCreateMoreFeeds
          ? {
              content: "Create Feed",
              url: "/app/feeds/new"
            }
          : {
              content: "Upgrade Plan",
              url: "/app/choose-plan"
            }
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* SECURITY: Show upgrade banner when feed limit reached */}
            {!canCreateMoreFeeds && maxFeeds !== Infinity && (
              <Banner
                title="Feed Limit Reached"
                tone="warning"
                action={{
                  content: "Upgrade Plan",
                  url: "/app/choose-plan"
                }}
              >
                <Text as="p" variant="bodyMd">
                  You've reached the maximum of {maxFeeds} feeds on your {currentPlan.toUpperCase()} plan.
                  Upgrade to create more feeds and unlock additional features.
                </Text>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="p" variant="bodyMd">
                  Here you can manage your feeds, view progress and status. To use your feed, copy the feed link for use in any platform. Have any questions or need help? Contact us at hi@letsgolukas.com.
                </Text>
                <InlineStack gap="300">
                  <Button url="https://ondigital.io/contact/" target="_blank">
                    Contact us
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {feeds.length > 0 ? (
              <Card padding="0">
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text'
                  ]}
                  headings={[
                    'Feed Name',
                    'Status',
                    'Feed Link',
                    'Last Update',
                    'Next Scheduled',
                    'Actions'
                  ]}
                  rows={tableRows}
                />
              </Card>
            ) : (
              <Card>
                <EmptyState
                  heading="Create your first product feed"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" variant="bodyMd">
                    Generate XML feeds for Google Shopping and other channels to showcase your products across the web.
                  </Text>
                  <div style={{ marginTop: '1rem' }}>
                    <Button url="/app/feeds/new" variant="primary">
                      Create Feed
                    </Button>
                  </div>
                </EmptyState>
              </Card>
            )}

            {/* Feed usage information */}
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Feed Usage
                </Text>
                <Text as="p" variant="bodyMd">
                  You are using <Text as="span" fontWeight="semibold">{feeds.length}</Text> out of{' '}
                  {maxFeeds === Infinity ? (
                    <Text as="span" fontWeight="semibold">unlimited</Text>
                  ) : (
                    <Text as="span" fontWeight="semibold">{maxFeeds}</Text>
                  )}{' '}
                  feeds available on your current plan.
                </Text>
                {feeds.length >= maxFeeds && maxFeeds !== Infinity && (
                  <Text as="p" variant="bodyMd" tone="warning">
                    You've reached the maximum number of feeds for your plan.{' '}
                    <Link to="/app/choose-plan">Upgrade your plan</Link> to add more feeds.
                  </Text>
                )}
                {feeds.length < maxFeeds && maxFeeds !== Infinity && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    You can create {maxFeeds - feeds.length} more feed{maxFeeds - feeds.length !== 1 ? 's' : ''} on your current plan.
                  </Text>
                )}
                {maxFeeds === Infinity && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Your plan includes unlimited feeds.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


