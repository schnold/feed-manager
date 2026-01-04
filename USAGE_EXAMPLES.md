# Billing Security - Usage Examples

## Protecting Routes with Subscription Checks

### Example 1: Basic Route Protection

```typescript
// app/routes/app.feeds.tsx
import { LoaderFunctionArgs } from "@remix-run/node";
import { requireActivePlan } from "../services/shopify/subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Require at least BASE plan (minimum subscription)
  const subscription = await requireActivePlan(request, 'base');

  // If we get here, user has an active subscription
  // Continue with your logic...

  return json({
    subscription,
    // ... other data
  });
};
```

### Example 2: Check Feed Limits Before Creation

```typescript
// app/routes/app.feeds.create.tsx
import { ActionFunctionArgs, json } from "@remix-run/node";
import { canCreateFeed } from "../services/shopify/subscription.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Check if user can create another feed
  const feedCheck = await canCreateFeed(request);

  if (!feedCheck.allowed) {
    return json({
      error: `Feed limit reached`,
      message: `You have ${feedCheck.currentCount} of ${feedCheck.maxAllowed} feeds on the ${feedCheck.plan.toUpperCase()} plan. Please upgrade to create more feeds.`,
      upgradeRequired: true,
    }, { status: 403 });
  }

  // User can create feed, proceed...
  // ... create feed logic
};
```

### Example 3: Feature Gating by Plan Level

```typescript
// app/routes/app.advanced-analytics.tsx
import { LoaderFunctionArgs } from "@remix-run/node";
import { requireActivePlan } from "../services/shopify/subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This feature requires PRO plan minimum
  const subscription = await requireActivePlan(request, 'pro');

  // Only PRO and PREMIUM users can access this
  // ... load analytics data
};
```

### Example 4: Display Current Plan Info

```typescript
// app/routes/app.settings.tsx
import { LoaderFunctionArgs, json } from "@remix-run/node";
import {
  getCurrentSubscription,
  getMaxFeedsForPlan,
  getMaxScheduledUpdatesForPlan
} from "../services/shopify/subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const subscription = await getCurrentSubscription(request);

  if (!subscription) {
    return json({
      hasSubscription: false,
      redirectToPlans: true,
    });
  }

  const maxFeeds = getMaxFeedsForPlan(subscription.plan);
  const maxUpdates = getMaxScheduledUpdatesForPlan(subscription.plan);

  return json({
    hasSubscription: true,
    subscription: {
      plan: subscription.plan,
      name: subscription.name,
      status: subscription.status,
      isTest: subscription.isTest,
      trialEndsAt: subscription.trialEndsAt,
    },
    limits: {
      maxFeeds,
      maxUpdates,
    },
  });
};
```

### Example 5: Enforce Schedule Limits

```typescript
// app/routes/app.feeds.$feedId.schedule.tsx
import { ActionFunctionArgs, json } from "@remix-run/node";
import {
  requireActivePlan,
  getMaxScheduledUpdatesForPlan
} from "../services/shopify/subscription.server";
import db from "../db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const subscription = await requireActivePlan(request, 'base');

  // Get max schedules allowed for this plan
  const maxSchedules = getMaxScheduledUpdatesForPlan(subscription.plan);

  // Check existing schedules for this feed
  const existingSchedules = await db.feedSchedule.count({
    where: {
      feedId: params.feedId,
      enabled: true,
    },
  });

  if (existingSchedules >= maxSchedules) {
    return json({
      error: 'Schedule limit reached',
      message: `Your ${subscription.plan.toUpperCase()} plan allows ${maxSchedules} scheduled update${maxSchedules > 1 ? 's' : ''} per feed per day. Please upgrade for more.`,
      upgradeRequired: true,
    }, { status: 403 });
  }

  // Create schedule...
};
```

### Example 6: Conditional UI Based on Plan

```typescript
// app/routes/app.feeds.tsx
import { useLoaderData } from "@remix-run/react";
import { Banner, Button } from "@shopify/polaris";

export default function Feeds() {
  const { subscription, feedCheck } = useLoaderData<typeof loader>();

  return (
    <Page>
      {!feedCheck.allowed && (
        <Banner
          title="Feed Limit Reached"
          tone="warning"
          action={{
            content: 'Upgrade Plan',
            url: '/app/choose-plan',
          }}
        >
          You have {feedCheck.currentCount} of {feedCheck.maxAllowed} feeds.
          Upgrade to {subscription.plan === 'base' ? 'MID' : 'PRO'} plan to create more feeds.
        </Banner>
      )}

      {/* Feed list */}
    </Page>
  );
}
```

