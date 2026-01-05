import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { PLAN_FEATURES } from "../services/shopify/subscription.server";

/**
 * SECURITY: This route handles the return from Shopify's billing confirmation page
 * It verifies the subscription was approved and saves it to the database
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Extract and preserve shop, host, and charge_id for App Bridge initialization after redirect
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const chargeId = url.searchParams.get("charge_id");

  console.log(`[billing-callback] Processing billing callback for shop: ${shopDomain}, host: ${host}, charge_id: ${chargeId}`);

  // Helper to build redirect URL with essential App Bridge parameters
  const getRedirectUrl = (path: string) => {
    const redirectUrl = new URL(path, process.env.SHOPIFY_APP_URL);
    if (shopDomain) redirectUrl.searchParams.set("shop", shopDomain);
    if (host) redirectUrl.searchParams.set("host", host);
    return redirectUrl.toString();
  };

  if (!chargeId) {
    console.error("[billing-callback] No charge_id provided in callback URL");
    return redirect(getRedirectUrl("/app/choose-plan?error=no_charge_id"));
  }

  try {
    // SECURITY STEP 1: Verify the subscription exists and get its details
    const query = `
      query getSubscription($id: ID!) {
        node(id: $id) {
          ... on AppSubscription {
            id
            name
            status
            test
            createdAt
            currentPeriodEnd
            trialDays
            lineItems {
              id
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                    interval
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: {
        id: chargeId,
      },
    });

    const data = await response.json() as any;

    if (data.errors || !data.data?.node) {
      console.error("[billing-callback] GraphQL errors or subscription not found:", data.errors || "No node data");
      return redirect(getRedirectUrl("/app/choose-plan?error=graphql_error"));
    }

    const subscription = data.data.node;

    console.log(`[billing-callback] Subscription details:`, {
      id: subscription.id,
      name: subscription.name,
      status: subscription.status,
      test: subscription.test,
    });

    // SECURITY STEP 2: Verify subscription is ACTIVE
    if (subscription.status !== "ACTIVE") {
      console.warn(`[billing-callback] Subscription ${chargeId} is not active. Status: ${subscription.status}`);
      return redirect(getRedirectUrl("/app/choose-plan?error=subscription_not_active"));
    }

    // SECURITY STEP 3: In production, ensure it's not a test subscription
    if (process.env.NODE_ENV === 'production' && subscription.test) {
      console.error("[billing-callback] Test subscription in production environment");
      return redirect(getRedirectUrl("/app/choose-plan?error=test_in_production"));
    }

    // Extract pricing details
    const lineItem = subscription.lineItems?.[0];
    const pricingDetails = lineItem?.plan?.pricingDetails;

    if (!pricingDetails || !pricingDetails.price) {
      console.error("[billing-callback] No pricing details found");
      return redirect(getRedirectUrl("/app/choose-plan?error=no_pricing"));
    }

    const price = parseFloat(pricingDetails.price.amount);
    const currencyCode = pricingDetails.price.currencyCode;
    const interval = pricingDetails.interval;

    // Extract plan ID from subscription name (e.g., "GROW Plan" -> "grow")
    const planMatch = subscription.name.match(/^(\w+)\s+Plan$/i);
    const planName = planMatch ? planMatch[1].toUpperCase() : 'BASIC';

    const planIdMap: Record<string, string> = {
      'BASE': 'base',
      'MID': 'mid',
      'BASIC': 'basic',
      'GROW': 'grow',
      'PRO': 'pro',
      'PREMIUM': 'premium'
    };

    let planId = planIdMap[planName] || 'basic';

    // Check if it's yearly based on name or metadata (if we had it)
    if (subscription.name.toUpperCase().includes('YEARLY') || interval === 'ANNUAL') {
      planId = `${planId}_yearly`;
    }

    console.log(`[billing-callback] Extracted plan info: ${planId}, interval: ${interval}, price: ${price} ${currencyCode}`);

    // SECURITY STEP 4: Find or create shop record
    let shop = await db.shop.findUnique({
      where: { myshopifyDomain: session.shop },
    });

    // SECURITY STEP 5: Calculate trial end date
    const trialEndsAt = subscription.trialDays
      ? new Date(Date.now() + subscription.trialDays * 24 * 60 * 60 * 1000)
      : null;

    if (!shop) {
      console.log(`[billing-callback] Creating new shop record for ${session.shop}`);
      shop = await db.shop.create({
        data: {
          myshopifyDomain: session.shop,
          accessToken: session.accessToken || "",
          plan: planId,
          features: PLAN_FEATURES[planId.replace('_yearly', '')] || PLAN_FEATURES['basic']
        },
      });
    }

    // SECURITY STEP 6: Save/update subscription in database
    const existingSubscription = await db.subscription.findUnique({
      where: { shopifySubscriptionId: subscription.id },
    });

    if (existingSubscription) {
      console.log(`[billing-callback] Updating existing subscription ${subscription.id}`);
      await db.subscription.update({
        where: { shopifySubscriptionId: subscription.id },
        data: {
          status: subscription.status,
          planId,
          billingInterval: interval,
          price,
          currencyCode,
          isTest: subscription.test || false,
          trialDays: subscription.trialDays,
          trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null,
        },
      });
    } else {
      console.log(`[billing-callback] Creating new subscription record for ${subscription.id}`);
      await db.subscription.create({
        data: {
          shopId: shop.id,
          shopifySubscriptionId: subscription.id,
          name: subscription.name,
          status: subscription.status,
          planId,
          billingInterval: interval,
          price,
          currencyCode,
          isTest: subscription.test || false,
          trialDays: subscription.trialDays,
          trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null,
        },
      });
    }

    // SECURITY STEP 7: Update shop's plan
    await db.shop.update({
      where: { id: shop.id },
      data: {
        plan: planId,
        features: PLAN_FEATURES[planId.replace('_yearly', '')] || PLAN_FEATURES['basic']
      } as any,
    });

    console.log(`[billing-callback] Successfully processed subscription for ${session.shop}. Plan: ${planId}`);

    // Redirect to main app (feeds page) with App Bridge params
    return redirect(getRedirectUrl("/app/feeds?subscription=success"));

  } catch (error) {
    console.error("[billing-callback] Error processing billing callback:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[billing-callback] Error details:", errorMessage);

    return redirect(getRedirectUrl("/app/choose-plan?error=callback_failed"));
  }
};
