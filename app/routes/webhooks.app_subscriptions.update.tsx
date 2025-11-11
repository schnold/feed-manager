import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";

/**
 * Webhook handler for APP_SUBSCRIPTIONS_UPDATE
 * Updates the shop's plan when a subscription changes
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const subscriptionData = JSON.parse(payload);
    console.log("Subscription data:", JSON.stringify(subscriptionData, null, 2));

    // Extract plan name from subscription
    const subscriptionName = subscriptionData.app_subscription?.name;
    
    if (subscriptionName) {
      // Parse plan name from subscription name (e.g., "BASE Plan" -> "base")
      const planMatch = subscriptionName.match(/^(\w+)\s+Plan$/i);
      const planName = planMatch ? planMatch[1].toLowerCase() : "basic";
      
      console.log(`Updating shop ${shop} to plan: ${planName}`);

      // Update shop plan in database
      const shopRecord = await ShopRepository.findByDomain(shop);
      if (shopRecord) {
        await ShopRepository.upsert({
          myshopifyDomain: shop,
          accessToken: shopRecord.accessToken,
          plan: planName
        });
        console.log(`Successfully updated shop ${shop} to ${planName} plan`);
      } else {
        console.warn(`Shop ${shop} not found in database`);
      }
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error processing subscription update webhook:", error);
    // Return 200 anyway to prevent Shopify from retrying
    return new Response(null, { status: 200 });
  }
};

