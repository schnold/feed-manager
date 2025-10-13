import shopify from "../../shopify.server";

export function getAdminGraphqlClient(params: { shopDomain: string; accessToken: string }) {
  const { shopDomain, accessToken } = params;
  return new shopify.api.clients.Graphql({
    domain: shopDomain,
    accessToken,
    apiVersion: shopify.api.config.apiVersion,
  });
}


