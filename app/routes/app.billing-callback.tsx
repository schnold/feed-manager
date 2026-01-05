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
  const { admin, session, redirect: shopifyRedirect } = await authenticate.admin(request);

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (!chargeId) {
    console.error("[billing-callback] No charge_id provided in callback URL");
    return shopifyRedirect("/app/choose-plan?error=no_charge_id");
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
        id: `gid://shopify/AppSubscription/${chargeId}`,
      },
    });

    const data = await response.json() as any;

    if (data.errors || !data.data?.node) {
      console.error("[billing-callback] GraphQL errors or subscription not found:", data.errors || "No node data");
      return shopifyRedirect("/app/choose-plan?error=graphql_error");
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
      return shopifyRedirect("/app/choose-plan?error=subscription_not_active");
    }

    // SECURITY STEP 3: In production, ensure it's not a test subscription
    if (process.env.NODE_ENV === 'production' && subscription.test) {
      console.error("[billing-callback] Test subscription in production environment");
      return shopifyRedirect("/app/choose-plan?error=test_in_production");
    }

    // Extract pricing details
    const lineItem = subscription.lineItems?.[0];
    const pricingDetails = lineItem?.plan?.pricingDetails;

    if (!pricingDetails || !pricingDetails.price) {
      console.error("[billing-callback] No pricing details found");
      return shopifyRedirect("/app/choose-plan?error=no_pricing");
    }

    const price = parseFloat(pricingDetails.price.amount);
    const currencyCode = pricingDetails.price.currencyCode;
    const interval = pricingDetails.interval;

    // Extract plan ID from subscription name and price
    // The subscription name should match one of our plan names from shopify.server.ts
    console.log(`[billing-callback] Raw subscription data:`, {
      name: subscription.name,
      price: price,
      interval: interval,
      currencyCode: currencyCode
    });

    // Map price and interval to plan ID
    // This is more reliable than parsing the name
    let planId = 'basic'; // default fallback

    const isYearly = interval === 'ANNUAL';

    // Match based on price and interval
    if (!isYearly) {
      // Monthly plans
      if (price === 5) planId = 'base';
      else if (price === 14) planId = 'mid';
      else if (price === 21) planId = 'basic';
      else if (price === 27) planId = 'grow';
      else if (price === 59) planId = 'pro';
      else if (price === 134) planId = 'premium';
    } else {
      // Yearly plans
      if (price === 45) planId = 'base_yearly';
      else if (price === 126) planId = 'mid_yearly';
      else if (price === 189) planId = 'basic_yearly';
      else if (price === 243) planId = 'grow_yearly';
      else if (price === 531) planId = 'pro_yearly';
      else if (price === 1206) planId = 'premium_yearly';
    }

    console.log(`[billing-callback] Mapped to plan: ${planId} (price: ${price} ${currencyCode}, interval: ${interval})`);

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

    // SECURITY STEP 7: Update shop's plan and features
    const basePlanId = planId.replace('_yearly', '');
    const planFeatures = PLAN_FEATURES[basePlanId] || PLAN_FEATURES['basic'];

    console.log(`[billing-callback] Updating shop with plan: ${planId}, features:`, planFeatures);

    const updatedShop = await db.shop.update({
      where: { id: shop.id },
      data: {
        plan: planId,
        features: planFeatures
      } as any,
    });

    console.log(`[billing-callback] Shop updated successfully:`, {
      shopId: updatedShop.id,
      domain: updatedShop.myshopifyDomain,
      plan: updatedShop.plan,
      features: updatedShop.features
    });

    console.log(`[billing-callback] Successfully processed subscription for ${session.shop}. Plan: ${planId}`);

    // Redirect to main app (feeds page) using manual parameter preservation
    // This is safer than relying on shopifyRedirect when transitioning from Shopify Admin to App
    const redirectUrl = new URL(`${process.env.SHOPIFY_APP_URL}/app/feeds`);
    redirectUrl.searchParams.set("subscription", "success");

    // Preserve or fallback to session shop
    const shopParam = url.searchParams.get("shop") || session.shop;
    const hostParam = url.searchParams.get("host");

    if (shopParam) redirectUrl.searchParams.set("shop", shopParam);
    if (hostParam) redirectUrl.searchParams.set("host", hostParam);

    console.log(`[billing-callback] Redirecting to: ${redirectUrl.toString()}`);
    return redirect(redirectUrl.toString());

  } catch (error) {
    console.error("[billing-callback] Error processing billing callback:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[billing-callback] Error details:", errorMessage);

    const errorUrl = new URL("/app/choose-plan", process.env.SHOPIFY_APP_URL);
    errorUrl.searchParams.set("error", "callback_failed");
    const shopParam = url.searchParams.get("shop");
    const hostParam = url.searchParams.get("host");
    if (shopParam) errorUrl.searchParams.set("shop", shopParam);
    if (hostParam) errorUrl.searchParams.set("host", hostParam);

    return redirect(errorUrl.toString());
  }
};
