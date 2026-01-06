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

    // Log the ENTIRE webhook payload to see what Shopify is sending
    console.log(`[webhook:app_subscriptions_update] 🔥 RAW WEBHOOK PAYLOAD:`, JSON.stringify(payload, null, 2));

    console.log(`[webhook:app_subscriptions_update] Subscription update:`, {
      id: subscription.admin_graphql_api_id,
      name: subscription.name,
      status: subscription.status,
      shop: shop,
      test: subscription.test,
      price: subscription.price,
      interval: subscription.interval,  // This is the actual field name
      billing_interval: subscription.billing_interval,
    });

    // Extract plan ID from subscription name and price
    // Shopify webhook sends name as lowercase (e.g., "base", "grow", "premium")
    // NOT as "BASE Plan" like we expected!
    const rawName = subscription.name?.toLowerCase() || 'basic';

    // Remove any " Plan" suffix if present, and get just the plan name
    const planName = rawName.replace(/\s+plan$/i, '').toUpperCase();

    // Extract pricing info if available
    const price = subscription.price ? parseFloat(subscription.price) : 0;
    const currencyCode = subscription.currency || 'EUR';

    // CRITICAL: Webhook uses "interval" field, NOT "billing_interval"!
    const intervalRaw = subscription.interval || 'every_30_days';
    const billingInterval = intervalRaw === 'annual' || intervalRaw.toLowerCase().includes('annual') ? 'ANNUAL' : 'EVERY_30_DAYS';
    const isYearly = billingInterval === 'ANNUAL';

    console.log(`[webhook:app_subscriptions_update] Subscription pricing:`, {
      price,
      billingInterval,
      isYearly,
      planName,
    });

    // Map plan name to plan ID, adding _yearly suffix if applicable
    const planIdMap: Record<string, string> = {
      'BASE': 'base',
      'MID': 'mid',
      'BASIC': 'basic',
      'GROW': 'grow',
      'PRO': 'pro',
      'PREMIUM': 'premium'
    };

    let planId = planIdMap[planName] || 'basic';

    // Add yearly suffix if this is an annual subscription
    if (isYearly) {
      planId = `${planId}_yearly`;
    }

    console.log(`[webhook:app_subscriptions_update] Mapped plan: ${planName} -> ${planId}`);

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

      // CRITICAL: Webhook doesn't include "test" field!
      // We need to check if shop is a development store, or check the subscription plan_handle
      // For now, we'll check if it's a development store based on the shop domain
      const isDevelopmentStore = shop.includes('myshopify.com');
      // In production, real charges should have isTest=false unless it's a dev store
      const isTest = isDevelopmentStore;

      // CRITICAL: Log the exact values we're about to save
      const webhookDataToSave = {
        shopId: shopRecord.id,
        shopifySubscriptionId: subscription.admin_graphql_api_id,
        name: subscription.name || `${planName} Plan`,
        status: subscription.status,
        planId: planId,
        billingInterval: billingInterval,
        price: price,
        currencyCode: currencyCode,
        isTest: isTest,  // Computed based on shop type
        trialDays: subscription.trial_days || 0,
        currentPeriodEnd: subscription.billing_on ? new Date(subscription.billing_on) : null,
        cancelledAt: subscription.status === 'CANCELLED' ? new Date() : null,
      };

      console.log(`[webhook:app_subscriptions_update] 🔥 DATA TO SAVE:`, JSON.stringify(webhookDataToSave, null, 2));
      console.log(`[webhook:app_subscriptions_update] 🔥 CRITICAL VALUES:`, {
        planId: planId,
        planIdType: typeof planId,
        isTest: subscription.test || false,
        isTestType: typeof (subscription.test || false),
        rawTest: subscription.test,
        rawTestType: typeof subscription.test,
      });

      if (existingSubscription) {
        console.log(`[webhook:app_subscriptions_update] Updating existing subscription: ${subscription.admin_graphql_api_id}`);

        const updated = await db.subscription.update({
          where: { shopifySubscriptionId: subscription.admin_graphql_api_id },
          data: {
            name: webhookDataToSave.name,
            status: webhookDataToSave.status,
            planId: webhookDataToSave.planId,
            billingInterval: webhookDataToSave.billingInterval,
            price: webhookDataToSave.price,
            currencyCode: webhookDataToSave.currencyCode,
            isTest: webhookDataToSave.isTest,
            trialDays: webhookDataToSave.trialDays,
            currentPeriodEnd: webhookDataToSave.currentPeriodEnd,
            cancelledAt: webhookDataToSave.cancelledAt,
          },
        });

        console.log(`[webhook:app_subscriptions_update] ✅ Updated in DB:`, {
          id: updated.id,
          shopId: updated.shopId,
          planId: updated.planId,
          name: updated.name,
          status: updated.status,
          isTest: updated.isTest,
        });
      } else {
        console.log(`[webhook:app_subscriptions_update] Creating new subscription: ${subscription.admin_graphql_api_id}`);

        const newSub = await db.subscription.create({
          data: webhookDataToSave,
        });

        console.log(`[webhook:app_subscriptions_update] ✅ Created in DB:`, {
          id: newSub.id,
          shopId: newSub.shopId,
          shopifySubscriptionId: newSub.shopifySubscriptionId,
          planId: newSub.planId,
          name: newSub.name,
          status: newSub.status,
          isTest: newSub.isTest,
          price: newSub.price,
          billingInterval: newSub.billingInterval,
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
