type IteratorParams = {
  shopDomain: string;
  accessToken: string;
  language: string;
  country: string;
};

export async function* iterateProducts(params: IteratorParams) {
  const { shopDomain, accessToken, country } = params;

  let cursor: string | null = null;
  const pageSize = 250; // Increased from 50 to 250 to reduce round-trips and prevent timeouts

  while (true) {
    const query = `
      query Products($pageSize: Int!, $cursor: String, $country: CountryCode) {
        products(first: $pageSize, after: $cursor) {
          pageInfo { hasNextPage }
          edges {
            cursor
            node {
              id
              title
              bodyHtml
              handle
              productType
              vendor
              status
              featuredImage { url }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    price
                    compareAtPrice
                    image { url }
                    inventoryItem { tracked }
                    inventoryQuantity
                    contextualPricing(context: {country: $country}) {
                      price {
                        amount
                        currencyCode
                      }
                      compareAtPrice {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Make direct GraphQL request to Shopify Admin API
    const response = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query,
        variables: { pageSize, cursor, country }
      }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    const edges = json.data.products.edges as any[];
    for (const edge of edges) {
      yield edge.node;
      cursor = edge.cursor;
    }
    if (!json.data.products.pageInfo.hasNextPage) break;
  }
}


