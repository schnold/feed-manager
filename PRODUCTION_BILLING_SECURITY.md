# Production Billing Security Implementation

## Summary

This document outlines the security measures implemented to ensure the billing system is production-ready and cannot be exploited to bypass real charges.

---

## Security Changes Applied

### 1. Environment Configuration
**File:** `.env`
- ✅ Changed `NODE_ENV` from `development` to `production`
- ✅ Added comments clarifying that Netlify overrides this in production
- ✅ `netlify.toml` already has `NODE_ENV=production` configured (line 14)

### 2. Test Mode Logic Hardening
**File:** `app/services/shopify/billing.server.ts`

**Previous Vulnerability:**
- Lines 38-42 and 56-60 defaulted to test mode on errors
- Users could potentially exploit GraphQL query failures to bypass billing

**Security Fix:**
```typescript
// OLD (VULNERABLE):
if (data.errors) {
  return true; // Default to test mode
}
catch (error) {
  return true; // Default to test mode
}

// NEW (SECURE):
if (process.env.NODE_ENV !== 'production') {
  return true; // Test mode only in development
}

if (data.errors) {
  return false; // Production billing on errors (prevents exploitation)
}
catch (error) {
  return false; // Production billing on errors (prevents exploitation)
}
```

**Security Rationale:**
- Development environment: Always use test charges (safe for developers)
- Production environment with errors: Use real charges (prevents users from exploiting errors)
- Production environment with dev store: Use test charges (Shopify requirement)
- Production environment with production store: Use real charges (normal operation)

### 3. Webhook Handler Security Fix
**File:** `app/routes/webhooks.app_subscriptions.update.tsx`

**Previous Issue:**
```typescript
// WRONG: All stores have .myshopify.com domain
const isDevelopmentStore = shop.includes('myshopify.com');
const isTest = isDevelopmentStore; // Would mark ALL subscriptions as test
```

**Security Fix:**
```typescript
// Preserve existing isTest value from GraphQL sync (source of truth)
let isTest = subscription.test ?? false;
if (existingSubscription) {
  isTest = existingSubscription.isTest; // Preserve value from billing callback
}
```

**Security Rationale:**
- Webhook is not the primary source of subscription data
- GraphQL sync via `billing-callback` or `syncSubscriptionFromShopify` has the authoritative `test` flag
- Webhook should preserve existing database values, not overwrite with incorrect data

---

## Security Verification Checklist

### ✅ Server-Side Controls
- [x] `shouldUseTestCharges()` is called server-side only
- [x] Users cannot pass `isTest` parameter via form data
- [x] Plan validation uses server-side whitelist
- [x] Billing prices defined in `shopify.server.ts` (cannot be manipulated)
- [x] `billing.request()` called server-side with validated parameters

### ✅ Error Handling
- [x] Production environment defaults to real charges on errors
- [x] Development environment defaults to test charges (developer safety)
- [x] GraphQL query failures cannot be exploited to bypass billing
- [x] Authentication failures are properly logged

### ✅ Webhook Security
- [x] Shopify webhook authentication validates webhook legitimacy
- [x] Webhook preserves `isTest` value from authoritative sources
- [x] Webhook does not incorrectly mark production subscriptions as test

### ✅ Production Readiness
- [x] `NODE_ENV=production` in `.env` and `netlify.toml`
- [x] All test mode defaults removed for production environment
- [x] Logging includes billing mode for monitoring
- [x] Database stores `isTest` flag for audit trail

---

## How Billing Works (Production Mode)

### 1. User Subscribes to Plan
```
User clicks "Subscribe to GROW" button
  ↓
[SERVER] Validates plan key against whitelist
  ↓
[SERVER] Checks environment: NODE_ENV=production
  ↓
[SERVER] Queries Shopify: Is this a dev store?
  ↓
[SERVER] Dev store → isTest=true | Production store → isTest=false
  ↓
[SERVER] Calls billing.request({ plan: 'grow', isTest: false })
  ↓
Shopify creates REAL subscription (charges will be applied)
  ↓
User approves on Shopify's confirmation page
  ↓
Redirects to app with ?subscription=success
  ↓
[SERVER] Syncs subscription from Shopify GraphQL (gets test flag)
  ↓
[SERVER] Saves subscription to database with correct isTest value
```

