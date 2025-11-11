import { describe, it, expect } from 'vitest';
import { 
  canCreateFeed, 
  getPlanConfig, 
  getRemainingFeeds,
  isValidPlanName,
  PLANS 
} from '../app/config/plans.server';

describe('Plan Configuration', () => {
  it('should have all required plans defined', () => {
    expect(PLANS.base).toBeDefined();
    expect(PLANS.mid).toBeDefined();
    expect(PLANS.basic).toBeDefined();
    expect(PLANS.grow).toBeDefined();
    expect(PLANS.pro).toBeDefined();
    expect(PLANS.premium).toBeDefined();
  });

  it('should have correct feed limits', () => {
    expect(PLANS.base.maxFeeds).toBe(2);
    expect(PLANS.mid.maxFeeds).toBe(4);
    expect(PLANS.basic.maxFeeds).toBe(6);
    expect(PLANS.grow.maxFeeds).toBe(8);
    expect(PLANS.pro.maxFeeds).toBe(20);
    expect(PLANS.premium.maxFeeds).toBe(-1); // unlimited
  });

  it('should have correct pricing', () => {
    expect(PLANS.base.monthlyPrice).toBe(5.00);
    expect(PLANS.base.yearlyPrice).toBe(45.00);
    expect(PLANS.premium.monthlyPrice).toBe(134.00);
    expect(PLANS.premium.yearlyPrice).toBe(1206.00);
  });
});

describe('getPlanConfig', () => {
  it('should return correct plan config', () => {
    const basePlan = getPlanConfig('base');
    expect(basePlan.name).toBe('BASE');
    expect(basePlan.maxFeeds).toBe(2);
  });

  it('should handle case insensitive plan names', () => {
    const plan1 = getPlanConfig('BASE');
    const plan2 = getPlanConfig('base');
    const plan3 = getPlanConfig('Base');
    
    expect(plan1.maxFeeds).toBe(2);
    expect(plan2.maxFeeds).toBe(2);
    expect(plan3.maxFeeds).toBe(2);
  });

  it('should default to basic plan for invalid names', () => {
    const invalidPlan = getPlanConfig('invalid');
    expect(invalidPlan.name).toBe('BASIC');
    expect(invalidPlan.maxFeeds).toBe(6);
  });
});

describe('canCreateFeed', () => {
  describe('BASE plan (2 feeds max)', () => {
    it('should allow creating first feed', () => {
      expect(canCreateFeed('base', 0)).toBe(true);
    });

    it('should allow creating second feed', () => {
      expect(canCreateFeed('base', 1)).toBe(true);
    });

    it('should not allow creating third feed', () => {
      expect(canCreateFeed('base', 2)).toBe(false);
    });

    it('should not allow creating feed when over limit', () => {
      expect(canCreateFeed('base', 3)).toBe(false);
    });
  });

  describe('MID plan (4 feeds max)', () => {
    it('should allow creating feeds up to limit', () => {
      expect(canCreateFeed('mid', 0)).toBe(true);
      expect(canCreateFeed('mid', 1)).toBe(true);
      expect(canCreateFeed('mid', 2)).toBe(true);
      expect(canCreateFeed('mid', 3)).toBe(true);
    });

    it('should not allow creating feed at limit', () => {
      expect(canCreateFeed('mid', 4)).toBe(false);
    });
  });

  describe('PRO plan (20 feeds max)', () => {
    it('should allow creating feeds up to limit', () => {
      expect(canCreateFeed('pro', 19)).toBe(true);
    });

    it('should not allow creating feed at limit', () => {
      expect(canCreateFeed('pro', 20)).toBe(false);
    });
  });

  describe('PREMIUM plan (unlimited feeds)', () => {
    it('should always allow creating feeds', () => {
      expect(canCreateFeed('premium', 0)).toBe(true);
      expect(canCreateFeed('premium', 50)).toBe(true);
      expect(canCreateFeed('premium', 100)).toBe(true);
      expect(canCreateFeed('premium', 1000)).toBe(true);
    });
  });

  it('should handle case insensitive plan names', () => {
    expect(canCreateFeed('BASE', 1)).toBe(true);
    expect(canCreateFeed('Base', 1)).toBe(true);
    expect(canCreateFeed('base', 1)).toBe(true);
  });

  it('should default to basic plan (6 feeds) for invalid plans', () => {
    expect(canCreateFeed('invalid', 5)).toBe(true);
    expect(canCreateFeed('invalid', 6)).toBe(false);
  });
});

