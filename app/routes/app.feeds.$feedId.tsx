import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { FeedRepository } from "../db/repositories/feed.server";
import {
  Page,
  Layout,
  Card,
  Tabs,
  Text,
  Badge,
  Button,
  TextField,
  Select,
  DataTable,
  EmptyState
} from "@shopify/polaris";
import { CustomFieldEditor } from "../components/CustomFieldEditor";
import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const feedId = params.feedId;
  if (!feedId) {
    throw new Response("Not Found", { status: 404 });
  }

  const feed = await FeedRepository.findById(feedId);
  if (!feed) {
    throw new Response("Not Found", { status: 404 });
  }

  // Include related data
  const feedWithData = await FeedRepository.findByIdWithRelations(feedId);
  
  return json({ feed: feedWithData });
};

export default function FeedEditor() {
  const { feed: initialFeed } = useLoaderData<typeof loader>();
  const [feed, setFeed] = useState(initialFeed);
  const [selectedTab, setSelectedTab] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const fetcher = useFetcher();

  // Poll for feed status updates when feed is running or pending
  useEffect(() => {
    if (feed.status === "running" || feed.status === "pending") {
      const interval = setInterval(() => {
        fetcher.load(`/app/feeds/${feed.id}`);
      }, 3000); // Poll every 3 seconds when generating

      return () => clearInterval(interval);
    }
  }, [feed.status, feed.id, fetcher]);

  // Update feed when fetcher returns new data
  useEffect(() => {
    if (fetcher.data?.feed) {
      setFeed(fetcher.data.feed);
      if (fetcher.data.feed.status !== "running") {
        setIsGenerating(false);
      }
    }
  }, [fetcher.data]);

  // Update feed when loader data changes
  useEffect(() => {
    setFeed(initialFeed);
  }, [initialFeed]);

  const handleTabChange = useCallback((selectedTabIndex: number) => {
    setSelectedTab(selectedTabIndex);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge status="success">Ready</Badge>;
      case "running":
        return <Badge status="attention">Generating...</Badge>;
      case "pending":
        return <Badge status="info">Queued...</Badge>;
      case "error":
        return <Badge status="critical">Error</Badge>;
      default:
        return <Badge>Idle</Badge>;
    }
  };

  const tabs = [
    { id: "info", content: "Feed info", accessibilityLabel: "Feed information", panelID: "feed-info-panel" },
    { id: "settings", content: "Settings", accessibilityLabel: "Feed settings", panelID: "feed-settings-panel" },
    { id: "mapping", content: "Mapping", accessibilityLabel: "Field mapping", panelID: "feed-mapping-panel" },
    { id: "filters", content: "Filters", accessibilityLabel: "Product filters", panelID: "feed-filters-panel" }
  ];

  const triggerGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/feeds/${feed.id}/generate`, { method: "POST" });
      const result = await response.json();

      if (result.ok) {
        // Update feed status to running immediately
        setFeed(prev => ({ ...prev, status: "running" }));
      } else {
        setIsGenerating(false);
        alert(`Error: ${result.error || "Failed to generate feed"}`);
      }

      return result;
    } catch (error) {
      setIsGenerating(false);
      alert("Failed to trigger feed generation");
      console.error(error);
    }
  };

  return (
    <Page
      title={`Feedmanager - Edit feed "${feed.name}"`}
      titleMetadata={getStatusBadge(feed.status)}
      breadcrumbs={[{ content: "Feeds", url: "/app/feeds" }]}
      primaryAction={{ content: "Save", onAction: () => {}, url: `/app/feeds/new?feedId=${feed.id}` }}
      secondaryActions={[
        { content: "Back", url: "/app/feeds" },
        { content: "Delete feed", destructive: true, onAction: () => {} },
        {
          content: isGenerating || feed.status === "running" || feed.status === "pending" ? "Generating..." : "Generate feed",
          onAction: triggerGenerate,
          loading: isGenerating || feed.status === "running" || feed.status === "pending",
          disabled: isGenerating || feed.status === "running" || feed.status === "pending"
        }
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
              {selectedTab === 0 && (
                <div style={{ padding: "16px 0" }}>
                  <InfoPanel feed={feed} />
                </div>
              )}
              {selectedTab === 1 && (
                <div style={{ padding: "16px 0" }}>
                  <SettingsPanel feed={feed} />
                </div>
              )}
              {selectedTab === 2 && (
                <div style={{ padding: "16px 0" }}>
                  <MappingPanel feed={feed} />
                </div>
              )}
              {selectedTab === 3 && (
                <div style={{ padding: "16px 0" }}>
                  <FiltersPanel feed={feed} />
                </div>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function InfoPanel({ feed }: { feed: any }) {
  const targetMarketDisplay = Array.isArray(feed.targetMarkets)
    ? feed.targetMarkets.join(" + ")
    : feed.targetMarkets || "Not specified";

  const scheduleCount = feed.schedules?.length || 0;

  const feedUrl = feed.publicUrl && feed.publicUrl !== "pending-generation" && feed.publicUrl !== "placeholder"
    ? feed.publicUrl
    : feed.status === "success"
    ? `/feeds/${feed.id}.xml`
    : "Not yet generated";

  const copyFeedUrl = async () => {
    if (feedUrl !== "Not yet generated") {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(feedUrl);
          alert("Feed URL copied to clipboard!");
        }
      } catch (error) {
        console.error("Failed to copy:", error);
        alert("Failed to copy feed URL");
      }
    }
  };

  return (
    <Layout>
      <Layout.Section oneHalf>
        <Card>
          <div style={{ padding: "16px" }}>
            <Text variant="headingSm" as="h3" style={{ marginBottom: "16px" }}>Feed Summary</Text>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Name:</td><td style={{ padding: "4px 0" }}>{feed.name}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Channel:</td><td style={{ padding: "4px 0" }}>{feed.channel}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Feed type:</td><td style={{ padding: "4px 0" }}>{feed.type || "Products"}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Target market:</td><td style={{ padding: "4px 0" }}>{targetMarketDisplay}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Language:</td><td style={{ padding: "4px 0" }}>{feed.language?.toUpperCase()}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Country:</td><td style={{ padding: "4px 0" }}>{feed.country?.toUpperCase()}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Currency:</td><td style={{ padding: "4px 0" }}>{feed.currency}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>File type:</td><td style={{ padding: "4px 0" }}>{feed.fileType}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Timezone:</td><td style={{ padding: "4px 0" }}>{feed.timezone}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Schedules:</td><td style={{ padding: "4px 0" }}>{scheduleCount}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Products:</td><td style={{ padding: "4px 0" }}>{feed.productCount || 0}</td></tr>
                <tr><td style={{ padding: "4px 0", fontWeight: "500" }}>Variants:</td><td style={{ padding: "4px 0" }}>{feed.variantCount || 0}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </Layout.Section>
      <Layout.Section oneHalf>
        <Card>
          <div style={{ padding: "16px" }}>
            <Text variant="headingSm" as="h3" style={{ marginBottom: "16px" }}>Feed URL</Text>
            {feedUrl !== "Not yet generated" ? (
              <>
                <TextField
                  label="Feed URL"
                  value={feedUrl}
                  readOnly
                  autoComplete="off"
                  connectedRight={
                    <Button onClick={copyFeedUrl}>Copy</Button>
                  }
                />
                <Text as="p" tone="subdued" style={{ marginTop: "12px" }}>
                  Use this URL in Google Merchant Center, Facebook Catalog, or other platforms.
                </Text>
              </>
            ) : (
              <Text as="p" tone="subdued">
                Click "Manually update feed" to generate your feed and get the URL.
              </Text>
            )}
          </div>
        </Card>
        <div style={{ marginTop: "16px" }}>
          <Card>
            <div style={{ padding: "16px" }}>
              <Text variant="headingSm" as="h3" style={{ marginBottom: "16px" }}>Help</Text>
              <Text as="p">Need help adding a new feed? Contact us at hello@ondigital.io</Text>
            </div>
          </Card>
        </div>
      </Layout.Section>
    </Layout>
  );
}

function SettingsPanel({ feed }: { feed: any }) {
  const [formData, setFormData] = useState({
    name: feed.name || '',
    channel: feed.channel || 'google',
    type: feed.type || 'products',
    targetMarkets: feed.targetMarkets || [],
    language: feed.language || 'en',
    country: feed.country || 'US',
    currency: feed.currency || 'USD',
    fileType: feed.fileType || 'xml',
    timezone: feed.timezone || 'UTC'
  });
  
  const channelOptions = [
    { label: 'Google Ads / Shopping', value: 'google' },
    { label: 'Pinterest Ads', value: 'pinterest' },
    { label: 'TikTok Ads', value: 'tiktok' },
    { label: 'Meta Ads / Facebook Ads', value: 'meta' },
    { label: 'Custom', value: 'custom' }
  ];
  
  const typeOptions = [
    { label: 'Products', value: 'products' }
  ];
  
  const languageOptions = [
    { label: 'English', value: 'en' },
    { label: 'German', value: 'de' },
    { label: 'French', value: 'fr' },
    { label: 'Spanish', value: 'es' },
    { label: 'Italian', value: 'it' },
    { label: 'Swedish', value: 'sv' },
    { label: 'Polish', value: 'pl' }
  ];
  
  const countryOptions = [
    { label: 'Australia | AU', value: 'AU' },
    { label: 'United States | US', value: 'US' },
    { label: 'Germany | DE', value: 'DE' },
    { label: 'France | FR', value: 'FR' },
    { label: 'Spain | ES', value: 'ES' },
    { label: 'Italy | IT', value: 'IT' },
    { label: 'Sweden | SE', value: 'SE' },
    { label: 'Poland | PL', value: 'PL' },
    { label: 'United Kingdom | GB', value: 'GB' }
  ];
  
  const currencyOptions = [
    { label: 'Local currency', value: 'local' },
    { label: 'USD', value: 'USD' },
    { label: 'EUR', value: 'EUR' },
    { label: 'GBP', value: 'GBP' },
    { label: 'AUD', value: 'AUD' }
  ];
  
  return (
    <Layout>
      <Layout.Section>
        <Card>
          <div style={{ padding: "16px" }}>
            <Text variant="headingSm" as="h3" style={{ marginBottom: "16px" }}>Basic Settings</Text>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <TextField
                label="Feed Name"
                value={formData.name}
                onChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                placeholder="eg. Google shopping DE"
              />
              <Select
                label="Select channel"
                options={channelOptions}
                value={formData.channel}
                onChange={(value) => setFormData(prev => ({ ...prev, channel: value }))}
              />
              <Select
                label="Select feed type"
                options={typeOptions}
                value={formData.type}
                onChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
              />
              <TextField
                label="Target market"
                value={Array.isArray(formData.targetMarkets) ? formData.targetMarkets.join(' + ') : formData.targetMarkets}
                onChange={(value) => setFormData(prev => ({ ...prev, targetMarkets: value.split(' + ') }))}
                placeholder="North America + Oceania + Singapore"
              />
              <Select
                label="Feed language"
                options={languageOptions}
                value={formData.language}
                onChange={(value) => setFormData(prev => ({ ...prev, language: value }))}
              />
              <Select
                label="Target country"
                options={countryOptions}
                value={formData.country}
                onChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
              />
              <Select
                label="Currency"
                options={currencyOptions}
                value={formData.currency}
                onChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
              />
              <Select
                label="File type"
                options={[{ label: 'XML', value: 'xml' }]}
                value={formData.fileType}
                onChange={(value) => setFormData(prev => ({ ...prev, fileType: value }))}
              />
              <TextField
                label="Timezone"
                value={formData.timezone}
                onChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}
                placeholder="Australia/Melbourne"
              />
            </div>
          </div>
        </Card>
      </Layout.Section>
    </Layout>
  );
}

function MappingPanel({ feed }: { feed: any }) {
  const [customFields, setCustomFields] = useState([]);
  
  const defaultMappings = [
    { column: 'id', how: 'From shopify field', field: 'Variant ID' },
    { column: 'item_group_id', how: 'From shopify field', field: 'Product ID' },
    { column: 'title', how: 'From shopify field', field: 'Title' },
    { column: 'description', how: 'From shopify field', field: 'Description' },
    { column: 'link', how: 'From shopify field', field: 'Link' },
    { column: 'image_link', how: 'From shopify field', field: 'Featured image' },
    { column: 'availability', how: 'From shopify field', field: 'Availability' },
    { column: 'price', how: 'From shopify field', field: 'Compare at price' },
    { column: 'sale_price', how: 'Feed rule', field: '' },
    { column: 'google_product_category', how: 'From shopify field', field: 'Category' },
    { column: 'product_type', how: 'From shopify field', field: 'Product type' },
    { column: 'brand', how: 'From shopify field', field: 'Vendor' },
    { column: 'gtin', how: 'From shopify field', field: 'Barcode' },
    { column: 'mpn', how: 'From shopify field', field: 'SKU' },
    { column: 'identifier_exists', how: 'Feed rule', field: '' },
    { column: 'condition', how: 'Set to value', field: 'new' }
  ];
  
  const mappingRows = defaultMappings.map(mapping => [
    mapping.column,
    mapping.how,
    mapping.field
  ]);

  const handleCustomFieldsChange = useCallback((fields: any[]) => {
    setCustomFields(fields);
  }, []);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <Text variant="headingSm" as="h3" style={{ marginBottom: "8px" }}>Feed mappings</Text>
        <Text as="p" color="subdued" style={{ marginBottom: "16px" }}>
          In this step, you can adjust your feed mappings and the feed rules. In the next step ( Filters ), you can choose whether you want to include all products or filter on certain rules.
        </Text>
        
        <DataTable
          columnContentTypes={['text', 'text', 'text']}
          headings={['Column name', 'How', 'Field']}
          rows={mappingRows}
        />
        
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button variant="secondary">+Add field</Button>
          <div style={{ display: "flex", gap: "12px" }}>
            <Button variant="primary">Save</Button>
            <Button variant="secondary">Filters</Button>
          </div>
        </div>
      </div>

      <CustomFieldEditor
        existingFields={customFields}
        onFieldsChange={handleCustomFieldsChange}
      />
    </div>
  );
}

function FiltersPanel({ feed }: { feed: any }) {
  const [matchType, setMatchType] = useState('all');
  
  return (
    <div>
      <Text variant="headingSm" as="h3" style={{ marginBottom: "16px" }}>Step 4: Filters</Text>
      <Text as="p" style={{ marginBottom: "16px" }}>
        Here you can add filters to include or exclude products from your feed.
      </Text>
      
      <div style={{ marginBottom: "24px" }}>
        <Text as="p" style={{ marginBottom: "8px" }}>Products must match:</Text>
        <div style={{ display: "flex", gap: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input 
              type="radio" 
              name="matchType" 
              value="all" 
              checked={matchType === 'all'}
              onChange={(e) => setMatchType(e.target.value)}
            />
            <Text as="span">all conditions</Text>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input 
              type="radio" 
              name="matchType" 
              value="any" 
              checked={matchType === 'any'}
              onChange={(e) => setMatchType(e.target.value)}
            />
            <Text as="span">any condition</Text>
          </label>
        </div>
      </div>
      
      {feed.filters && feed.filters.length > 0 ? (
        <div>
          <Text variant="bodyMd" as="h4" style={{ marginBottom: "12px" }}>Active Filters:</Text>
          {feed.filters.map((filter: any) => (
            <Card key={filter.id} sectioned>
              <Text as="p">
                <strong>{filter.scope}</strong> {filter.field} {filter.operator} "{filter.value}"
              </Text>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          heading="No filters configured"
          image=""
        >
          <Text as="p">All products will be included in your feed.</Text>
        </EmptyState>
      )}
    </div>
  );
}

function SchedulesPanel({ feed }: { feed: any }) {
  return (
    <div>
      <Text variant="headingSm" as="h3">Generation Schedules</Text>
      <Text as="p" color="subdued" tone="subdued">Automatically regenerate your feed on a schedule.</Text>
      <div style={{ marginTop: "16px" }}>
        {feed.schedules.length > 0 ? (
          <div>
            {feed.schedules.map((schedule: any) => (
              <div key={schedule.id} style={{ padding: "8px", border: "1px solid #e1e1e1", marginBottom: "8px" }}>
                <Text as="p"><strong>Cron:</strong> {schedule.cron} - {schedule.enabled ? "Enabled" : "Disabled"}</Text>
              </div>
            ))}
          </div>
        ) : (
          <Text as="p" color="subdued" tone="subdued">No schedules configured. Feed will only regenerate manually or via webhooks.</Text>
        )}
      </div>
    </div>
  );
}


