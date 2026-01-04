# Secure Billing Implementation Guide

## Overview

This implementation uses **Manual Pricing with the Billing API** to give you full control over your pricing page while maintaining security and reliability.

## What Was Implemented

### 1. Database Schema (`prisma/schema.prisma`)
- Added `Subscription` model to track all subscriptions
- Tracks subscription status, plan, pricing, and billing period
- Properly indexed for fast queries

### 2. Billing Configuration (`app/shopify.server.ts`)
- All 12 plan configurations (6 plans × 2 intervals)
- Server-side price definitions (cannot be manipulated by clients)
- Type-safe plan constants

### 3. Secure Plan Selection (`app/routes/app.choose-plan.tsx`)
- Uses `billing.request()` from Shopify's billing API
- Server-side plan validation
- Client prices are display-only; real prices come from server config

### 4. Billing Callback Handler (`app/routes/app.billing-callback.tsx`)
- 7-step security verification process
- Verifies subscription was actually approved
- Checks subscription status is ACTIVE
- Blocks test subscriptions in production
- Saves subscription to database
- Updates shop's plan

### 5. Webhook Handler (`app/routes/webhooks.app_subscriptions.update.tsx`)
- Keeps database synchronized with Shopify
- Handles status changes (ACTIVE, CANCELLED, EXPIRED, etc.)
- Updates shop plan automatically
- Reverts to basic plan on cancellation/expiration

### 6. Security Functions (`app/services/shopify/subscription.server.ts`)
- `getCurrentSubscription()` - Fast database lookup
- `requireActivePlan()` - Enforce minimum plan level
- `canCreateFeed()` - Check feed creation limits
- `verifySubscriptionFromShopify()` - Double-check with Shopify API
- `getMaxFeedsForPlan()` - Plan-based limits
- `getMaxScheduledUpdatesForPlan()` - Plan-based update limits

## Setup Instructions

### Step 1: Run Database Migration

```bash
npx prisma migrate dev --name add_subscription_model
```

This creates the Subscription table in your database.

### Step 2: Deploy Your App

```bash
npm run deploy
# or
netlify deploy --prod
```

### Step 3: Register Webhooks

After deployment, Shopify CLI will automatically register the webhooks defined in `shopify.app.toml`, including:
- `app_subscriptions/update` - For subscription status changes

You can verify webhooks are registered by checking your Partner Dashboard.

### Step 4: Test the Billing Flow

1. **Install your app on a development store**
   ```bash
   npm run dev
   ```

2. **Navigate to the plan selection page**
   - Go to `/app/choose-plan`
   - Select a plan and click "Subscribe"

3. **Complete the checkout**
   - You'll be redirected to Shopify's confirmation page
   - Click "Approve" to complete the subscription

4. **Verify subscription was saved**
   - Check your database for the subscription record
   - Verify the shop's plan was updated

## Security Features

### ✅ What Makes This Secure

1. **Server-Side Price Validation**
   - Prices are defined in `shopify.server.ts` billing config
   - Client cannot manipulate prices
   - Shopify validates against your billing config

2. **Subscription Verification**
   - After approval, we query Shopify to verify subscription
   - Must be ACTIVE status
   - Must match expected price and plan

3. **Database Synchronization**
   - Webhook keeps database up-to-date
   - Any status change is immediately reflected
   - Prevents stale subscription data

