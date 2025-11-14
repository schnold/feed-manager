import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate the request - this handles OAuth callback and token exchange
  const { redirect } = await authenticate.admin(request);

  // Immediately redirect to app UI after successful authentication
  // Using the redirect helper ensures proper embedded app parameters are maintained
  return redirect("/app");
};
