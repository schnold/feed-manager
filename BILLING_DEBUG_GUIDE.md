# Billing Debug Guide

## Current Issue
The `planId` and `isTest` fields are not being set correctly in the database, even though `name`, `status`, and `price` are being written correctly.

## Debug Steps

### 1. Check the logs after making a purchase

Look for these log messages in order:

#### In the billing callback (`/app/billing-callback`):
```
🔥 RAW Subscription object from Shopify
🔥 DATA TO SAVE TO DATABASE
🔥 CRITICAL VALUES
✅ Created/Updated subscription in DB
VERIFICATION - Shop after update
```

#### In the webhook handler (`/webhooks/app_subscriptions/update`):
```
🔥 RAW WEBHOOK PAYLOAD
🔥 DATA TO SAVE
🔥 CRITICAL VALUES
✅ Created/Updated in DB
```

### 2. What to look for in the logs

#### Check if the billing callback receives correct data:
- `subscription.test` should be `true` (in test mode) or `false` (in production)
- `subscription.lineItems[0].plan.pricingDetails.interval` should be `EVERY_30_DAYS` or `ANNUAL`
- `subscription.lineItems[0].plan.pricingDetails.price.amount` should match the plan price

#### Check if planId mapping is working:
- Look for "Mapped to plan: XXX" log message
- Compare the price and interval to see if it matches expected plan
- Check if `planIdType` is "string" (should be)
- Check if `isTestType` is "boolean" (should be)

#### Check if data is being saved correctly:
- Compare "DATA TO SAVE" with "Created/Updated in DB"
- If they don't match, there's a database issue
- If they match but the database shows different values later, the webhook is overwriting

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

## Expected Flow

1. **User clicks "Subscribe" button** → calls `/app/choose-plan` action
2. **Shopify billing.request()** → redirects to Shopify confirmation page
3. **User approves** → Shopify redirects to `/app/billing-callback?charge_id=XXX`
4. **Billing callback** → queries subscription, saves to DB, updates shop
5. **Shopify sends webhook** → `/webhooks/app_subscriptions/update` (might happen before or after step 4!)
6. **Webhook handler** → updates subscription in DB, updates shop

## Critical Code Paths

### Billing Callback (app/routes/app.billing-callback.tsx)
- Lines 69-78: Raw subscription logging
- Lines 111-146: Plan ID mapping logic
- Lines 179-244: Database save with logging

### Webhook Handler (app/routes/webhooks.app_subscriptions.update.tsx)
- Lines 32-43: Raw webhook payload logging
- Lines 45-76: Plan ID mapping from name
- Lines 105-176: Database save with logging

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