### Example 7: Verify Critical Operations with Shopify

```typescript
// app/routes/api.critical-operation.tsx
import { ActionFunctionArgs, json } from "@remix-run/node";
import { verifySubscriptionFromShopify } from "../services/shopify/subscription.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // For critical operations, double-check with Shopify
  const shop = await db.shop.findUnique({
    where: { /* ... */ },
    include: {
      subscriptions: {
        where: { status: 'ACTIVE' },
        take: 1,
      },
    },
  });

  if (shop?.subscriptions[0]) {
    // Verify with Shopify API
    const verification = await verifySubscriptionFromShopify(
      request,
      shop.subscriptions[0].shopifySubscriptionId
    );

    if (!verification.valid) {
      return json({
        error: 'Subscription verification failed',
      }, { status: 403 });
    }

    // Proceed with critical operation...
  }
};
```

### Example 8: Handle Subscription Errors Gracefully

```typescript
// app/routes/app.feeds.tsx
import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireActivePlan } from "../services/shopify/subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await requireActivePlan(request, 'base');
  } catch (error) {
    // requireActivePlan throws a Response object
    if (error instanceof Response) {
      // Check if it's a redirect header
      const redirectHeader = error.headers.get("X-Shopify-Redirect");
      if (redirectHeader) {
        // User needs a subscription, show appropriate message
        return json({
          needsSubscription: true,
          redirectUrl: redirectHeader,
        });
      }
    }
    throw error;
  }

  // User has subscription, load data...
};
```

### Example 9: API Route Protection

```typescript
// app/routes/api.feeds.generate.tsx
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireActivePlan } from "../services/shopify/subscription.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // API routes need subscription too
  try {
    await requireActivePlan(request, 'base');
  } catch (error) {
    return json({
      error: 'Subscription required',
      message: 'An active subscription is required to use this API.',
    }, { status: 403 });
  }

  // Process API request...
};
```

### Example 10: Upgrade Prompts

```typescript
// app/routes/app.feeds.create.tsx
import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { canCreateFeed } from "../services/shopify/subscription.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const feedCheck = await canCreateFeed(request);

  if (!feedCheck.allowed) {
    // Instead of just blocking, suggest upgrade
    const suggestedPlan = feedCheck.plan === 'base' ? 'mid' :
                         feedCheck.plan === 'mid' ? 'basic' :
                         feedCheck.plan === 'basic' ? 'grow' : 'pro';

    return json({
      error: 'Feed limit reached',
      currentPlan: feedCheck.plan,
      suggestedPlan,
      upgradeUrl: `/app/choose-plan?highlight=${suggestedPlan}`,
    }, { status: 403 });
  }

  // Create feed...
};
```

## Testing Your Protection

### Test Script

```typescript
// test-subscription-protection.ts
import { requireActivePlan, canCreateFeed } from "./app/services/shopify/subscription.server";

async function testProtection() {
  // Test 1: Check if subscription is required
  console.log("Test 1: Subscription required...");
  try {
    await requireActivePlan(mockRequest, 'base');
    console.log("✅ User has subscription");
  } catch (error) {
    console.log("❌ User needs subscription");
  }

  // Test 2: Check feed limits
  console.log("\nTest 2: Feed limits...");
  const feedCheck = await canCreateFeed(mockRequest);
  console.log(`Current: ${feedCheck.currentCount}/${feedCheck.maxAllowed}`);
  console.log(`Can create: ${feedCheck.allowed ? '✅' : '❌'}`);

  // Test 3: Plan hierarchy
  console.log("\nTest 3: Plan hierarchy...");
  try {
    await requireActivePlan(mockRequest, 'premium');
    console.log("✅ User has PREMIUM plan");
  } catch (error) {
    console.log("❌ User needs to upgrade to PREMIUM");
  }
}
```

## Security Checklist

Before deploying to production:

- [ ] All protected routes use `requireActivePlan()`
- [ ] Feed creation checks `canCreateFeed()`
- [ ] Schedule creation checks plan limits
- [ ] API routes are protected
- [ ] Test subscriptions blocked in production
- [ ] Webhook is registered and working
- [ ] Database migration completed
- [ ] Prices match between code and Partner Dashboard
- [ ] Error handling for subscription failures
- [ ] Logging for subscription events
