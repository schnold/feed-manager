import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { FeedRepository } from "../db/repositories/feed.server";

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
        console.log("Customer data request:", {
          shop_id: webhookData.shop_id,
          shop_domain: webhookData.shop_domain,
          customer: webhookData.customer,
          orders_requested: webhookData.orders_requested,
          data_request: webhookData.data_request,
        });

        // This app (Feed Manager) does not store customer personal data
        // The app only processes product catalog data for feed generation
        // If customer data is stored in the future, implement retrieval here
        console.log(`No customer data stored for customer ${webhookData.customer?.id} in shop ${webhookData.shop_domain}`);
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

        // This app (Feed Manager) does not store customer personal data
        // The app only processes product catalog data for feed generation
        // If customer data is stored in the future, implement deletion here
        console.log(`No customer data to redact for customer ${webhookData.customer?.id} in shop ${webhookData.shop_domain}`);
        break;

      case "SHOP_REDACT":
      case "shop/redact":
        // Handle shop data redaction (deletion)
        // 48 hours after app uninstall, Shopify sends this webhook
        console.log("Shop redact request:", {
          shop_id: webhookData.shop_id,
          shop_domain: webhookData.shop_domain,
        });

        try {
          const shopDomain = webhookData.shop_domain;

          // Find the shop by domain
          const shopRecord = await ShopRepository.findByDomain(shopDomain);

          if (shopRecord) {
            console.log(`Deleting all data for shop: ${shopDomain}`);

            // Delete all feeds for this shop (cascade deletes mappings, filters, schedules, runs, assets)
            const feeds = await FeedRepository.findByShopId(shopRecord.id);
            for (const feed of feeds) {
              await FeedRepository.deleteWithRelations(feed.id);
              console.log(`Deleted feed ${feed.id} (${feed.name}) for shop ${shopDomain}`);
            }

            // Delete all sessions for this shop
            await db.session.deleteMany({
              where: { shop: shopDomain }
            });
            console.log(`Deleted sessions for shop ${shopDomain}`);

            // Delete the shop record
            await ShopRepository.delete(shopDomain);
            console.log(`Deleted shop record for ${shopDomain}`);

            console.log(`Successfully redacted all data for shop ${shopDomain}`);
          } else {
            console.log(`Shop ${shopDomain} not found in database - may have been already deleted`);
          }
        } catch (error) {
          console.error(`Error redacting shop data for ${webhookData.shop_domain}:`, error);
          // Still return 200 to acknowledge receipt
        }
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

