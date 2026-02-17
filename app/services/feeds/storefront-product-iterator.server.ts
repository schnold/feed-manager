/**
 * Storefront API Product Iterator with @inContext directive for translations and pricing
 */

type StorefrontIteratorParams = {
  shopDomain: string;
  storefrontAccessToken: string;
  language: string;
  country: string;
};

export async function* iterateProductsWithStorefront(params: StorefrontIteratorParams) {
  const { shopDomain, storefrontAccessToken, language, country } = params;

  let cursor: string | null = null;
  // Increase page size to 250 (max allowed) to reduce round trips and prevent timeouts
  const pageSize = 250;

  // Convert language code to Storefront API format
  const languageCode = language.toUpperCase();
  const countryCode = country.toUpperCase();

  console.log(`[Storefront Iterator] Fetching products with language: ${languageCode}, country: ${countryCode}`);

  while (true) {
    const query = `
      query Products($pageSize: Int!, $cursor: String) @inContext(language: ${languageCode}, country: ${countryCode}) {
        products(first: $pageSize, after: $cursor) {
          pageInfo { 
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              id
              title
              description
              descriptionHtml
              handle
              productType
              vendor
              status
              featuredImage { 
                url
                altText
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    price {
                      amount
                      currencyCode
                    }
                    compareAtPrice {
                      amount
                      currencyCode
                    }
                    image { 
                      url
                      altText
                    }
                    availableForSale
                    quantityAvailable
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
              options {
                id
                name
                values
              }
            }
          }
        }
      }
    `;

    try {
      // Make direct GraphQL request to Shopify Storefront API
      const response = await fetch(`https://${shopDomain}/api/2025-04/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
        },
        body: JSON.stringify({
          query,
          variables: { pageSize, cursor }
        }),
      });

      if (!response.ok) {
        throw new Error(`Storefront API request failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();

      if (json.errors) {
        console.error('Storefront API GraphQL errors:', json.errors);
        throw new Error(`Storefront API GraphQL errors: ${JSON.stringify(json.errors)}`);
      }

      const products = json.data?.products?.edges || [];

      if (products.length === 0) {
        break;
      }

      for (const edge of products) {
        const product = edge.node;

        // Transform the product to match our expected format
        const transformedProduct = {
          ...product,
          // Add shop domain for URL generation
          shopDomain: shopDomain,
          // Transform variants to match Admin API format
          variants: {
            edges: product.variants.edges.map((variantEdge: any) => ({
              node: {
                ...variantEdge.node,
                // Transform pricing to match Admin API format
                price: variantEdge.node.price?.amount || '0',
                compareAtPrice: variantEdge.node.compareAtPrice?.amount || null,
                // Add contextual pricing (already localized by @inContext)
                contextualPricing: {
                  price: {
                    amount: variantEdge.node.price?.amount || '0',
                    currencyCode: variantEdge.node.price?.currencyCode || 'USD'
                  },
                  compareAtPrice: variantEdge.node.compareAtPrice ? {
                    amount: variantEdge.node.compareAtPrice.amount,
                    currencyCode: variantEdge.node.compareAtPrice.currencyCode
                  } : null
                },
                // Transform availability
                inventoryQuantity: variantEdge.node.quantityAvailable || 0,
                inventoryItem: { tracked: true }
              }
            }))
          }
        };

        yield transformedProduct;
      }

      // Check if we should continue pagination
      const pageInfo = json.data?.products?.pageInfo;
      if (!pageInfo?.hasNextPage) {
        break;
      }

      cursor = pageInfo.endCursor;
    } catch (error) {
      console.error('Error in Storefront product iterator:', error);
      throw error;
    }
  }
}

/**
 * Get Storefront access token from environment or create one dynamically
 */
export async function getStorefrontAccessToken(shopDomain: string, request?: Request, accessToken?: string): Promise<string> {
  // First, try environment variable
  const envToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  if (envToken) {
    console.log(`[Storefront Token] Using token from environment variable`);
    return envToken;
  }

  try {
    const { getOrCreateStorefrontToken, getOrCreateStorefrontTokenOffline } = await import('../shopify/storefront-token.server');

    // If we have a request, use the standard remix way
    if (request) {
      const token = await getOrCreateStorefrontToken(request);
      console.log(`[Storefront Token] Created/retrieved token dynamically (web)`);
      return token;
    }

    // If no request but we have accessToken (background job context), use offline way
    if (accessToken) {
      const token = await getOrCreateStorefrontTokenOffline(shopDomain, accessToken);
      console.log(`[Storefront Token] Created/retrieved token dynamically (offline)`);
      return token;
    }
  } catch (error) {
    console.warn(`[Storefront Token] Failed to create token dynamically:`, error);
  }

  throw new Error('Storefront access token not found. Please set SHOPIFY_STOREFRONT_ACCESS_TOKEN environment variable or ensure the app has proper permissions.');
}
