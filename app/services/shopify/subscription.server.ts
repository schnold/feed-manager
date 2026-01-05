import { authenticate } from "../../shopify.server";
import db from "../../db.server";

export interface SubscriptionInfo {
  plan: string;
  status: string;
  name: string;
  isTest: boolean;
  trialEndsAt: Date | null;
}

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
    };
  } catch (error) {
    console.error("[subscription] Error fetching subscription:", error);
    return null;
  }
}

/**
 * SECURITY: Require an active subscription with minimum plan level
 * Throws a Response if requirements are not met
 * If no subscription exists, redirects to plan selection page
 */
export async function requireActivePlan(
  request: Request,
  minPlan: string = 'base'
): Promise<SubscriptionInfo> {
  const { session } = await authenticate.admin(request);

  // Get subscription from database
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

  if (!shop) {
    console.error(`[subscription] Shop not found: ${session.shop}`);
    throw new Response("Shop not found", { status: 404 });
  }

  if (shop.subscriptions.length === 0) {
    console.log(`[subscription] No active subscription for ${session.shop}, redirecting to plan selection`);
    // Instead of 403, redirect to plan selection
    throw new Response(null, {
      status: 302,
      headers: {
        "Location": "/app/choose-plan",
      },
    });
  }

  const subscription = shop.subscriptions[0];

  // Verify plan meets minimum requirements
  const planHierarchy = ['base', 'mid', 'basic', 'grow', 'pro', 'premium'];
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

  // SECURITY: In production, block test subscriptions
  if (process.env.NODE_ENV === 'production' && subscription.isTest) {
    console.error(`[subscription] Test subscription in production for ${session.shop}`);
    throw new Response("Test subscription in production", {
      status: 403,
      headers: {
        "X-Shopify-Redirect": "/app/choose-plan",
      },
    });
  }

  return {
    plan: subscription.planId,
    status: subscription.status,
    name: subscription.name,
    isTest: subscription.isTest,
    trialEndsAt: subscription.trialEndsAt,
  };
}

/**
 * SECURITY: Check if shop can create more feeds based on their plan
 */
export async function canCreateFeed(request: Request): Promise<{ allowed: boolean; currentCount: number; maxAllowed: number; plan: string }> {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({
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
    throw new Response("Shop not found", { status: 404 });
  }

  const plan = shop.subscriptions[0]?.planId || shop.plan || 'basic';
  const maxAllowed = getMaxFeedsForPlan(plan);
  const currentCount = shop.feeds.length;

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
  const limits: Record<string, number> = {
    'base': 2,
    'mid': 4,
    'basic': 6,
    'grow': 8,
    'pro': 20,
    'premium': Infinity // Unlimited
  };

  return limits[plan] || limits['basic'];
}

/**
 * Get the maximum number of scheduled updates per day for a plan
 */
export function getMaxScheduledUpdatesForPlan(plan: string): number {
  const limits: Record<string, number> = {
    'base': 1,
    'mid': 1,
    'basic': 1,
    'grow': 1,
    'pro': 4,
    'premium': 8
  };

  return limits[plan] || limits['basic'];
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

    const data = await response.json();

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
