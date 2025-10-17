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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
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

  // Define plan pricing with 25% discount, rounded down
  const plans = {
    'base': { price: 5.00, name: 'BASE' },
    'mid': { price: 14.00, name: 'MID' },
    'grow': { price: 27.00, name: 'GROW' },
    'basic': { price: 21.00, name: 'BASIC' },
    'pro': { price: 59.00, name: 'PRO' },
    'premium': { price: 134.00, name: 'PREMIUM' }
  };

  const selectedPlan = plans[planName as keyof typeof plans];
  if (!selectedPlan) {
    return json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/feeds`;

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
            amount: selectedPlan.price,
            currencyCode: "USD"
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
  const [showYearly, setShowYearly] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string>("grow");

  const plans = [
    {
      id: 'base',
      name: 'BASE',
      price: showYearly ? 45 : 5.00, // €5 monthly, €45 yearly (25% discount)
      interval: showYearly ? 'yearly' : 'monthly',
      features: ['2 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'mid',
      name: 'MID',
      price: showYearly ? 126 : 14.00, // €14 monthly, €126 yearly (25% discount)
      interval: showYearly ? 'yearly' : 'monthly',
      features: ['4 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'basic',
      name: 'BASIC',
      price: showYearly ? 189 : 21.00, // €21 monthly, €189 yearly (25% discount)
      interval: showYearly ? 'yearly' : 'monthly',
      features: ['Up to 6 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'grow',
      name: 'GROW',
      price: showYearly ? 243 : 27.00, // €27 monthly, €243 yearly (25% discount)
      interval: showYearly ? 'yearly' : 'monthly',
      features: ['8 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: true
    },
    {
      id: 'pro',
      name: 'PRO',
      price: showYearly ? 531 : 59.00, // €59 monthly, €531 yearly (25% discount)
      interval: showYearly ? 'yearly' : 'monthly',
      features: ['Up to 20 feeds included', '4 scheduled updates per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      price: showYearly ? 1206 : 134.00, // €134 monthly, €1206 yearly (25% discount)
      interval: showYearly ? 'yearly' : 'monthly',
      features: ['Unlimited feeds included', '8 scheduled updates per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    }
  ];

  return (
    <Page title="Choose Your Plan">
      <BlockStack gap="500">
        <Box background="bg-surface" padding="400" borderRadius="300" minHeight="100%">
          <BlockStack gap="400">
            <Text as="h2" variant="heading2xl" alignment="center">Choose Your Plan</Text>

            <Box paddingBlockStart="200" paddingBlockEnd="200" textAlign="center">
              <Checkbox
                label="See yearly prices"
                checked={showYearly}
                onChange={setShowYearly}
              />
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
                          <Text as="p" variant="heading2xl" fontWeight="bold">
                            €{plan.price} / {plan.interval === 'yearly' ? 'year' : 'month'}
                          </Text>
                        </Box>

                        <Text as="h4" variant="headingSm">Plan Features:</Text>

                        <List spacing="tight">
                          {plan.features.map((feature, index) => (
                            <List.Item key={index}>
                              <Text variant="bodyMd">{feature}</Text>
                            </List.Item>
                          ))}
                        </List>

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
                    </Card>
                  </Box>
                </Grid.Cell>
              ))}

              <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 4, lg: 4, xl: 4}}>
                <Card>
                  <BlockStack gap="400" padding="400">
                    <Text as="h3" variant="headingMd">Discount Code</Text>

                    <TextField
                      label="Enter discount code"
                      placeholder="e.g., SAVE20"
                      value={discountCode}
                      onChange={setDiscountCode}
                      autoComplete="off"
                    />

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
