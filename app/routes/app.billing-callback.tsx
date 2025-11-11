import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { getAdminGraphqlClient } from "../services/shopify/admin.server";

/**
 * Billing callback handler - processes return from Shopify's billing confirmation page
 * 
 * Flow:
 * 1. Merchant approves/declines subscription on Shopify's hosted page
 * 2. Shopify redirects to this route
 * 3. We query for active subscriptions to verify payment
 * 4. Update shop plan in database if subscription is active
 * 5. Redirect to feeds page with appropriate message
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Get query parameters for additional context
    const url = new URL(request.url);
    const chargeId = url.searchParams.get("charge_id");
    
    console.log(`[Billing Callback] Processing for shop: ${session.shop}, charge_id: ${chargeId}`);

    // Query for active subscriptions to verify payment was approved
    const client = getAdminGraphqlClient({
      shopDomain: session.shop,
      accessToken: admin.session.accessToken!
    });

    const query = `
      query GetActiveSubscription {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            createdAt
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

    const response = await client.request(query);
    const activeSubscriptions = response.data?.currentAppInstallation?.activeSubscriptions || [];

    console.log(`[Billing Callback] Found ${activeSubscriptions.length} active subscription(s)`);

    if (activeSubscriptions.length > 0) {
      // Get the most recent active subscription (they should only have one)
      const subscription = activeSubscriptions[0];
      
      console.log(`[Billing Callback] Active subscription: ${subscription.name}, status: ${subscription.status}`);

      // Parse plan name from subscription name (e.g., "BASE Plan" -> "base")
      const planMatch = subscription.name.match(/^(\w+)\s+Plan$/i);
      const planName = planMatch ? planMatch[1].toLowerCase() : "basic";

      console.log(`[Billing Callback] Parsed plan name: ${planName}`);

      // Update shop plan in database
      try {
        await ShopRepository.updatePlan(session.shop, planName);
        console.log(`[Billing Callback] ✅ Successfully updated shop ${session.shop} to ${planName} plan`);
      } catch (dbError) {
        console.error(`[Billing Callback] ❌ Failed to update database:`, dbError);
        // Continue anyway - webhook will handle it as backup
      }

      // Redirect to feeds page with success message
      return redirect("/app/feeds?billing=success");
    } else {
      // No active subscription found - payment was likely declined or expired
      console.warn(`[Billing Callback] ⚠️  No active subscription found for shop ${session.shop}`);
      return redirect("/app/choose-plan?error=no_subscription");
    }
  } catch (error) {
    console.error("[Billing Callback] ❌ Error processing billing callback:", error);
    
    // Log more details for debugging
    if (error instanceof Error) {
      console.error("[Billing Callback] Error message:", error.message);
      console.error("[Billing Callback] Error stack:", error.stack);
    }
    
    // Redirect to feeds with error - webhook might still update the plan
    return redirect("/app/feeds?billing=error");
  }
};

// No action needed - this is a GET-only route
export const action = async () => {
  return redirect("/app/feeds");
};

