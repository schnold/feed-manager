/**
 * Service to manage Storefront access tokens
 */

import { authenticate } from "../../shopify.server";

export interface StorefrontToken {
  id: string;
  accessToken: string;
  title: string;
  accessScopes: string[];
  createdAt: string;
}

/**
 * Get or create a Storefront access token for the current shop
 */
export async function getOrCreateStorefrontToken(request: Request): Promise<string> {
  const { admin } = await authenticate.admin(request);
  
  try {
    // First, try to get existing tokens
    const existingTokens = await getExistingStorefrontTokens(admin);
    
    if (existingTokens.length > 0) {
      console.log(`[Storefront Token] Found ${existingTokens.length} existing tokens, using the first one`);
      return existingTokens[0].accessToken;
    }
    
    // If no existing tokens, create a new one
    console.log(`[Storefront Token] No existing tokens found, creating a new one`);
    return await createStorefrontToken(admin);
    
  } catch (error) {
    console.error(`[Storefront Token] Error getting/creating token:`, error);
    throw error;
  }
}

/**
 * Get existing Storefront access tokens
 */
async function getExistingStorefrontTokens(admin: any): Promise<StorefrontToken[]> {
  const query = `
    query GetStorefrontTokens {
      shop {
        storefrontAccessTokens(first: 10) {
          edges {
            node {
              id
              accessToken
              title
              accessScopes {
                handle
              }
              createdAt
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const json = await response.json();

  if (json.errors) {
    throw new Error(`Failed to fetch storefront tokens: ${JSON.stringify(json.errors)}`);
  }

  const tokens = json.data?.shop?.storefrontAccessTokens?.edges || [];
  return tokens.map((edge: any) => ({
    id: edge.node.id,
    accessToken: edge.node.accessToken,
    title: edge.node.title,
    accessScopes: edge.node.accessScopes.map((scope: any) => scope.handle),
    createdAt: edge.node.createdAt
  }));
}

/**
 * Create a new Storefront access token
 */
async function createStorefrontToken(admin: any): Promise<string> {
  const mutation = `
    mutation CreateStorefrontToken($input: StorefrontAccessTokenInput!) {
      storefrontAccessTokenCreate(input: $input) {
        userErrors {
          field
          message
        }
        storefrontAccessToken {
          id
          accessToken
          title
          accessScopes {
            handle
          }
        }
      }
    }
  `;

  const variables = {
    input: {
      title: "Feed Manager Storefront Token"
    }
  };

  const response = await admin.graphql(mutation, { variables });
  const json = await response.json();

  if (json.errors) {
    throw new Error(`Failed to create storefront token: ${JSON.stringify(json.errors)}`);
  }

  const result = json.data?.storefrontAccessTokenCreate;
  
  if (result.userErrors && result.userErrors.length > 0) {
    throw new Error(`Failed to create storefront token: ${JSON.stringify(result.userErrors)}`);
  }

  if (!result.storefrontAccessToken?.accessToken) {
    throw new Error('No access token returned from storefront token creation');
  }

  console.log(`[Storefront Token] Created new token: ${result.storefrontAccessToken.title}`);
  return result.storefrontAccessToken.accessToken;
}

/**
 * Get Storefront access token from environment variable (fallback)
 */
export function getStorefrontTokenFromEnv(): string | null {
  return process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || null;
}
