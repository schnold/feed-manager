import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
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
  Grid,
  Banner
} from "@shopify/polaris";
import { useState } from "react";
import { useActionData } from "@remix-run/react";

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

  // Define plan pricing with 25% discount for yearly billing
  const plans = {
    'base': {
      monthly: 5.00,
      yearly: 45.00, // 25% discount from 60
      name: 'BASE'
    },
    'mid': {
      monthly: 14.00,
      yearly: 126.00, // 25% discount from 168
      name: 'MID'
    },
    'grow': {
      monthly: 27.00,
      yearly: 243.00, // 25% discount from 324
      name: 'GROW'
    },
    'basic': {
      monthly: 21.00,
      yearly: 189.00, // 25% discount from 252
      name: 'BASIC'
    },
    'pro': {
      monthly: 59.00,
      yearly: 531.00, // 25% discount from 708
      name: 'PRO'
    },
    'premium': {
      monthly: 134.00,
      yearly: 1206.00, // 25% discount from 1608
      name: 'PREMIUM'
    }
  };

  const selectedPlan = plans[planName as keyof typeof plans];
  if (!selectedPlan) {
    return json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const price = interval === 'yearly' ? selectedPlan.yearly : selectedPlan.monthly;

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/feeds`;

  // Create subscription using GraphQL
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
    const response = await admin.graphql(mutation, { variables });
    const jsonResponse = await response.json();

    // Check for GraphQL errors
    if (jsonResponse.errors) {
      console.error('GraphQL errors:', jsonResponse.errors);
      const errorMessage = jsonResponse.errors.map((e: any) => e.message).join(', ');
      return json({ 
        error: "Failed to create subscription",
        details: errorMessage
      }, { status: 400 });
    }

    // Check for user errors from the mutation
    if (jsonResponse.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const userErrors = jsonResponse.data.appSubscriptionCreate.userErrors;
      console.error('Subscription creation userErrors:', userErrors);
      const errorMessage = userErrors.map((e: any) => e.message).join(', ');
      return json({ 
        error: "Failed to create subscription",
        details: errorMessage
      }, { status: 400 });
    }

    // Check if we got a confirmation URL
    const confirmationUrl = jsonResponse.data?.appSubscriptionCreate?.confirmationUrl;
    if (confirmationUrl) {
      console.log('Subscription created successfully, redirecting to:', confirmationUrl);
      return redirect(confirmationUrl);
    }

    // If no confirmation URL and no errors, something unexpected happened
    console.error('No confirmation URL returned:', jsonResponse);
    return json({ 
      error: "Failed to get confirmation URL",
      details: "The subscription was created but no confirmation URL was returned"
    }, { status: 500 });
  } catch (error) {
    console.error('GraphQL error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json({ 
      error: "Internal server error",
      details: errorMessage
    }, { status: 500 });
  }
};

export default function ChoosePlan() {
  const actionData = useActionData<typeof action>();
  const [showYearly, setShowYearly] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string>("grow");

  // Original yearly prices before 25% discount
  const originalYearlyPrices = {
    base: 60,
    mid: 168,
    basic: 252,
    grow: 324,
    pro: 708,
    premium: 1608
  };

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
        {actionData?.error && (
          <Banner tone="critical" title={actionData.error}>
            {actionData.details && (
              <Text as="p" variant="bodyMd">
                {actionData.details}
              </Text>
            )}
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
                              €{originalYearlyPrices[plan.id as keyof typeof originalYearlyPrices]} / year
                            </Text>
                            <Text as="p" variant="heading2xl" fontWeight="bold" tone="success">
                              €{plan.price} / year
                            </Text>
                            <Text variant="bodySm" tone="success" fontWeight="bold">
                              Save €{originalYearlyPrices[plan.id as keyof typeof originalYearlyPrices] - plan.price}
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