### 2. Subscription Verification
```
On every app load
  ↓
[SERVER] Calls getCurrentSubscription()
  ↓
[SERVER] Reads subscription from database (cached, fast)
  ↓
[SERVER] Enforces plan limits based on subscription
  ↓
User can only access features their plan allows
```

### 3. Webhook Updates
```
Shopify sends APP_SUBSCRIPTIONS_UPDATE webhook
  ↓
[SERVER] Validates webhook signature (Shopify authentication)
  ↓
[SERVER] Updates subscription status (ACTIVE, CANCELLED, etc.)
  ↓
[SERVER] Preserves isTest value from database (GraphQL is source of truth)
  ↓
[SERVER] Updates shop plan and features based on subscription status
```

---

## Testing Strategy

### Development Environment (`NODE_ENV=development`)
- ✅ All subscriptions use test charges
- ✅ No real billing occurs
- ✅ Safe for development and testing

### Production Environment (`NODE_ENV=production`)
- ✅ Development stores: Test charges (Shopify requirement)
- ✅ Production stores: REAL charges
- ✅ No way for users to bypass real billing

### Verification Steps
1. Check server logs for billing mode messages:
   ```
   [billing] Production environment detected, checking shop type...
   [billing] Test mode: OFF (production store: example.myshopify.com)
   ```

2. Verify database subscription records:
   ```sql
   SELECT
     shopifySubscriptionId,
     planId,
     status,
     isTest,
     price
   FROM Subscription
   WHERE status = 'ACTIVE';
   ```

3. Monitor Shopify Partner Dashboard:
   - Check "Billing" section for real subscriptions
   - Verify charges are being created and billed
   - Review subscription statuses

---

## Security Guarantees

### ❌ CANNOT Be Exploited
1. ❌ Users cannot pass `isTest=true` via form data
2. ❌ Users cannot manipulate `NODE_ENV` environment variable
3. ❌ Users cannot cause errors to bypass billing
4. ❌ Users cannot modify server-side plan prices
5. ❌ Users cannot bypass plan validation
6. ❌ Webhooks cannot incorrectly mark subscriptions as test

### ✅ CAN Be Trusted
1. ✅ All billing logic runs server-side
2. ✅ Shopify API determines test mode for dev stores
3. ✅ Production environment enforces real billing by default
4. ✅ GraphQL sync is the source of truth for subscription data
5. ✅ Database audit trail tracks all subscription changes
6. ✅ Webhook authentication validates Shopify's identity

---

## Deployment Checklist

Before deploying to production:

1. ✅ Verify `NODE_ENV=production` in Netlify environment variables
2. ✅ Verify `SHOPIFY_APP_URL` points to production domain
3. ✅ Verify Shopify Partner Dashboard is set to "AppStore distribution"
4. ✅ Verify Shopify Partner Dashboard billing is set to "Manual billing with the API"
5. ✅ Test subscription flow with a test production store
6. ✅ Monitor first real subscription to verify billing works
7. ✅ Check server logs for any billing mode warnings
8. ✅ Verify database subscriptions have correct `isTest` values

---

## Contact

If you have questions about billing security, contact: hi@letsgolukas.com

---

## Changelog

### 2026-02-15
- **SECURITY FIX**: Changed `NODE_ENV` to `production` in `.env`
- **SECURITY FIX**: Fixed `shouldUseTestCharges()` to default to production billing on errors
- **SECURITY FIX**: Fixed webhook handler to preserve `isTest` value from GraphQL sync
- **DOCUMENTATION**: Created comprehensive security documentation
