# Billing Debug Guide

## ✅ FIXED - New Billing Flow Implemented

The billing system has been refactored to use Shopify's state-of-the-art approach with `billing.check()` instead of custom callback routes.

**See `NEW_BILLING_FLOW.md` for complete documentation of the new approach.**

## Debug Steps for New Flow

### 1. Check the logs after making a purchase

Look for these log messages in order:

#### In the feeds loader (`/app/feeds`):
```
[feeds._index] 🔥 Billing success detected, syncing subscription for {shop}
[syncSubscription] 🔥 Starting subscription sync for {shop}
[syncSubscription] Billing check result: {...}
[syncSubscription] 🔥 RAW Subscription from Shopify: {...}
[syncSubscription] Mapped to plan: {planId}
[syncSubscription] 🔥 DATA TO SAVE: {...}
[syncSubscription] ✅ Successfully synced subscription for {shop}, plan: {planId}
```

#### In the webhook handler (`/webhooks/app_subscriptions/update`) - Redundant Sync:
```
🔥 RAW WEBHOOK PAYLOAD
🔥 DATA TO SAVE
🔥 CRITICAL VALUES
✅ Created/Updated in DB
```

### 2. What to look for in the logs

#### Check if billing.check() is working:
- `hasActivePayment` should be `true`
- `subscriptionCount` should be `> 0`
- Active subscription ID should be logged

#### Check if GraphQL query returns correct data:
- `subscription.test` should be `true` (in test mode) or `false` (in production)
- `subscription.lineItems[0].plan.pricingDetails.interval` should be `EVERY_30_DAYS` or `ANNUAL`
- `subscription.lineItems[0].plan.pricingDetails.price.amount` should match the plan price

#### Check if planId mapping is working:
- Look for "Mapped to plan: XXX" log message
- Compare the price and interval to see if it matches expected plan
- Monthly €5 = `base`, €27 = `grow`, €59 = `pro`, €134 = `premium`
- Yearly €45 = `base_yearly`, €243 = `grow_yearly`, €531 = `pro_yearly`, €1206 = `premium_yearly`

#### Check if data is being saved correctly:
- Compare "DATA TO SAVE" with the database query results
- Verify `planId`, `isTest`, `price`, `billingInterval` are all correct
- Check that shop's `plan` and `features` fields are updated

### 3. Debugging the Webhook

The webhook might be:
1. **Receiving different data format** than expected
2. **Overwriting the correct values** from the callback
3. **Parsing the plan name incorrectly**

Check the webhook logs for:
- What is `subscription.test` in the webhook payload?
- What is `subscription.name` format? (should be like "GROW Plan", "BASE Plan", etc.)
- What is `subscription.billing_interval`?
- Is the planId being mapped correctly?

### 4. Check database directly

Run this query to see what's actually in the database:

```sql
SELECT
    id,
    "shopifySubscriptionId",
    name,
    status,
    "planId",
    "billingInterval",
    price,
    "isTest",
    "createdAt",
    "updatedAt"
FROM "Subscription"
ORDER BY "createdAt" DESC
LIMIT 5;
```

### 5. Common Issues

#### Issue: planId is always "basic"
**Cause**: Price comparison is failing or interval format is unexpected
**Solution**: Check the raw subscription object to see exact price and interval values

#### Issue: isTest is always false
**Cause**: `subscription.test` is undefined or null in the response
**Solution**: Check if Shopify is returning the `test` field. In webhooks it might be different field name.

#### Issue: Webhook overwrites correct values
**Cause**: Webhook fires after callback and has different data
**Solution**: Ensure webhook uses the same mapping logic, or don't update these fields in webhook

## Expected Flow (NEW STATE-OF-THE-ART APPROACH)

1. **User clicks "Subscribe" button** → calls `/app/choose-plan` action
2. **Shopify billing.request()** → redirects to Shopify confirmation page
3. **User approves** → Shopify redirects to `https://admin.shopify.com/store/{store}/apps/{app}/app/feeds?subscription=success`
4. **Feeds loader** → detects `?subscription=success` parameter
5. **Feeds loader** → calls `syncSubscriptionFromShopify()`
6. **syncSubscriptionFromShopify()** → uses `billing.check()` to get active subscription
7. **syncSubscriptionFromShopify()** → queries subscription details via GraphQL
8. **syncSubscriptionFromShopify()** → maps price + interval to planId
9. **syncSubscriptionFromShopify()** → saves to DB, updates shop plan and features
10. **Shopify sends webhook** → `/webhooks/app_subscriptions/update` (redundant sync for reliability)
11. **Webhook handler** → updates subscription in DB, updates shop (if sync didn't already happen)

## Critical Code Paths (NEW)

### Choose Plan Action (app/routes/app.choose-plan.tsx)
- Lines 74-81: ReturnUrl construction
- Lines 83-86: billing.request() call

### Feeds Loader (app/routes/app.feeds._index.tsx)
- Lines 41-50: Subscription success detection and sync trigger

### Subscription Sync Function (app/services/shopify/subscription.server.ts)
- Lines 299-494: `syncSubscriptionFromShopify()` function
- Lines 307-318: billing.check() call
- Lines 324-367: GraphQL query for subscription details
- Lines 382-411: Plan ID mapping logic (price + interval → planId)
- Lines 430-473: Database save with logging
- Lines 475-486: Shop plan and features update

### Webhook Handler (app/routes/webhooks.app_subscriptions.update.tsx) - Still Active
- Lines 32-43: Raw webhook payload logging
- Lines 45-76: Plan ID mapping from name
- Lines 105-176: Database save with logging
- Lines 191-203: Shop plan and features update when ACTIVE

## What Should Happen

For a "GROW" monthly plan purchase (€27/month):
1. Shopify returns subscription with:
   - `name`: "grow Plan" or "GROW Plan"
   - `test`: true/false
   - `lineItems[0].plan.pricingDetails.price.amount`: 27 or 27.0
   - `lineItems[0].plan.pricingDetails.interval`: "EVERY_30_DAYS"

2. Mapping logic should produce:
   - `planId`: "grow"
   - `isTest`: true/false (from subscription.test)
   - `billingInterval`: "EVERY_30_DAYS"

3. Database should save exactly those values

4. Webhook should receive and parse the same values correctly
