import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Webhook handler for app/uninstalled events
 * 
 * HMAC verification: Automatically handled by authenticate.webhook()
 * - Verifies X-Shopify-Hmac-SHA256 header
 * - Returns 401 Unauthorized if HMAC is invalid
 * - Only processes webhook if verification passes
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // authenticate.webhook automatically verifies HMAC signature
    // If HMAC is invalid, it will throw an error or return a 401 Response
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    return new Response();
  } catch (error) {
    // If authenticate.webhook throws, it means HMAC verification failed
    // It will automatically return 401, but we should handle other errors
    if (error instanceof Response) {
      return error; // Return the 401 Response from authenticate.webhook
    }
    
    console.error("Error processing app/uninstalled webhook:", error);
    return new Response(null, { status: 500 });
  }
};
