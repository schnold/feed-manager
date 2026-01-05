import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { shouldUseTestCharges } from "../services/shopify/billing.server";
import { FeedRepository } from "../db/repositories/feed.server";
import { ShopRepository } from "../db/repositories/shop.server";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  Box,
  Checkbox,
  Grid,
  Banner,
  InlineStack,
  Badge
} from "@shopify/polaris";
import { useState } from "react";
import { useActionData, useLoaderData, Form, useNavigation } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ShopRepository.findByDomain(session.shop);
  const feeds = shop ? await FeedRepository.findByShopId(shop.id) : [];

  return json({
    feedsCount: feeds.length,
    currentPlan: shop?.plan || 'free'
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planKey = formData.get("plan") as string;

  const validPlanKeys = [
    'base',
    'base_yearly',
    'mid',
    'mid_yearly',
    'basic',
    'basic_yearly',
    'grow',
    'grow_yearly',
    'pro',
    'pro_yearly',
    'premium',
    'premium_yearly',
  ];

  if (!planKey || !validPlanKeys.includes(planKey)) {
    console.error(`[choose-plan] Invalid plan key received: ${planKey}`);
    return json({
      error: "Invalid plan selected",
      details: "The selected plan is not valid. Please choose a valid plan."
    }, { status: 400 });
  }

  const isTest = await shouldUseTestCharges(request);

  console.log(`[choose-plan] Creating subscription for shop ${session.shop}, plan: ${planKey}, test: ${isTest}`);

  try {
    // billing.request() throws a redirect Response to Shopify's confirmation page
    // After approval, Shopify redirects back using the embedded app URL
    // Using host parameter to ensure proper embedded app redirect
    const url = new URL(request.url);
    const shop = session.shop;
    const host = url.searchParams.get("host");

    let returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing-callback`;
    if (shop) {
      returnUrl += `?shop=${shop}`;
      if (host) {
        returnUrl += `&host=${host}`;
      }
    }

    console.log(`[choose-plan] Using returnUrl: ${returnUrl}`);

    await billing.request({
      plan: planKey as any,
      isTest: isTest,
      returnUrl: returnUrl,
    });

    // This code is never reached because billing.request() always throws a redirect
    console.error('[choose-plan] UNEXPECTED: billing.request() did not throw redirect');
    return json({
      error: "Unexpected billing flow",
      details: "The billing request did not redirect as expected"
    }, { status: 500 });

  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error('[choose-plan] Error creating subscription:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json({
      error: "Failed to create subscription",
      details: errorMessage
    }, { status: 500 });
  }
};

export default function ChoosePlan() {
  const actionData = useActionData<typeof action>();
  const { currentPlan } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [showYearly, setShowYearly] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("grow");

  const isSubmitting = navigation.state === "submitting";

  const originalYearlyPrices: Record<string, number> = {
    base: 60,
    mid: 168,
    basic: 252,
    grow: 324,
    pro: 708,
    premium: 1608
  };

  const planDefinitions = [
    {
      id: 'base',
      name: 'BASE',
      price: showYearly ? 45 : 5.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? 'base_yearly' : 'base',
      features: ['2 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'mid',
      name: 'MID',
      price: showYearly ? 126 : 14.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? 'mid_yearly' : 'mid',
      features: ['4 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'basic',
      name: 'BASIC',
      price: showYearly ? 189 : 21.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? 'basic_yearly' : 'basic',
      features: ['Up to 6 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'grow',
      name: 'GROW',
      price: showYearly ? 243 : 27.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? 'grow_yearly' : 'grow',
      features: ['8 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: true
    },
    {
      id: 'pro',
      name: 'PRO',
      price: showYearly ? 531 : 59.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? 'pro_yearly' : 'pro',
      features: ['Up to 20 feeds included', '4 scheduled updates per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      price: showYearly ? 1206 : 134.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? 'premium_yearly' : 'premium',
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
        <Box background="bg-surface" padding="400" borderRadius="300">
          <BlockStack gap="400">
            <Text as="h2" variant="heading2xl" alignment="center">Choose Your Plan</Text>

            <Box paddingBlockStart="200" paddingBlockEnd="200">
              <BlockStack align="center">
                <Checkbox
                  label="See yearly prices"
                  checked={showYearly}
                  onChange={setShowYearly}
                />
                {showYearly && (
                  <Box paddingBlockStart="100">
                    <Text as="p" variant="bodySm" tone="success" fontWeight="bold">
                      Save up to 25% with yearly billing!
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Box>

            <Grid>
              {planDefinitions.map((plan) => (
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 4, xl: 4 }} key={plan.id}>
                  <Box
                    borderColor={selectedPlan === plan.id ? "border-brand" : "border"}
                    borderWidth="025"
                    borderRadius="200"
                  >
                    <Card
                      background={plan.popular ? "bg-surface-secondary" : "bg-surface"}
                    >
                      <button
                        onClick={() => setSelectedPlan(plan.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          width: '100%',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'block'
                        }}
                        type="button"
                      >
                        {plan.popular && (
                          <Box padding="200" background="bg-surface-success">
                            <Text as="p" variant="bodySm" fontWeight="bold" tone="success" alignment="center">Most Popular</Text>
                          </Box>
                        )}

                        <BlockStack gap="400">
                          <Box padding="400">
                            <BlockStack gap="400">
                              <Text as="h3" variant="headingLg" alignment="center">{plan.name}</Text>

                              <Box>
                                <BlockStack align="center">
                                  <Text as="p" variant="headingXs" tone="subdued">Billing: {plan.interval}</Text>
                                  {showYearly ? (
                                    <BlockStack gap="100" align="center">
                                      <Text
                                        as="p"
                                        variant="bodyMd"
                                        tone="subdued"
                                      >
                                        <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                                          €{originalYearlyPrices[plan.id]} / year
                                        </span>
                                      </Text>
                                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="success">
                                        €{plan.price} / year
                                      </Text>
                                      <Text as="p" variant="bodySm" tone="success" fontWeight="bold">
                                        Save €{originalYearlyPrices[plan.id] - plan.price}
                                      </Text>
                                    </BlockStack>
                                  ) : (
                                    <Text as="p" variant="heading2xl" fontWeight="bold" alignment="center">
                                      €{plan.price} / month
                                    </Text>
                                  )}
                                </BlockStack>
                              </Box>

                              <Text as="h4" variant="headingSm">Plan Features:</Text>

                              <BlockStack gap="100">
                                {plan.features.map((feature, index) => (
                                  <Text key={index} as="p" variant="bodyMd">• {feature}</Text>
                                ))}
                              </BlockStack>

                              {currentPlan === plan.planKey && (
                                <Badge tone="success">Current Plan</Badge>
                              )}
                            </BlockStack>
                          </Box>
                        </BlockStack>
                      </button>

                      <Box padding="400" paddingBlockStart="0">
                        <Form method="post">
                          <input type="hidden" name="plan" value={plan.planKey} />
                          <Button
                            submit
                            variant="primary"
                            size="large"
                            fullWidth
                            loading={isSubmitting && selectedPlan === plan.id}
                            disabled={isSubmitting}
                          >
                            {currentPlan === plan.planKey ? "Renew Plan" : `Subscribe to ${plan.name}`}
                          </Button>
                        </Form>
                      </Box>
                    </Card>
                  </Box>
                </Grid.Cell>
              ))}
            </Grid>
          </BlockStack>
        </Box>
      </BlockStack>
    </Page>
  );
}
