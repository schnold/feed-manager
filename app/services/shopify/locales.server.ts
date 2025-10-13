import { authenticate } from "../../shopify.server";

export interface ShopLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
}

export interface TranslatableContent {
  key: string;
  value: string;
  digest: string;
  locale: string;
}

export interface TranslatableResource {
  resourceId: string;
  translatableContent: TranslatableContent[];
}

/**
 * Fetch all available locales for a shop
 */
export async function getShopLocales(request: Request): Promise<ShopLocale[]> {
  const { admin } = await authenticate.admin(request);

  const query = `
    query getShopLocales {
      shopLocales {
        locale
        name
        primary
        published
      }
    }
  `;

  const response = await admin.graphql(query);
  const data = await response.json();

  console.log("Shop locales API response:", JSON.stringify(data, null, 2));

  if (data.errors) {
    console.error("GraphQL errors:", data.errors);
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const locales = data.data?.shopLocales || [];
  console.log("Parsed locales:", locales);
  console.log("Number of locales returned:", locales.length);
  
  return locales;
}

/**
 * Fetch translatable resources (products) for a specific locale
 */
export async function getTranslatableResources(
  request: Request,
  resourceType: string = "PRODUCT",
  first: number = 10
): Promise<TranslatableResource[]> {
  const { admin } = await authenticate.admin(request);

  const query = `
    query getTranslatableResources($resourceType: TranslatableResourceType!, $first: Int!) {
      translatableResources(resourceType: $resourceType, first: $first) {
        edges {
          node {
            resourceId
            translatableContent {
              key
              value
              digest
              locale
            }
          }
        }
      }
    }
  `;

  const variables = {
    resourceType,
    first
  };

  const response = await admin.graphql(query, { variables });
  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.translatableResources.edges.map((edge: any) => edge.node);
}

/**
 * Get product translations for a specific locale
 */
export async function getProductTranslations(
  request: Request,
  productId: string,
  locale: string
): Promise<TranslatableContent[]> {
  const { admin } = await authenticate.admin(request);

  const query = `
    query getProductTranslations($resourceId: ID!, $locale: String!) {
      translatableResource(resourceId: $resourceId) {
        translations(locale: $locale) {
          key
          value
          locale
        }
      }
    }
  `;

  const variables = {
    resourceId: productId,
    locale
  };

  const response = await admin.graphql(query, { variables });
  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.translatableResource?.translations || [];
}

/**
 * Get products with their translations for a specific locale
 */
export async function getProductsWithTranslations(
  request: Request,
  locale: string,
  first: number = 50
): Promise<any[]> {
  const { admin } = await authenticate.admin(request);

  const query = `
    query getProductsWithTranslations($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            description
            descriptionHtml
            handle
            vendor
            productType
            tags
            status
            createdAt
            updatedAt
            onlineStoreUrl
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  availableForSale
                  selectedOptions {
                    name
                    value
                  }
                  image {
                    url
                    altText
                  }
                }
              }
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
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

  const response = await admin.graphql(query, { variables: { first } });
  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const products = data.data.products.edges.map((edge: any) => edge.node);

  // Get translations for each product
  const productsWithTranslations = await Promise.all(
    products.map(async (product: any) => {
      const translations = await getProductTranslations(request, product.id, locale);
      
      // Apply translations to product data
      const translatedProduct = { ...product };
      
      translations.forEach((translation) => {
        if (translation.key === 'title') {
          translatedProduct.title = translation.value;
        } else if (translation.key === 'body_html') {
          translatedProduct.descriptionHtml = translation.value;
        } else if (translation.key === 'description') {
          translatedProduct.description = translation.value;
        }
      });

      // Apply translations to variants
      translatedProduct.variants = translatedProduct.variants.edges.map((variantEdge: any) => {
        const variant = variantEdge.node;
        const variantTranslations = translations.filter(t => 
          t.key.startsWith('variant_') && t.key.includes(variant.id.split('/').pop())
        );
        
        variantTranslations.forEach((translation) => {
          if (translation.key.includes('title')) {
            variant.title = translation.value;
          }
        });
        
        return variant;
      });

      return translatedProduct;
    })
  );

  return productsWithTranslations;
}

/**
 * Check if a locale is available for the shop
 */
export async function isLocaleAvailable(
  request: Request,
  locale: string
): Promise<boolean> {
  const locales = await getShopLocales(request);
  return locales.some(l => l.locale === locale && l.published);
}

/**
 * Get the primary locale for the shop
 */
export async function getPrimaryLocale(request: Request): Promise<ShopLocale | null> {
  const locales = await getShopLocales(request);
  return locales.find(l => l.primary) || null;
}

/**
 * Get all published locales for the shop
 */
export async function getPublishedLocales(request: Request): Promise<ShopLocale[]> {
  const locales = await getShopLocales(request);
  return locales.filter(l => l.published);
}
