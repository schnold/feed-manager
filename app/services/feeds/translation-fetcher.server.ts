/**
 * Service to fetch translated product content using Storefront API
 */

type TranslationParams = {
  shopDomain: string;
  storefrontAccessToken: string;
  language: string;
  country: string;
};

export interface TranslatedProduct {
  id: string;
  title: string;
  description: string;
  handle: string;
  variants: Array<{
    id: string;
    title: string;
  }>;
}

/**
 * Fetch translated product content using Storefront API with @inContext directive
 */
export async function fetchTranslatedProducts(
  params: TranslationParams,
  productIds: string[]
): Promise<Map<string, TranslatedProduct>> {
  const { shopDomain, storefrontAccessToken, language, country } = params;
  
  const translatedProducts = new Map<string, TranslatedProduct>();
  
  // Process products in batches to avoid query size limits
  const batchSize = 10;
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    const batchResults = await fetchTranslatedProductsBatch(
      shopDomain,
      storefrontAccessToken,
      language,
      country,
      batch
    );
    
    // Merge results
    for (const [id, product] of batchResults) {
      translatedProducts.set(id, product);
    }
  }
  
  return translatedProducts;
}

/**
 * Fetch a batch of translated products
 */
async function fetchTranslatedProductsBatch(
  shopDomain: string,
  storefrontAccessToken: string,
  language: string,
  country: string,
  productIds: string[]
): Promise<Map<string, TranslatedProduct>> {
  
  // Convert product IDs to handles (we'll need to get handles from the Admin API first)
  // For now, let's create a query that fetches products by their IDs
  const query = `
    query TranslatedProducts($ids: [ID!]!) @inContext(language: ${language}, country: ${country}) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          description
          handle
          variants(first: 100) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${shopDomain}/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
      },
      body: JSON.stringify({
        query,
        variables: { ids: productIds }
      }),
    });

    if (!response.ok) {
      console.warn(`Storefront API request failed: ${response.status} ${response.statusText}`);
      return new Map();
    }

    const json = await response.json();

    if (json.errors) {
      console.warn(`Storefront API GraphQL errors: ${JSON.stringify(json.errors)}`);
      return new Map();
    }

    const translatedProducts = new Map<string, TranslatedProduct>();
    
    if (json.data?.nodes) {
      for (const node of json.data.nodes) {
        if (node && node.id) {
          translatedProducts.set(node.id, {
            id: node.id,
            title: node.title || '',
            description: node.description || '',
            handle: node.handle || '',
            variants: node.variants?.edges?.map((edge: any) => ({
              id: edge.node.id,
              title: edge.node.title || ''
            })) || []
          });
        }
      }
    }

    return translatedProducts;
  } catch (error) {
    console.warn('Failed to fetch translated products:', error);
    return new Map();
  }
}

/**
 * Alternative approach: Fetch translations using Admin API translatable resources
 * This is more reliable but requires more API calls
 */
export async function fetchTranslatedProductsAdmin(
  shopDomain: string,
  accessToken: string,
  language: string,
  productIds: string[]
): Promise<Map<string, TranslatedProduct>> {
  
  const translatedProducts = new Map<string, TranslatedProduct>();
  
  console.log(`[Translation Fetcher] Fetching translations for ${productIds.length} products in language: ${language}`);
  
  // Process products in batches to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    
    for (const productId of batch) {
      try {
        const query = `
          query GetProductTranslations($resourceId: ID!, $locale: String!) {
            translatableResource(resourceId: $resourceId) {
              translations(locale: $locale) {
                key
                value
                locale
              }
            }
          }
        `;

        const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({
            query,
            variables: {
              resourceId: productId,
              locale: language
            }
          }),
        });

        if (!response.ok) {
          console.warn(`Failed to fetch translations for product ${productId}: HTTP ${response.status}`);
          continue;
        }

        const json = await response.json();

        if (json.errors) {
          console.warn(`GraphQL errors for product ${productId}:`, json.errors);
          continue;
        }

        if (!json.data?.translatableResource?.translations) {
          console.warn(`No translations found for product ${productId}`);
          continue;
        }

        const translations = json.data.translatableResource.translations;
        const translatedProduct: TranslatedProduct = {
          id: productId,
          title: '',
          description: '',
          handle: '',
          variants: []
        };

        // Apply translations
        for (const translation of translations) {
          if (translation.key === 'title') {
            translatedProduct.title = translation.value;
          } else if (translation.key === 'body_html' || translation.key === 'description') {
            translatedProduct.description = translation.value;
          } else if (translation.key.startsWith('variant_') && translation.key.includes('title')) {
            // Extract variant ID from key (format: variant_{id}_title)
            const variantIdMatch = translation.key.match(/variant_([^_]+)_title/);
            if (variantIdMatch) {
              const variantId = `gid://shopify/ProductVariant/${variantIdMatch[1]}`;
              translatedProduct.variants.push({
                id: variantId,
                title: translation.value
              });
            }
          }
        }

        if (translatedProduct.title || translatedProduct.description) {
          translatedProducts.set(productId, translatedProduct);
          console.log(`[Translation Fetcher] Found translations for product ${productId}: title="${translatedProduct.title}", description="${translatedProduct.description.substring(0, 50)}..."`);
        }
      } catch (error) {
        console.warn(`Failed to fetch translations for product ${productId}:`, error);
      }
    }
    
    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < productIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`[Translation Fetcher] Successfully fetched translations for ${translatedProducts.size} products`);
  return translatedProducts;
}
