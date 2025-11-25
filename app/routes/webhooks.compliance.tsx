import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook handler for public apps
 * 
 * Handles three compliance webhook topics:
 * - customers/data_request: Requests to view stored customer data
 * - customers/redact: Requests to delete customer data
 * - shop/redact: Requests to delete shop data
 * 
 * Required for Shopify App Store distribution.
 * See: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 * 
 * Requirements:
 * - Must handle POST requests with JSON body and Content-Type: application/json
 * - Must verify HMAC signature (handled by authenticate.webhook)
 * - Must return 401 if HMAC is invalid (handled by authenticate.webhook)
 * - Must return HTTP 200 to acknowledge receipt
 * - Must complete action within 30 days (handled asynchronously)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // authenticate.webhook automatically:
    // - Verifies HMAC signature from X-Shopify-Hmac-SHA256 header
    // - Returns 401 Unauthorized if signature is invalid
    // - Only processes webhook if verification passes
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`Received compliance webhook: ${topic} for ${shop}`);

    // Parse payload (payload is a string from authenticate.webhook)
    let webhookData;
    try {
      webhookData = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch (parseError) {
      console.error(`Failed to parse webhook payload for ${topic}:`, parseError);
      // Still return 200 to acknowledge receipt
      return new Response(null, { status: 200 });
    }

    // Topic names from authenticate.webhook are normalized to uppercase with underscores
    // Handle both formats for compatibility
    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
      case "customers/data_request":
        // Handle customer data request
        // The customer has requested to view their stored data
        // You should provide the customer's data if you store any
        console.log("Customer data request:", {
          shop_id: webhookData.shop_id,
          shop_domain: webhookData.shop_domain,
          customer: webhookData.customer,
          orders_requested: webhookData.orders_requested,
          data_request: webhookData.data_request,
        });
        
        // TODO: If your app stores customer data, retrieve and provide it here
        // This app (Feed Manager) primarily handles product feeds, so minimal customer data is stored
        // For compliance, you may need to export customer data if requested
        // Note: You have 30 days to complete this action
        break;

      case "CUSTOMERS_REDACT":
      case "customers/redact":
        // Handle customer data redaction (deletion)
        // The customer has requested to delete their data
        console.log("Customer redact request:", {
          shop_id: webhookData.shop_id,
          shop_domain: webhookData.shop_domain,
          customer: webhookData.customer,
          orders_to_redact: webhookData.orders_to_redact,
        });
        
        // TODO: If your app stores customer data, delete it here
        // This app (Feed Manager) primarily handles product feeds, so minimal customer data is stored
        // For compliance, delete any customer-related data you store
        // Note: You have 30 days to complete this action (unless legally required to retain)
        break;

      case "SHOP_REDACT":
      case "shop/redact":
        // Handle shop data redaction (deletion)
        // 48 hours after app uninstall, Shopify sends this webhook
        console.log("Shop redact request:", {
          shop_id: webhookData.shop_id,
          shop_domain: webhookData.shop_domain,
        });
        
        // TODO: If your app stores shop-specific data, delete it here
        // Note: Session data is already handled by app/uninstalled webhook
        // This app (Feed Manager) stores feed configurations - consider cleaning up if needed
        // For compliance, delete any shop-specific data you store
        break;

      default:
        console.warn(`Unhandled compliance webhook topic: ${topic}`);
    }

    // Always return HTTP 200 to acknowledge receipt
    // Shopify will retry if we return an error status
    return new Response(null, { status: 200 });
  } catch (error) {
    // If authenticate.webhook throws, it means HMAC verification failed
    // It will automatically return 401, but we should handle other errors
    if (error instanceof Response) {
      // authenticate.webhook may throw a Response for 401 errors
      return error;
    }
    
    console.error(`Error processing compliance webhook:`, error);
    // Still return 200 to acknowledge receipt (Shopify requirement)
    // Log the error for debugging
    return new Response(null, { status: 200 });
  }
};

