import { authenticate } from "../../shopify.server";
import db from "../../db.server";

export interface SubscriptionInfo {
  plan: string;
  status: string;
  name: string;
  isTest: boolean;
  trialEndsAt: Date | null;
  features: any;
}

export const PLAN_FEATURES: Record<string, any> = {
  'free': {
    maxFeeds: 1,
    maxScheduledUpdates: 0,
    features: ['1 feed included', 'Manual updates only']
  },
  'base': {
    maxFeeds: 2,
    maxScheduledUpdates: 1,
    features: ['2 feeds included', '1 scheduled update per day']
  },
  'mid': {
    maxFeeds: 4,
    maxScheduledUpdates: 1,
    features: ['4 feeds included', '1 scheduled update per day']
  },
  'basic': {
    maxFeeds: 6,
    maxScheduledUpdates: 1,
    features: ['6 feeds included', '1 scheduled update per day']
  },
  'grow': {
    maxFeeds: 8,
    maxScheduledUpdates: 1,
    features: ['8 feeds included', '1 scheduled update per day']
  },
  'pro': {
    maxFeeds: 20,
    maxScheduledUpdates: 4,
    features: ['20 feeds included', '4 scheduled updates per day']
  },
  'premium': {
    maxFeeds: Infinity,
    maxScheduledUpdates: 8,
    features: ['Unlimited feeds included', '8 scheduled updates per day']
  }
};

/**
 * SECURITY: Get the current active subscription for the shop from database
 * This is faster and more reliable than querying Shopify API each time
 */