describe('getRemainingFeeds', () => {
  it('should calculate remaining feeds correctly', () => {
    expect(getRemainingFeeds('base', 0)).toBe(2);
    expect(getRemainingFeeds('base', 1)).toBe(1);
    expect(getRemainingFeeds('base', 2)).toBe(0);
  });

  it('should return 0 when over limit', () => {
    expect(getRemainingFeeds('base', 3)).toBe(0);
    expect(getRemainingFeeds('mid', 10)).toBe(0);
  });

  it('should return -1 for unlimited plans', () => {
    expect(getRemainingFeeds('premium', 0)).toBe(-1);
    expect(getRemainingFeeds('premium', 100)).toBe(-1);
    expect(getRemainingFeeds('premium', 1000)).toBe(-1);
  });

  it('should handle different plan tiers', () => {
    expect(getRemainingFeeds('mid', 2)).toBe(2);
    expect(getRemainingFeeds('grow', 5)).toBe(3);
    expect(getRemainingFeeds('pro', 15)).toBe(5);
  });
});

describe('isValidPlanName', () => {
  it('should validate correct plan names', () => {
    expect(isValidPlanName('base')).toBe(true);
    expect(isValidPlanName('mid')).toBe(true);
    expect(isValidPlanName('basic')).toBe(true);
    expect(isValidPlanName('grow')).toBe(true);
    expect(isValidPlanName('pro')).toBe(true);
    expect(isValidPlanName('premium')).toBe(true);
  });

  it('should reject invalid plan names', () => {
    expect(isValidPlanName('invalid')).toBe(false);
    expect(isValidPlanName('free')).toBe(false);
    expect(isValidPlanName('')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isValidPlanName('BASE')).toBe(true);
    expect(isValidPlanName('Base')).toBe(true);
    expect(isValidPlanName('base')).toBe(true);
    expect(isValidPlanName('PREMIUM')).toBe(true);
  });
});

describe('Edge Cases', () => {
  it('should handle negative feed counts', () => {
    expect(canCreateFeed('base', -1)).toBe(true); // Should still allow
    expect(getRemainingFeeds('base', -1)).toBeGreaterThan(0);
  });

  it('should handle zero feed counts', () => {
    expect(canCreateFeed('base', 0)).toBe(true);
    expect(getRemainingFeeds('base', 0)).toBe(2);
  });

  it('should handle very large feed counts', () => {
    expect(canCreateFeed('base', 999999)).toBe(false);
    expect(getRemainingFeeds('base', 999999)).toBe(0);
  });
});

describe('Plan Features', () => {
  it('should have features array for each plan', () => {
    Object.values(PLANS).forEach(plan => {
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
    });
  });

  it('should have scheduled updates configuration', () => {
    expect(PLANS.base.scheduledUpdatesPerDay).toBe(1);
    expect(PLANS.pro.scheduledUpdatesPerDay).toBe(4);
    expect(PLANS.premium.scheduledUpdatesPerDay).toBe(8);
  });
});

describe('Security Tests', () => {
  it('should not allow SQL injection in plan names', () => {
    const maliciousPlan = getPlanConfig("'; DROP TABLE Shop; --");
    // Should default to basic plan
    expect(maliciousPlan.name).toBe('BASIC');
  });

  it('should sanitize plan names', () => {
    const plan1 = getPlanConfig('base<script>alert("xss")</script>');
    expect(plan1.name).toBe('BASIC'); // Invalid, defaults to basic
  });

  it('should handle unicode characters in plan names', () => {
    const plan = getPlanConfig('基本');
    expect(plan.name).toBe('BASIC'); // Invalid, defaults to basic
  });
});

