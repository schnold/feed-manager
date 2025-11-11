import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAdminGraphqlClient } from "../services/shopify/admin.server";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  Box,
  Checkbox,
  TextField,
  List,
  Grid
} from "@shopify/polaris";
import { useState } from "react";
import { useLoaderData } from "@remix-run/react";
import { PLANS, getAllPlans } from "../config/plans.server";
import { ShopRepository } from "../db/repositories/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Check for error query params
  const url = new URL(request.url);
  const errorType = url.searchParams.get("error");
  
  // Get current shop to show their current plan
  const shop = await ShopRepository.findByDomain(session.shop);
  const currentPlan = shop?.plan || 'basic';
  
  // Transform plans for client (server-side only)
  const plansForClient = getAllPlans().map(plan => ({
    id: plan.id,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    features: plan.features
  }));
  
  return json({ currentPlan, errorType, plans: plansForClient });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;
  const discountCode = formData.get("discount_code") as string;

  if (!plan) {
    return json({ error: "No plan selected" }, { status: 400 });
  }

  // Parse plan details
  const [planName, interval] = plan.split(':');

  // Use centralized plan configuration
  const selectedPlan = PLANS[planName as keyof typeof PLANS];
  if (!selectedPlan) {
    return json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const price = interval === 'yearly' ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice;

  // Return URL - where merchant is redirected after approving/declining subscription
  // This handler verifies payment and updates the plan in database
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing-callback`;

  // Create subscription using GraphQL
  const client = getAdminGraphqlClient({
    shopDomain: session.shop,
    accessToken: admin.session.accessToken!
  });

  const mutation = `
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
        }
      }
    }
  `;

  const variables = {
    name: `${selectedPlan.name} Plan`,
    returnUrl,
    lineItems: [{
      plan: {
        appRecurringPricingDetails: {
          price: {
            amount: price,
            currencyCode: "EUR"
          },
          interval: interval === 'yearly' ? 'ANNUAL' : 'EVERY_30_DAYS'
        }
      }
    }],
    test: process.env.NODE_ENV !== 'production'
  };

  try {
    const response = await client.request(mutation, variables);

    if (response.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      console.error('Subscription creation errors:', response.data.appSubscriptionCreate.userErrors);
      return json({ error: "Failed to create subscription" }, { status: 400 });
    }

    const confirmationUrl = response.data?.appSubscriptionCreate?.confirmationUrl;
    if (confirmationUrl) {
      return redirect(confirmationUrl);
    }

    return json({ error: "Failed to get confirmation URL" }, { status: 500 });
  } catch (error) {
    console.error('GraphQL error:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

export default function ChoosePlan() {
  const { currentPlan, errorType, plans: plansFromLoader } = useLoaderData<typeof loader>();
  const [showYearly, setShowYearly] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string>(currentPlan);
  const [showErrorBanner, setShowErrorBanner] = useState(!!errorType);

  // Calculate original yearly prices (before 25% discount)
  const getOriginalYearlyPrice = (yearlyPrice: number) => {
    return Math.round((yearlyPrice / 0.75) * 100) / 100;
  };

  // Transform plans from loader data for display
  const plans = plansFromLoader.map(plan => ({
    id: plan.id,
    name: plan.name,
    price: showYearly ? plan.yearlyPrice : plan.monthlyPrice,
    originalYearlyPrice: getOriginalYearlyPrice(plan.yearlyPrice),
    interval: showYearly ? 'yearly' : 'monthly',
    features: plan.features,
    popular: plan.id === currentPlan
  }));

  return (
    <Page title="Choose Your Plan">
      <BlockStack gap="500">
        {/* Error banner */}
        {showErrorBanner && errorType === 'no_subscription' && (
          <Banner
            title="Subscription not activated"
            tone="warning"
            onDismiss={() => setShowErrorBanner(false)}
          >
            <p>
              The subscription was not activated. This can happen if payment was declined or if you closed the window. 
              Please try selecting a plan again.
            </p>
          </Banner>
        )}

        {showErrorBanner && errorType === 'payment_declined' && (
          <Banner
            title="Payment declined"
            tone="critical"
            onDismiss={() => setShowErrorBanner(false)}
          >
            <p>
              Your payment was declined. Please check your payment method and try again.
            </p>
          </Banner>
        )}

        <Box background="bg-surface" padding="400" borderRadius="300" minHeight="100%">
          <BlockStack gap="400">
            <Text as="h2" variant="heading2xl" alignment="center">Choose Your Plan</Text>

            <Box paddingBlockStart="200" paddingBlockEnd="200" textAlign="center">
              <Checkbox
                label="See yearly prices"
                checked={showYearly}
                onChange={setShowYearly}
              />
              {showYearly && (
                <Box paddingBlockStart="100">
                  <Text variant="bodySm" tone="success" fontWeight="bold">
                    🎉 Save up to 25% with yearly billing!
                  </Text>
                </Box>
              )}
            </Box>

            <Grid>
              {plans.map((plan) => (
                <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 4, lg: 4, xl: 4}} key={plan.id}>
                  <Box
                    onClick={() => setSelectedPlan(plan.id)}
                    borderColor={selectedPlan === plan.id ? "border-brand" : undefined}
                    borderWidth={selectedPlan === plan.id ? "base" : undefined}
                    borderRadius="200"
                    style={{ cursor: 'pointer' }}
                  >
                    <Card
                      background={plan.popular ? "bg-surface-secondary" : "bg-surface"}
                      minHeight="600px"
                    >
                      {plan.popular && (
                        <Box padding="200" textAlign="center" background="bg-success-subdued">
                          <Text variant="bodySm" fontWeight="bold" tone="success">Active Plan</Text>
                        </Box>
                      )}

                      <BlockStack gap="400" padding="400">
                        <Text as="h3" variant="headingLg" alignment="center">{plan.name}</Text>

                      <Box textAlign="center">
                        <Text variant="headingXs" tone="subdued">Billing: {plan.interval}</Text>
                        {showYearly ? (
                          <BlockStack gap="100" align="center">
                            <Text
                              variant="bodyMd"
                              tone="subdued"
                              style={{ textDecoration: 'line-through', opacity: 0.7 }}
                            >
                              €{plan.originalYearlyPrice} / year
                            </Text>
                            <Text as="p" variant="heading2xl" fontWeight="bold" tone="success">
                              €{plan.price} / year
                            </Text>
                            <Text variant="bodySm" tone="success" fontWeight="bold">
                              Save €{Math.round((plan.originalYearlyPrice - plan.price) * 100) / 100}
                            </Text>
                          </BlockStack>
                        ) : (
                          <Text as="p" variant="heading2xl" fontWeight="bold">
                            €{plan.price} / month
                          </Text>
                        )}
                      </Box>

                        <Text as="h4" variant="headingSm">Plan Features:</Text>

                        <List spacing="tight">
                          {plan.features.map((feature, index) => (
                            <List.Item key={index}>
                              <Text variant="bodyMd">{feature}</Text>
                            </List.Item>
                          ))}
                        </List>

                        <Box flexGrow="1" />

                        <BlockStack gap="200">
                          <form method="post">
                            <input type="hidden" name="plan" value={`${plan.id}:${plan.interval}`} />
                            <input type="hidden" name="discount_code" value={discountCode} />
                            <Button submit variant="primary" size="large" fullWidth>
                              Subscribe
                            </Button>
                          </form>

                          {plan.popular && (
                            <Button variant="secondary" size="medium" fullWidth tone="critical">
                              Cancel Subscription
                            </Button>
                          )}
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Box>
                </Grid.Cell>
              ))}

              <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 4, lg: 4, xl: 4}}>
                <Card minHeight="600px">
                  <BlockStack gap="400" padding="400">
                    <Text as="h3" variant="headingMd">Discount Code</Text>

                    <TextField
                      label="Enter discount code"
                      placeholder="e.g., SAVE20"
                      value={discountCode}
                      onChange={setDiscountCode}
                      autoComplete="off"
                    />

                    <Box flexGrow="1" />

                    <Button variant="secondary" size="medium" fullWidth>
                      Apply Code
                    </Button>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Box>
      </BlockStack>
    </Page>
  );
}
