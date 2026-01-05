import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { PLAN_FEATURES } from "../services/shopify/subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate the request - this handles OAuth callback and token exchange
  const { session, redirect } = await authenticate.admin(request);

  // Create shop record if it doesn't exist (first time install)
  const existingShop = await ShopRepository.findByDomain(session.shop);

  if (!existingShop) {
    console.log(`[auth] Creating new shop record for ${session.shop} with free plan`);
    await ShopRepository.create({
      myshopifyDomain: session.shop,
      accessToken: session.accessToken,
      plan: 'free',
      features: PLAN_FEATURES['free']
    });
  } else {
    console.log(`[auth] Shop ${session.shop} already exists with plan: ${existingShop.plan}`);
  }

  // Immediately redirect to app UI after successful authentication
  // Using the redirect helper ensures proper embedded app parameters are maintained
  return redirect("/app");
};
