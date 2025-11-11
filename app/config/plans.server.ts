/**
 * Centralized plan configuration for the feed manager app
 * This ensures consistency between frontend display and backend enforcement
 */

export type PlanName = 'base' | 'mid' | 'basic' | 'grow' | 'pro' | 'premium';

export interface PlanConfig {
  id: PlanName;
  name: string;
  maxFeeds: number;
  scheduledUpdatesPerDay: number;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
}

/**
 * Plan configurations with limits and pricing
 * IMPORTANT: These limits are enforced on the backend - do not modify without testing
 */
export const PLANS: Record<PlanName, PlanConfig> = {
  base: {
    id: 'base',
    name: 'BASE',
    maxFeeds: 2,
    scheduledUpdatesPerDay: 1,
    monthlyPrice: 5.00,
    yearlyPrice: 45.00,
    features: [
      '2 feeds included',
      '1 scheduled update per feed per day',
      'Unlimited manual updates',
      'Multi language',
      'Multi currency',
      'Feed rules & filters',
      'Unlimited products',
      'Unlimited orders'
    ]
  },
  mid: {
    id: 'mid',
    name: 'MID',
    maxFeeds: 4,
    scheduledUpdatesPerDay: 1,
    monthlyPrice: 14.00,
    yearlyPrice: 126.00,
    features: [
      '4 feeds included',
      '1 scheduled update per feed per day',
      'Unlimited manual updates',
      'Multi language',
      'Multi currency',
      'Feed rules & filters',
      'Unlimited products',
      'Unlimited orders'
    ]
  },
  basic: {
    id: 'basic',
    name: 'BASIC',
    maxFeeds: 6,
    scheduledUpdatesPerDay: 1,
    monthlyPrice: 21.00,
    yearlyPrice: 189.00,
    features: [
      'Up to 6 feeds included',
      '1 scheduled update per feed per day',
      'Unlimited manual updates',
      'Multi language',
      'Multi currency',
      'Feed rules & filters',
      'Unlimited products',
      'Unlimited orders'
    ]
  },
  grow: {
    id: 'grow',
    name: 'GROW',
    maxFeeds: 8,
    scheduledUpdatesPerDay: 1,
    monthlyPrice: 27.00,
    yearlyPrice: 243.00,
    features: [
      '8 feeds included',
      '1 scheduled update per feed per day',
      'Unlimited manual updates',
      'Multi language',
      'Multi currency',
      'Feed rules & filters',
      'Unlimited products',
      'Unlimited orders'
    ]
  },
  pro: {
    id: 'pro',
    name: 'PRO',
    maxFeeds: 20,
    scheduledUpdatesPerDay: 4,
    monthlyPrice: 59.00,
    yearlyPrice: 531.00,
    features: [
      'Up to 20 feeds included',
      '4 scheduled updates per feed per day',
      'Unlimited manual updates',
      'Multi language',
      'Multi currency',
      'Feed rules & filters',
      'Unlimited products',
      'Unlimited orders'
    ]
  },
  premium: {
    id: 'premium',
    name: 'PREMIUM',
    maxFeeds: -1, // -1 means unlimited
    scheduledUpdatesPerDay: 8,
    monthlyPrice: 134.00,
    yearlyPrice: 1206.00,
    features: [
      'Unlimited feeds included',
      '8 scheduled updates per feed per day',
      'Unlimited manual updates',
      'Multi language',
      'Multi currency',
      'Feed rules & filters',
      'Unlimited products',
      'Unlimited orders'
    ]
  }
};

/**
 * Get plan configuration by plan name
 */
export function getPlanConfig(planName: string): PlanConfig {
  const normalizedPlanName = planName.toLowerCase() as PlanName;
  return PLANS[normalizedPlanName] || PLANS.basic; // Default to basic if plan not found
}

/**
 * Check if a shop can create more feeds based on their plan
 */
export function canCreateFeed(planName: string, currentFeedCount: number): boolean {
  const plan = getPlanConfig(planName);
  
  // -1 means unlimited feeds (premium plan)
  if (plan.maxFeeds === -1) {
    return true;
  }
  
  return currentFeedCount < plan.maxFeeds;
}

/**
 * Get remaining feeds available for a plan
 */
export function getRemainingFeeds(planName: string, currentFeedCount: number): number {
  const plan = getPlanConfig(planName);
  
  // -1 means unlimited feeds
  if (plan.maxFeeds === -1) {
    return -1; // Return -1 to indicate unlimited
  }
  
  const remaining = plan.maxFeeds - currentFeedCount;
  return Math.max(0, remaining);
}

/**
 * Validate plan name
 */
export function isValidPlanName(planName: string): planName is PlanName {
  return planName.toLowerCase() in PLANS;
}

/**
 * Get all plan names
 */
export function getAllPlans(): PlanConfig[] {
  return Object.values(PLANS);
}

