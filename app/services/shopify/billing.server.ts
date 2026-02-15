import { authenticate } from "../../shopify.server";

/**
 * SECURITY: Determine if a shop should use test charges
 * Test charges prevent real payments and are used for:
 * - Development/staging environments
 * - Development stores
 * - Testing billing flows
 */
export async function shouldUseTestCharges(request: Request): Promise<boolean> {
  // SECURITY: In development environment, always use test charges
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[billing] Test mode: ON (development environment)`);
    return true;
  }

  // PRODUCTION ENVIRONMENT: Check if shop is a development store
  try {
    const { admin, session } = await authenticate.admin(request);
    console.log(`[billing] Production environment detected, checking shop type...`);

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
      // SECURITY: In production, default to REAL charges if we can't determine
      // This prevents exploitation by causing query failures
      console.log('[billing] Test mode: OFF (error checking shop type - defaulting to production billing for security)');
      return false;
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
    // SECURITY: In production environment, default to REAL charges on error
    // This prevents users from exploiting errors to bypass billing
    console.log('[billing] Test mode: OFF (error occurred in production - defaulting to production billing for security)');
    return false;
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
