import { authenticate } from "../../shopify.server";

export interface ShopLocation {
  id: string;
  name: string;
  address?: {
    address1?: string;
    city?: string;
    country?: string;
  };
}

const LOCATIONS_QUERY = `
  query getLocations {
    locations(first: 250) {
      edges {
        node {
          id
          name
          address {
            address1
            city
            country
          }
        }
      }
    }
  }
`;

export async function getShopLocations(request: Request): Promise<ShopLocation[]> {
  try {
    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(LOCATIONS_QUERY);
    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors fetching locations:", data.errors);
      return [];
    }

    const locations = data.data?.locations?.edges?.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      address: edge.node.address
    })) || [];

    return locations;
  } catch (error) {
    console.error("Error fetching shop locations:", error);
    return [];
  }
}
