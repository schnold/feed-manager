import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import * as plans from "../shopify.server";
import { shouldUseTestCharges } from "../services/shopify/billing.server";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  Box,
  Checkbox,
  Grid,
  Banner
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { useActionData, useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return json({
    // You can add current subscription info here if needed
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planKey = formData.get("plan") as string;

  // SECURITY: Validate plan key exists in our configuration
  const validPlanKeys = [
    plans.PLAN_BASE_MONTHLY,
    plans.PLAN_BASE_YEARLY,
    plans.PLAN_MID_MONTHLY,
    plans.PLAN_MID_YEARLY,
    plans.PLAN_BASIC_MONTHLY,
    plans.PLAN_BASIC_YEARLY,
    plans.PLAN_GROW_MONTHLY,
    plans.PLAN_GROW_YEARLY,
    plans.PLAN_PRO_MONTHLY,
    plans.PLAN_PRO_YEARLY,
    plans.PLAN_PREMIUM_MONTHLY,
    plans.PLAN_PREMIUM_YEARLY,
  ];

  if (!planKey || !validPlanKeys.includes(planKey)) {
    console.error(`[choose-plan] Invalid plan key received: ${planKey}`);
    return json({
      error: "Invalid plan selected",
      details: "The selected plan is not valid. Please choose a valid plan."
    }, { status: 400 });
  }

  // SECURITY: Use robust test mode detection that checks both environment and shop type
  const isTest = await shouldUseTestCharges(request);

  console.log(`[choose-plan] Creating subscription for shop ${session.shop}, plan: ${planKey}, test: ${isTest}`);

  try {
    // SECURITY: Use billing.request which validates against the billing config
    // This ensures the price and parameters can't be manipulated by the client
    await billing.request({
      plan: planKey,
      isTest: isTest,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing-callback`,
    });

    // billing.request() throws and redirects if successful
    // If we reach here, something went wrong
    return json({
      error: "Unexpected error",
      details: "Failed to initiate billing request"
    }, { status: 500 });

  } catch (error) {
    // billing.request() throws a Response object with redirect on success
    // If it's a Response, re-throw it (it's the redirect)
    if (error instanceof Response) {
      throw error;
    }

    // Otherwise, it's an actual error
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
  const loaderData = useLoaderData<typeof loader>();
  const [showYearly, setShowYearly] = useState(false);
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

  const planDefinitions = [
    {
      id: 'base',
      name: 'BASE',
      price: showYearly ? 45 : 5.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? plans.PLAN_BASE_YEARLY : plans.PLAN_BASE_MONTHLY,
      features: ['2 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'mid',
      name: 'MID',
      price: showYearly ? 126 : 14.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? plans.PLAN_MID_YEARLY : plans.PLAN_MID_MONTHLY,
      features: ['4 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'basic',
      name: 'BASIC',
      price: showYearly ? 189 : 21.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? plans.PLAN_BASIC_YEARLY : plans.PLAN_BASIC_MONTHLY,
      features: ['Up to 6 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'grow',
      name: 'GROW',
      price: showYearly ? 243 : 27.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? plans.PLAN_GROW_YEARLY : plans.PLAN_GROW_MONTHLY,
      features: ['8 feeds included', '1 scheduled update per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: true
    },
    {
      id: 'pro',
      name: 'PRO',
      price: showYearly ? 531 : 59.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? plans.PLAN_PRO_YEARLY : plans.PLAN_PRO_MONTHLY,
      features: ['Up to 20 feeds included', '4 scheduled updates per feed per day', 'Unlimited manual updates', 'Multi language', 'Multi currency', 'Feed rules & filters', 'Unlimited products', 'Unlimited orders'],
      popular: false
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      price: showYearly ? 1206 : 134.00,
      interval: showYearly ? 'yearly' : 'monthly',
      planKey: showYearly ? plans.PLAN_PREMIUM_YEARLY : plans.PLAN_PREMIUM_MONTHLY,
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
                    Save up to 25% with yearly billing!
                  </Text>
                </Box>
              )}
            </Box>

            <Grid>
              {planDefinitions.map((plan) => (
                <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 4, lg: 4, xl: 4}} key={plan.id}>
                  <Box
                    onClick={() => setSelectedPlan(plan.id)}
                    borderColor={selectedPlan === plan.id ? "border-brand" : undefined}
                    borderWidth={selectedPlan === plan.id ? "025" : undefined}
                    borderRadius="200"
                    style={{ cursor: 'pointer' }}
                  >
                    <Card
                      background={plan.popular ? "bg-surface-secondary" : "bg-surface"}
                    >
                      {plan.popular && (
                        <Box padding="200" textAlign="center" background="bg-success-subdued">
                          <Text variant="bodySm" fontWeight="bold" tone="success">Most Popular</Text>
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

                        <BlockStack gap="100">
                          {plan.features.map((feature, index) => (
                            <Text key={index} variant="bodyMd">• {feature}</Text>
                          ))}
                        </BlockStack>

                        <Box paddingBlockStart="200">
                          <form method="post">
                            <input type="hidden" name="plan" value={plan.planKey} />
                            <Button submit variant="primary" size="large" fullWidth>
                              Subscribe to {plan.name}
                            </Button>
                          </form>
                        </Box>
                      </BlockStack>
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
