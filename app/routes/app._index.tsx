import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, BlockStack, Text, Button, InlineStack } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function AppHome() {
  return (
    <Page title="Feed Manager">
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Manage your product feeds</Text>
                  <Text as="p" variant="bodyMd">Create, edit, and schedule product feeds for Google and other channels.</Text>
                  <InlineStack gap="300">
                    <Button url="/app/feeds" variant="primary">Go to Feeds</Button>
                    <Button url="/app/feeds/new">Create Feed</Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
  );
}
