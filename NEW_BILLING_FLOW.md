# New Billing Flow - State of the Art Implementation

## Overview
The billing system has been completely refactored to follow Shopify's state-of-the-art best practices as documented in their MCP (Model Context Protocol) documentation. The old custom callback approach has been replaced with `billing.check()` verification.

## What Changed

### Old Approach (REMOVED)
1. User clicks "Subscribe" → `billing.request()` redirects to Shopify
2. After approval → Shopify calls custom `/app/billing-callback` route
3. Callback queries subscription details and saves to database
4. **PROBLEM**: Callback was redirecting (302) without executing because it was accessed from outside embedded context

### New Approach (STATE OF THE ART)
1. User clicks "Subscribe" → `billing.request()` redirects to Shopify
2. After approval → Shopify redirects to Shopify Admin embedded app URL
3. App loader uses `billing.check()` to verify subscription
4. App queries subscription details via GraphQL and syncs to database
5. Webhook provides redundant sync for reliability

## Key Components

### 1. Choose Plan Page (`app/routes/app.choose-plan.tsx`)

**ReturnUrl Format**:
```typescript
const storeHandle = shop.replace('.myshopify.com', '');
const appHandle = process.env.SHOPIFY_APP_HANDLE || 'feed-manager';
let returnUrl = `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}/app/feeds?subscription=success`;
```

**Why this format?**
- Points to Shopify Admin embedded app (not custom callback)
- Includes `?subscription=success` query parameter to trigger sync
- Works properly within embedded app context

### 2. Feeds Page Loader (`app/routes/app.feeds._index.tsx`)

**Sync Logic**:
```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing, admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Check for subscription success parameter
  const subscriptionParam = url.searchParams.get('subscription');
  if (subscriptionParam === 'success') {
    console.log(`[feeds._index] 🔥 Billing success detected, syncing subscription`);
    try {
      await syncSubscriptionFromShopify(session.shop, billing, admin);
    } catch (error) {
      console.error('[feeds._index] Failed to sync subscription:', error);
      // Continue loading - don't block the user
    }
  }

  // ... rest of loader logic
};
```

### 3. Subscription Sync Function (`app/services/shopify/subscription.server.ts`)

**New Function: `syncSubscriptionFromShopify()`**

This function implements the state-of-the-art billing verification:

```typescript
export async function syncSubscriptionFromShopify(
  shopDomain: string,
  billing: any,
  admin: any
): Promise<void>
```

**Steps**:
1. **Use `billing.check()`** to verify active subscriptions (Shopify recommended method)
2. **Query full details** via GraphQL Admin API
3. **Extract pricing info** from `lineItems[0].plan.pricingDetails`
4. **Map price + interval to planId**:
   - Monthly €5 = `base`
   - Monthly €27 = `grow`
   - Yearly €243 = `grow_yearly`
   - etc.
5. **Save to database** with all fields including `planId`, `isTest`, `price`, `interval`
6. **Update shop** with plan and features

### 4. Webhook Handler (`app/routes/webhooks.app_subscriptions.update.tsx`)

**Still Active** - Provides redundant sync for reliability

The webhook handler was already fixed in previous updates to:
- Parse lowercase plan names correctly (`"base"` not `"BASE Plan"`)
- Use `subscription.interval` field (not `subscription.billing_interval`)
- Compute `isTest` from shop domain (webhook doesn't include this field)
- Update shop features field when subscription becomes ACTIVE

## Complete Flow Diagram

```
1. User visits /app/choose-plan
   ↓
2. User clicks "Subscribe to GROW" button
   ↓
3. Action handler calls billing.request({
      plan: 'grow',
      returnUrl: 'https://admin.shopify.com/store/{store}/apps/{app}/app/feeds?subscription=success'
   })
   ↓
4. Shopify redirects user to billing approval page
   ↓
5. User approves subscription
   ↓
6. Shopify redirects to returnUrl (embedded app context)
   ↓
7. /app/feeds loader detects ?subscription=success parameter
   ↓
8. Loader calls syncSubscriptionFromShopify()
   ↓
9. syncSubscriptionFromShopify() calls billing.check()
   ↓
10. Gets active subscription ID from billing.check()
    ↓
11. Queries full subscription details via GraphQL
    ↓
12. Maps price (€27) + interval (EVERY_30_DAYS) → planId: 'grow'
    ↓
13. Saves to database with correct planId, isTest, price, etc.
    ↓
14. Updates shop plan = 'grow', features = PLAN_FEATURES['grow']
    ↓
15. User sees feeds page with updated plan limits
    ↓
16. (Later) Webhook fires and provides redundant sync
```

## Environment Variables Required

Make sure these are set in your `.env`:

```env
SHOPIFY_APP_HANDLE=feed-manager  # Or your actual app handle from shopify.app.toml
```

## Benefits of New Approach

1. **No custom callback routes** - Works within embedded app context
2. **Uses `billing.check()`** - Shopify's recommended API
3. **GraphQL query for details** - Complete subscription information
4. **Reliable plan mapping** - Based on actual price and interval from Shopify
5. **Redundant sync** - Both loader and webhook update the database
6. **Better error handling** - Sync failures don't block the user
7. **Comprehensive logging** - 🔥 markers show sync progress

## Debugging

### Check if sync is working:

1. **After subscribing**, look for these logs:
```
[feeds._index] 🔥 Billing success detected, syncing subscription
[syncSubscription] 🔥 Starting subscription sync for {shop}
[syncSubscription] 🔥 RAW Subscription from Shopify: {...}
[syncSubscription] 🔥 DATA TO SAVE: {...}
[syncSubscription] ✅ Successfully synced subscription
```

2. **Check database**:
```sql
SELECT
  id,
  "planId",
  "isTest",
  price,
  "billingInterval",
  status,
  name
FROM "Subscription"
ORDER BY "createdAt" DESC
LIMIT 1;
```

3. **Verify shop plan**:
```sql
SELECT
  id,
  "myshopifyDomain",
  plan,
  features
FROM "Shop"
WHERE "myshopifyDomain" = '{shop}.myshopify.com';
```

### Common Issues:

#### Issue: No sync logs after approval
**Cause**: User not redirected to `/app/feeds?subscription=success`
**Solution**: Check `SHOPIFY_APP_HANDLE` env variable matches your actual app handle

#### Issue: billing.check() returns no subscriptions
**Cause**: Subscription not yet active in Shopify
**Solution**: Wait a few seconds, or check Shopify admin for subscription status

#### Issue: planId still wrong
**Cause**: Price mapping doesn't match your actual prices
**Solution**: Check the RAW Subscription log to see actual price, update mapping in `syncSubscriptionFromShopify()`

## Migration Notes

The old `/app/billing-callback` route is **deprecated but not removed**. It's no longer used in the flow, but kept for reference. You can safely remove it if desired.

The webhook handler is still active and provides a redundant sync mechanism for reliability.

## References

- Shopify MCP Docs: "Redirect to the plan selection page"
- Shopify Billing API: `billing.check()` and `billing.require()`
- Shopify Admin GraphQL API: `AppSubscription` type