4. **Plan Enforcement**
   - `requireActivePlan()` checks before granting access
   - Plan hierarchy enforced (can't downgrade to access features)
   - Feed limits enforced server-side

5. **Test Protection**
   - Test subscriptions blocked in production
   - Prevents free access via test charges

6. **Exploit Prevention**
   - Cannot manipulate form data to change prices
   - Cannot bypass subscription checks
   - Cannot access features above plan level

## How to Protect Routes

### Example: Protect Feed Creation

```typescript
// app/routes/app.feeds.create.tsx
import { requireActivePlan, canCreateFeed } from "../services/shopify/subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Require at least BASE plan
  await requireActivePlan(request, 'base');

  // Check if they can create more feeds
  const { allowed, currentCount, maxAllowed, plan } = await canCreateFeed(request);

  if (!allowed) {
    throw new Response(
      `Feed limit reached. You have ${currentCount}/${maxAllowed} feeds on the ${plan.toUpperCase()} plan.`,
      {
        status: 403,
        headers: {
          "X-Shopify-Redirect": "/app/choose-plan?upgrade=true",
        },
      }
    );
  }

  // Continue with feed creation...
};
```

### Example: Require PRO Plan for Advanced Features

```typescript
// app/routes/app.advanced-feature.tsx
import { requireActivePlan } from "../services/shopify/subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Require PRO plan minimum
  await requireActivePlan(request, 'pro');

  // User has PRO or PREMIUM, allow access
  // ...
};
```

## Billing Flow Diagram

```
User visits /app/choose-plan
    ↓
User selects plan & clicks Subscribe
    ↓
[SERVER] Validates plan key
    ↓
[SERVER] Calls billing.request()
    ↓
Shopify creates subscription & returns confirmationUrl
    ↓
User redirected to Shopify's confirmation page
    ↓
User approves or declines
    ↓
Shopify redirects to /app/billing-callback?charge_id=XXX
    ↓
[SERVER] Queries Shopify for subscription details
    ↓
[SERVER] Verifies status is ACTIVE
    ↓
[SERVER] Saves subscription to database
    ↓
[SERVER] Updates shop.plan
    ↓
User redirected to /app/feeds
```

## Webhook Flow

```
Shopify: Subscription status changes
    ↓
Shopify sends webhook to /webhooks/app_subscriptions/update
    ↓
[SERVER] Authenticates webhook (Shopify signature)
    ↓
[SERVER] Extracts subscription data
    ↓
[SERVER] Updates/creates subscription in database
    ↓
[SERVER] Updates shop.plan if ACTIVE
    ↓
[SERVER] Reverts to basic if CANCELLED/EXPIRED
```

## Plan Limits Reference

| Plan    | Max Feeds | Scheduled Updates/Day | Monthly Price | Yearly Price |
|---------|-----------|----------------------|---------------|--------------|
| BASE    | 2         | 1                    | €5            | €45          |
| MID     | 4         | 1                    | €14           | €126         |
| BASIC   | 6         | 1                    | €21           | €189         |
| GROW    | 8         | 1                    | €27           | €243         |
| PRO     | 20        | 4                    | €59           | €531         |
| PREMIUM | Unlimited | 8                    | €134          | €1206        |

## Testing Checklist

- [ ] Database migration completed
- [ ] App deployed to production
- [ ] Webhooks registered
- [ ] Can select and subscribe to a plan
- [ ] Subscription saved to database
- [ ] Shop plan updated correctly
- [ ] Webhook receives updates
- [ ] Cancelled subscription reverts plan
- [ ] Feed limits enforced
- [ ] Test subscriptions blocked in production
- [ ] Billing flow works on dev stores
- [ ] Billing flow works on production stores

## Common Issues & Solutions

### Issue: "Managed Pricing Apps cannot use the Billing API"
**Solution:** Your app is configured for Managed Pricing in Partner Dashboard. Switch to "Manual billing with the API" in your app's pricing settings.

### Issue: Webhook not being called
**Solution:**
1. Check webhook is registered: `shopify app env show`
2. Verify URL is accessible
3. Check Shopify webhook logs in Partner Dashboard

### Issue: Subscription not saving to database
**Solution:**
1. Check database migration was run
2. Verify DATABASE_URL is correct
3. Check server logs for errors in billing-callback

### Issue: User gets redirected to choose-plan repeatedly
**Solution:**
1. Verify subscription status is ACTIVE in database
2. Check webhook is updating subscription correctly
3. Ensure shop.plan is being updated

## Security Best Practices

1. ✅ **Never trust client-side data for pricing**
   - All prices defined server-side
   - Validation happens on server

2. ✅ **Always verify subscriptions**
   - After callback, query Shopify
   - Check status is ACTIVE
   - Verify it's not a test subscription in production

3. ✅ **Use database for fast checks**
   - Query database for subscription status
   - Only query Shopify API for critical operations

4. ✅ **Enforce plan limits server-side**
   - Never trust client for feature access
   - Always check `requireActivePlan()` in loaders

5. ✅ **Handle webhook delays**
   - Subscription might take a few seconds to sync
   - Use database as source of truth
   - Fall back to Shopify API if needed

6. ✅ **Log everything**
   - Log billing events for debugging
   - Track subscription changes
   - Monitor for suspicious activity

## Support

If you encounter issues:
1. Check server logs for errors
2. Verify database contains subscription
3. Check webhook delivery in Partner Dashboard
4. Ensure environment variables are set correctly

## Next Steps

After billing is working:
1. Add subscription info to your dashboard
2. Add upgrade prompts when limits are reached
3. Add cancellation flow
4. Add plan comparison table
5. Monitor subscription metrics
