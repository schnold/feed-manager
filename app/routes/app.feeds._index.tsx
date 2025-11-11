import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useFetcher, useNavigate, Form, useRevalidator } from "@remix-run/react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { FeedRepository } from "../db/repositories/feed.server";
import { deleteXmlFromS3 } from "../services/storage/s3.server";
import { enqueueFeedGeneration } from "../services/queue/feed-queue.server";
import { getCurrencyDisplay } from "../utils/currency";
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
  Icon,
  Link as PolarisLink
} from "@shopify/polaris";
import {
  ClipboardIcon,
  EditIcon,
  DeleteIcon,
  StatusActiveIcon,
  ClockIcon,
  AlertCircleIcon,
  RefreshIcon
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await ShopRepository.upsert({
    myshopifyDomain: session.shop,
    accessToken: session.accessToken
  });

  const feeds = await FeedRepository.findByShopId(shop.id);

  return json({ feeds, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
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
  const { feeds: initialFeeds } = useLoaderData<typeof loader>();
  const [feeds, setFeeds] = useState(initialFeeds);
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Use UTC methods to avoid timezone differences between server and client
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}:${seconds}`
    };
  };


  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return { type: "check-circle", tone: "success" };
      case "running":
      case "pending":
        return { type: "clock", tone: "info" };
      case "error":
        return { type: "alert-circle", tone: "critical" };
      case "idle":
      default:
        return { type: "clock", tone: "subdued" };
    }
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
        // You could add a toast notification here
        alert("Feed link copied to clipboard!");
      }
    } catch (error) {
      console.error("Failed to copy:", error);
      alert("Failed to copy feed link");
    }
  };

  const tableRows = feeds.map((feed: any, index: number) => {
    const lastUpdated = feed.updatedAt ? formatDate(feed.updatedAt) : null;
    const statusText = getStatusText(feed.status);
    const isGenerating = feed.status === "running" || feed.status === "pending";

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
        icon={ClipboardIcon}
        variant="plain"
      >
        Copy Link
      </Button>,
      // Last Updated column
      lastUpdated ? (
        <BlockStack gap="100" key={`updated-${feed.id}`}>
          <Text as="span" variant="bodySm">{lastUpdated.date}</Text>
          <Text as="span" variant="bodySm" tone="subdued">at {lastUpdated.time}</Text>
        </BlockStack>
      ) : (
        <Text as="span" tone="subdued" key={`updated-${feed.id}`}>-</Text>
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
      primaryAction={{
        content: "Create Feed",
        url: "/app/feeds/new"
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
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
                    'text'
                  ]}
                  headings={[
                    'Feed Name',
                    'Status',
                    'Feed Link',
                    'Last Updated',
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

            {feeds.length > 0 && (
              <Card>
                <Text as="p" variant="bodyMd">
                  You now have {feeds.length} feeds which is the maximum on your current plan.{' '}
                  <Link to="/app/choose-plan">Upgrade in order to add more feeds</Link>
                </Text>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


