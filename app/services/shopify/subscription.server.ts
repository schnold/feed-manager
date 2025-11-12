import { authenticate } from "../../shopify.server";

export interface SubscriptionInfo {
  plan: string;
  status: string;
  name: string;
}

const PLAN_NAME_TO_ID: Record<string, string> = {
  'BASE': 'base',
  'MID': 'mid',
  'BASIC': 'basic',
  'GROW': 'grow',
  'PRO': 'pro',
  'PREMIUM': 'premium'
};

/**
 * Get the current active subscription for the shop
 */
export async function getCurrentSubscription(request: Request): Promise<SubscriptionInfo | null> {
  try {
    const { admin } = await authenticate.admin(request);

    const query = `
      query {
        currentAppInstallation {
          allSubscriptions(first: 10) {
            edges {
              node {
                id
                name
                status
                lineItems {
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
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors fetching subscription:", data.errors);
      return null;
    }

    const allSubscriptions = data.data?.currentAppInstallation?.allSubscriptions?.edges || [];
    
    // Find the active subscription
    const activeSubscription = allSubscriptions
      .map((edge: any) => edge.node)
      .find((sub: any) => sub.status === 'ACTIVE');
    
    if (!activeSubscription) {
      return null;
    }

    const subscription = activeSubscription;
    
    // Extract plan name from subscription name (e.g., "GROW Plan" -> "GROW")
    const subscriptionName = subscription.name || '';
    const planMatch = subscriptionName.match(/^(\w+)\s+Plan$/i);
    const planName = planMatch ? planMatch[1].toUpperCase() : null;
    
    if (!planName || !PLAN_NAME_TO_ID[planName]) {
      console.warn(`Unknown plan name from subscription: ${subscriptionName}`);
      return null;
    }

    return {
      plan: PLAN_NAME_TO_ID[planName],
      status: subscription.status,
      name: subscriptionName
    };
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return null;
  }
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

