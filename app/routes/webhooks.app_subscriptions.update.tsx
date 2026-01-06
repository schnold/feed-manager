import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { PLAN_FEATURES } from "../services/shopify/subscription.server";

/**
 * SECURITY: Webhook handler for APP_SUBSCRIPTIONS_UPDATE
 * This keeps our database synchronized with Shopify's subscription state
 * Triggered when subscription status changes (ACTIVE, CANCELLED, EXPIRED, etc.)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // SECURITY: Shopify webhook authentication validates the webhook is legitimate
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`[webhook:app_subscriptions_update] Received webhook for shop: ${shop}, topic: ${topic}`);

    // Validate topic
    if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
      console.error(`[webhook:app_subscriptions_update] Invalid topic: ${topic}`);
      return new Response("Invalid webhook topic", { status: 400 });
    }

    // SECURITY: Validate payload structure
    if (!payload || !payload.app_subscription) {
      console.error("[webhook:app_subscriptions_update] Invalid webhook payload - missing app_subscription");
      return new Response("Invalid payload", { status: 400 });
    }

    const subscription = payload.app_subscription;

    console.log(`[webhook:app_subscriptions_update] Subscription update:`, {
      id: subscription.admin_graphql_api_id,
      name: subscription.name,
      status: subscription.status,
      shop: shop,
    });

    // Extract plan ID from subscription name
    const planMatch = subscription.name?.match(/^(\w+)\s+Plan$/i);
    const planName = planMatch ? planMatch[1].toUpperCase() : 'BASIC';

    const planIdMap: Record<string, string> = {
      'BASE': 'base',
      'MID': 'mid',
      'BASIC': 'basic',
      'GROW': 'grow',
      'PRO': 'pro',
      'PREMIUM': 'premium'
    };

    const planId = planIdMap[planName] || 'basic';

    // Find the shop
    const shopRecord = await db.shop.findUnique({
      where: { myshopifyDomain: shop },
    });

    if (!shopRecord) {
      console.error(`[webhook:app_subscriptions_update] Shop not found: ${shop}`);
      // Don't return error - shop might not be created yet, but log for debugging
      console.log(`[webhook:app_subscriptions_update] Creating shop record for: ${shop}`);

      // We can't create the shop here because we don't have the access token
      // Just log and return success - the subscription will be created when they authenticate
      return new Response("Shop not found - will sync on next auth", { status: 200 });
    }

    // SECURITY: Update or create subscription in database
    try {
      const existingSubscription = await db.subscription.findUnique({
        where: { shopifySubscriptionId: subscription.admin_graphql_api_id },
      });

      // Extract pricing info if available
      const price = subscription.price ? parseFloat(subscription.price) : 0;
      const currencyCode = subscription.currency || 'EUR';

      // Determine billing interval from subscription data
      const billingInterval = subscription.billing_interval === 'ANNUAL' ? 'ANNUAL' : 'EVERY_30_DAYS';

      if (existingSubscription) {
        console.log(`[webhook:app_subscriptions_update] Updating subscription: ${subscription.admin_graphql_api_id}`);

        await db.subscription.update({
          where: { shopifySubscriptionId: subscription.admin_graphql_api_id },
          data: {
            name: subscription.name || existingSubscription.name,
            status: subscription.status,
            planId,
            billingInterval,
            price,
            currencyCode,
            isTest: subscription.test || false,
            trialDays: subscription.trial_days,
            currentPeriodEnd: subscription.billing_on ? new Date(subscription.billing_on) : null,
            cancelledAt: subscription.status === 'CANCELLED' ? new Date() : null,
          },
        });
      } else {
        console.log(`[webhook:app_subscriptions_update] Creating subscription: ${subscription.admin_graphql_api_id}`);

        await db.subscription.create({
          data: {
            shopId: shopRecord.id,
            shopifySubscriptionId: subscription.admin_graphql_api_id,
            name: subscription.name || `${planName} Plan`,
            status: subscription.status,
            planId,
            billingInterval,
            price,
            currencyCode,
            isTest: subscription.test || false,
            trialDays: subscription.trial_days,
            currentPeriodEnd: subscription.billing_on ? new Date(subscription.billing_on) : null,
            cancelledAt: subscription.status === 'CANCELLED' ? new Date() : null,
          },
        });
      }

      // If subscription is ACTIVE, update shop's plan and features
      if (subscription.status === 'ACTIVE') {
        const basePlanId = planId.replace('_yearly', '');
        const planFeatures = PLAN_FEATURES[basePlanId] || PLAN_FEATURES['free'];

        console.log(`[webhook:app_subscriptions_update] Updating shop plan to: ${planId}, features:`, planFeatures);
        await db.shop.update({
          where: { id: shopRecord.id },
          data: {
            plan: planId,
            features: planFeatures
          },
        });
      }

      // If subscription is CANCELLED or EXPIRED, revert shop to free plan
      if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
        console.log(`[webhook:app_subscriptions_update] Subscription ${subscription.status}, reverting to free plan`);
        await db.shop.update({
          where: { id: shopRecord.id },
          data: {
            plan: 'free',
            features: PLAN_FEATURES['free']
          },
        });
      }

      console.log(`[webhook:app_subscriptions_update] Successfully processed subscription update for ${shop}`);
      return new Response("Webhook processed", { status: 200 });

    } catch (dbError) {
      console.error("[webhook:app_subscriptions_update] Database error:", dbError);
      return new Response("Database error", { status: 500 });
    }

  } catch (error) {
    // If authenticate.webhook() throws, it's likely an authentication failure
    console.error("[webhook:app_subscriptions_update] Webhook authentication error:", error);
    return new Response("Webhook authentication failed", { status: 401 });
  }
};
