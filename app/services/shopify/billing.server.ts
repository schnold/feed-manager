import { authenticate } from "../../shopify.server";

/**
 * SECURITY: Determine if a shop should use test charges
 * Test charges prevent real payments and are used for:
 * - Development/staging environments
 * - Development stores
 * - Testing billing flows
 */
export async function shouldUseTestCharges(request: Request): Promise<boolean> {
  try {
    const { admin, session } = await authenticate.admin(request);

    // ALWAYS use test mode in development environment
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[billing] Test mode: ON (development environment)`);
      return true;
    }

    // Check if shop is a development store by querying ShopPlan
    const query = `
      query {
        shop {
          plan {
            partnerDevelopment
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json();

    if (data.errors) {
      console.error('[billing] Error checking shop plan:', data.errors);
      // Default to test mode for safety if we can't determine shop type
      return true;
    }

    const isDevStore = data.data?.shop?.plan?.partnerDevelopment || false;

    if (isDevStore) {
      console.log(`[billing] Test mode: ON (development store: ${session.shop})`);
      return true;
    }

    // Production store in production environment - use real charges
    console.log(`[billing] Test mode: OFF (production store: ${session.shop})`);
    return false;

  } catch (error) {
    console.error('[billing] Error determining test mode:', error);
    // Default to test mode for safety
    console.log('[billing] Test mode: ON (error occurred, defaulting to safe mode)');
    return true;
  }
}

/**
 * Get human-readable billing mode info for display
 */
export async function getBillingModeInfo(request: Request): Promise<{
  isTest: boolean;
  mode: 'development' | 'test-store' | 'production';
  message: string;
}> {
  const isTest = await shouldUseTestCharges(request);

  if (process.env.NODE_ENV !== 'production') {
    return {
      isTest: true,
      mode: 'development',
      message: 'Development Environment - No real charges will be made',
    };
  }

  if (isTest) {
    return {
      isTest: true,
      mode: 'test-store',
      message: 'Development Store - Test charges only (free)',
    };
  }

  return {
    isTest: false,
    mode: 'production',
    message: 'Production Store - Real charges will be made',
  };
}
