import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, BlockStack, Text, Button, InlineStack, Banner } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function ChoosePlan() {
  return (
    <Page title="Choose Plan">
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <Banner status="info">
                <p>Upgrade your plan to create more feeds and access advanced features.</p>
              </Banner>
              
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Current Plan: Free</Text>
                  <Text as="p" variant="bodyMd">
                    You can create up to 3 feeds with basic features. Upgrade to unlock more feeds and advanced functionality.
                  </Text>
                  
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Free Plan Features:</Text>
                    <ul>
                      <li>Up to 3 feeds</li>
                      <li>Basic XML generation</li>
                      <li>Standard support</li>
                    </ul>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Pro Plan Features:</Text>
                    <ul>
                      <li>Unlimited feeds</li>
                      <li>Advanced XML generation</li>
                      <li>Custom field mapping</li>
                      <li>Priority support</li>
                      <li>Scheduled feed updates</li>
                    </ul>
                  </BlockStack>

                  <InlineStack gap="200">
                    <Button variant="primary" size="large">
                      Upgrade to Pro - $9.99/month
                    </Button>
                    <Button url="/app/feeds">
                      Back to Feeds
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
  );
}