export async function getCurrentSubscription(request: Request): Promise<SubscriptionInfo | null> {
  try {
    const { session } = await authenticate.admin(request);

    // Get shop and active subscription from database
    const shop = await db.shop.findUnique({
      where: { myshopifyDomain: session.shop },
      include: {
        subscriptions: {
          where: {
            status: 'ACTIVE',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!shop || shop.subscriptions.length === 0) {
      console.log(`[subscription] No active subscription found for ${session.shop}`);
      return null;
    }

    const subscription = shop.subscriptions[0];

    return {
      plan: subscription.planId,
      status: subscription.status,
      name: subscription.name,
      isTest: subscription.isTest,
      trialEndsAt: subscription.trialEndsAt,
      features: shop.features || PLAN_FEATURES[subscription.planId] || PLAN_FEATURES['free']
    };
  } catch (error) {
    console.error("[subscription] Error fetching subscription:", error);
    return null;
  }
}

/**
 * SECURITY: Require an active subscription with minimum plan level
 * For custom apps (SingleMerchant), always returns free tier
 * Throws a Response if requirements are not met
 */
export async function requireActivePlan(
  request: Request,
  minPlan: string = 'base'
): Promise<SubscriptionInfo> {
  const { session } = await authenticate.admin(request);

  // Get subscription from database
  let shop = await db.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: {
      subscriptions: {
        where: {
          status: 'ACTIVE',
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
  });

  if (!shop) {
    // Shop doesn't exist yet - create it with free plan (first install)
    console.log(`[subscription] Shop not found: ${session.shop}, creating with free plan`);
    shop = await db.shop.create({
      data: {
        myshopifyDomain: session.shop,
        accessToken: session.accessToken || '',
        plan: 'free',
        features: PLAN_FEATURES['free']
      },
      include: {
        subscriptions: true
      }
    });
    console.log(`[subscription] Created new shop: ${session.shop}`);
  }

  // For custom apps, if no subscription exists, return free tier (1 feed limit)
  // Custom apps cannot use Shopify Billing API
  if (shop.subscriptions.length === 0) {
    console.log(`[subscription] No active subscription for ${session.shop}, using free tier`);

    // Update shop with free plan if not set
    if (!shop.plan || shop.plan === 'basic') {
      await db.shop.update({
        where: { id: shop.id },
        data: { plan: 'free' },
      });
    }

    return {
      plan: 'free',
      status: 'ACTIVE',
      name: 'Free Plan',
      isTest: false,
      trialEndsAt: null,
      features: PLAN_FEATURES['free']
    };
  }

  const subscription = shop.subscriptions[0];

  // Verify plan meets minimum requirements
  const planHierarchy = ['free', 'base', 'mid', 'basic', 'grow', 'pro', 'premium'];
  const currentPlanIndex = planHierarchy.indexOf(subscription.planId);
  const requiredPlanIndex = planHierarchy.indexOf(minPlan);

  if (currentPlanIndex < requiredPlanIndex) {
    console.log(`[subscription] Plan upgrade required. Current: ${subscription.planId}, Required: ${minPlan}`);
    throw new Response("Plan upgrade required", {
      status: 403,
      headers: {
        "X-Shopify-Redirect": "/app/choose-plan",
      },
    });
  }

  // NOTE: Test subscriptions are allowed and normal for development stores
  // Shopify automatically uses test mode for dev stores - no real charges are made
  if (subscription.isTest) {
    console.log(`[subscription] Test subscription detected for ${session.shop} (development store)`);
  }

  return {
    plan: subscription.planId,
    status: subscription.status,
    name: subscription.name,
    isTest: subscription.isTest,
    trialEndsAt: subscription.trialEndsAt,
    features: shop.features || PLAN_FEATURES[subscription.planId] || PLAN_FEATURES['free']
  };
}

/**
 * SECURITY: Check if shop can create more feeds based on their plan
 */
export async function canCreateFeed(request: Request): Promise<{ allowed: boolean; currentCount: number; maxAllowed: number; plan: string }> {
  const { session } = await authenticate.admin(request);

  let shop = await db.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: {
      feeds: true,
      subscriptions: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!shop) {
    // Shop doesn't exist yet - create it with free plan (first install)
    console.log(`[canCreateFeed] Shop not found: ${session.shop}, creating with free plan`);
    shop = await db.shop.create({
      data: {
        myshopifyDomain: session.shop,
        accessToken: session.accessToken || '',
        plan: 'free',
        features: PLAN_FEATURES['free']
      },
      include: {
        feeds: true,
        subscriptions: true
      }
    });
  }

  const plan = shop.subscriptions[0]?.planId || shop.plan || 'free';
  const features = shop.features as any;
  const maxAllowed = features?.maxFeeds ?? getMaxFeedsForPlan(plan);
  const currentCount = shop.feeds.length;

  console.log(`[canCreateFeed] Shop ${session.shop}:`, {
    plan,
    shopPlan: shop.plan,
    subscriptionPlan: shop.subscriptions[0]?.planId,
    features,
    maxAllowed,
    currentCount,
    allowed: currentCount < maxAllowed
  });

  return {
    allowed: currentCount < maxAllowed,
    currentCount,
    maxAllowed,
    plan,
  };
}

/**
 * Get the maximum number of feeds allowed for a plan
 */
export function getMaxFeedsForPlan(plan: string): number {
  return PLAN_FEATURES[plan]?.maxFeeds || PLAN_FEATURES['free'].maxFeeds;
}

/**
 * Get the maximum number of scheduled updates per day for a plan
 */
export function getMaxScheduledUpdatesForPlan(plan: string): number {
  return PLAN_FEATURES[plan]?.maxScheduledUpdates || PLAN_FEATURES['free'].maxScheduledUpdates;
}

/**
 * SECURITY: Verify a subscription from Shopify GraphQL API
 * Use this for critical operations or when webhook sync might be delayed
 */
export async function verifySubscriptionFromShopify(
  request: Request,
  subscriptionId: string
): Promise<{ valid: boolean; status: string; isTest: boolean }> {
  const { admin } = await authenticate.admin(request);

  const query = `
    query getSubscription($id: ID!) {
      node(id: $id) {
        ... on AppSubscription {
          id
          status
          test
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: { id: subscriptionId },
    });

    const data = await response.json() as any;

    if (data.errors || !data.data?.node) {
      return { valid: false, status: 'UNKNOWN', isTest: false };
    }

    const subscription = data.data.node;

    return {
      valid: subscription.status === 'ACTIVE',
      status: subscription.status,
      isTest: subscription.test || false,
    };
  } catch (error) {
    console.error("[subscription] Error verifying subscription from Shopify:", error);
    return { valid: false, status: 'ERROR', isTest: false };
  }
}

/**
 * CRITICAL: Sync subscription from Shopify after billing approval
 * This is the state-of-the-art approach per Shopify MCP documentation
 * Uses billing.check() instead of custom callback routes
 */
export async function syncSubscriptionFromShopify(
  shopDomain: string,
  billing: any,
  admin: any
): Promise<void> {
  console.log(`[syncSubscription] 🔥 Starting subscription sync for ${shopDomain}`);

  try {
    // STEP 1: Use billing.check() to verify active subscriptions
    const { hasActivePayment, appSubscriptions } = await billing.check();

    console.log(`[syncSubscription] Billing check result:`, {
      hasActivePayment,
      subscriptionCount: appSubscriptions?.length || 0,
    });

    if (!hasActivePayment || !appSubscriptions || appSubscriptions.length === 0) {
      console.log(`[syncSubscription] No active subscriptions found for ${shopDomain}`);
      return;
    }

    // STEP 2: Get the most recent active subscription
    const activeSubscription = appSubscriptions[0];
    console.log(`[syncSubscription] Active subscription ID: ${activeSubscription.id}`);

    // STEP 3: Query full subscription details via GraphQL
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
      variables: { id: activeSubscription.id },
    });

    const data = await response.json() as any;

    if (data.errors || !data.data?.node) {
      console.error(`[syncSubscription] GraphQL errors:`, data.errors);
      throw new Error('Failed to query subscription details');
    }

    const subscription = data.data.node;
    console.log(`[syncSubscription] 🔥 RAW Subscription from Shopify:`, JSON.stringify(subscription, null, 2));

    // STEP 4: Extract pricing details
    const lineItem = subscription.lineItems?.[0];
    const pricingDetails = lineItem?.plan?.pricingDetails;

    if (!pricingDetails || !pricingDetails.price) {
      console.error(`[syncSubscription] No pricing details found`);
      throw new Error('No pricing details found');
    }

    const price = parseFloat(pricingDetails.price.amount);
    const currencyCode = pricingDetails.price.currencyCode;
    const interval = pricingDetails.interval;

    // STEP 5: Map price and interval to planId
    const priceMatches = (expected: number) => Math.abs(price - expected) < 0.01;
    const isYearly = interval === 'ANNUAL' || interval === 'Annual' || interval === 'annual';

    let planId = 'basic'; // default fallback

    if (!isYearly) {
      // Monthly plans
      if (priceMatches(5)) planId = 'base';
      else if (priceMatches(14)) planId = 'mid';
      else if (priceMatches(21)) planId = 'basic';
      else if (priceMatches(27)) planId = 'grow';
      else if (priceMatches(59)) planId = 'pro';
      else if (priceMatches(134)) planId = 'premium';
      else {
        console.warn(`[syncSubscription] Unknown monthly price: ${price}, defaulting to basic`);
      }
    } else {
      // Yearly plans
      if (priceMatches(45)) planId = 'base_yearly';
      else if (priceMatches(126)) planId = 'mid_yearly';
      else if (priceMatches(189)) planId = 'basic_yearly';
      else if (priceMatches(243)) planId = 'grow_yearly';
      else if (priceMatches(531)) planId = 'pro_yearly';
      else if (priceMatches(1206)) planId = 'premium_yearly';
      else {
        console.warn(`[syncSubscription] Unknown yearly price: ${price}, defaulting to basic_yearly`);
        planId = 'basic_yearly';
      }
    }

    console.log(`[syncSubscription] Mapped to plan: ${planId} (price: ${price} ${currencyCode}, interval: ${interval})`);

    // STEP 6: Find or create shop record
    let shop = await db.shop.findUnique({
      where: { myshopifyDomain: shopDomain },
    });

    if (!shop) {
      // Shop doesn't exist yet - create it with free plan (will be upgraded below)
      console.log(`[syncSubscription] Shop not found: ${shopDomain}, creating new shop record`);
      shop = await db.shop.create({
        data: {
          myshopifyDomain: shopDomain,
          accessToken: '', // Will need to be updated separately
          plan: 'free',
          features: PLAN_FEATURES['free']
        }
      });
    }

    // STEP 7: Calculate trial end date
    const trialEndsAt = subscription.trialDays
      ? new Date(Date.now() + subscription.trialDays * 24 * 60 * 60 * 1000)
      : null;

    // STEP 8: Save/update subscription in database
    const dataToSave = {
      shopId: shop.id,
      shopifySubscriptionId: subscription.id,
      name: subscription.name,
      status: subscription.status,
      planId: planId,
      billingInterval: interval,
      price: price,
      currencyCode: currencyCode,
      isTest: subscription.test || false,
      trialDays: subscription.trialDays || 0,
      trialEndsAt: trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null,
    };

    console.log(`[syncSubscription] 🔥 DATA TO SAVE:`, JSON.stringify(dataToSave, null, 2));

    const existingSubscription = await db.subscription.findUnique({
      where: { shopifySubscriptionId: subscription.id },
    });

    if (existingSubscription) {
      console.log(`[syncSubscription] Updating existing subscription ${subscription.id}`);
      await db.subscription.update({
        where: { shopifySubscriptionId: subscription.id },
        data: {
          status: dataToSave.status,
          planId: dataToSave.planId,
          billingInterval: dataToSave.billingInterval,
          price: dataToSave.price,
          currencyCode: dataToSave.currencyCode,
          isTest: dataToSave.isTest,
          trialDays: dataToSave.trialDays,
          trialEndsAt: dataToSave.trialEndsAt,
          currentPeriodEnd: dataToSave.currentPeriodEnd,
        },
      });
    } else {
      console.log(`[syncSubscription] Creating new subscription record`);
      await db.subscription.create({
        data: dataToSave,
      });
    }

    // STEP 9: Update shop's plan and features
    const basePlanId = planId.replace('_yearly', '');
    const planFeatures = PLAN_FEATURES[basePlanId] || PLAN_FEATURES['free'];

    console.log(`[syncSubscription] Updating shop with plan: ${planId}, features:`, planFeatures);
    await db.shop.update({
      where: { id: shop.id },
      data: {
        plan: planId,
        features: planFeatures
      },
    });

    console.log(`[syncSubscription] ✅ Successfully synced subscription for ${shopDomain}, plan: ${planId}`);

  } catch (error) {
    console.error(`[syncSubscription] Error syncing subscription:`, error);
    throw error;
  }
}
