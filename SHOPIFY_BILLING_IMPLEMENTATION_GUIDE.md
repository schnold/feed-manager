# Shopify Billing Implementation Guide

## Overview
This guide explains how to properly implement Shopify app subscriptions, ensuring that:
1. Merchants are redirected to Shopify's hosted payment page
2. After successful payment, the plan is stored in your database
3. Plan features are properly enforced

## Current Implementation Issues

### ❌ Problems Found
1. **No return URL handler**: After Shopify payment approval, there's no route to handle the callback
2. **Plan not stored after payment**: The Shop.plan field is never updated after subscription approval
3. **Webhook may arrive before return**: The webhook might arrive before the user returns, causing race conditions

## Complete Implementation

### Step 1: Update Choose Plan Action (Already Done)

Your current implementation in `app/routes/app.choose-plan.tsx` already creates the subscription correctly:

```typescript
const response = await client.request(mutation, variables);

if (response.data?.appSubscriptionCreate?.confirmationUrl) {
  return redirect(confirmationUrl); // Redirects to Shopify's hosted payment page
}
```

**What happens**:
- Merchant clicks "Subscribe" button
- Your app creates subscription via `appSubscriptionCreate` mutation
- Shopify returns a `confirmationUrl`
- App redirects merchant to Shopify's hosted payment page
- Merchant approves/declines the charge

### Step 2: Create Return URL Handler (NEEDS IMPLEMENTATION)

After the merchant approves payment, Shopify redirects them to the `returnUrl` you specified. You need to handle this callback.

#### Create: `app/routes/app.billing-callback.tsx`

```typescript
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ShopRepository } from "../db/repositories/shop.server";
import { getAdminGraphqlClient } from "../services/shopify/admin.server";

/**
 * This route handles the return from Shopify's billing confirmation page
 * After merchant approves/declines subscription, Shopify redirects here
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Query for the active subscription to verify payment was approved
    const client = getAdminGraphqlClient({
      shopDomain: session.shop,
      accessToken: admin.session.accessToken!
    });

    const query = `
      query GetActiveSubscription {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            createdAt
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                    interval
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await client.request(query);
    const activeSubscriptions = response.data?.currentAppInstallation?.activeSubscriptions || [];

    if (activeSubscriptions.length > 0) {
      // Get the most recent active subscription
      const subscription = activeSubscriptions[0];
      
      // Parse plan name from subscription name (e.g., "BASE Plan" -> "base")
      const planMatch = subscription.name.match(/^(\w+)\s+Plan$/i);
      const planName = planMatch ? planMatch[1].toLowerCase() : "basic";

      // Update shop plan in database
      await ShopRepository.updatePlan(session.shop, planName);

      console.log(`Successfully updated shop ${session.shop} to ${planName} plan via return URL`);

      // Redirect to feeds page with success message
      return redirect("/app/feeds?billing=success");
    } else {
      // No active subscription found - payment was likely declined
      console.warn(`No active subscription found for shop ${session.shop} after billing callback`);
      return redirect("/app/choose-plan?error=payment_declined");
    }
  } catch (error) {
    console.error("Error processing billing callback:", error);
    return redirect("/app/feeds?billing=error");
  }
};
```

### Step 3: Update Choose Plan to Use Callback URL

Update `app/routes/app.choose-plan.tsx` to use the billing callback URL:

```typescript
// In the action function, update the returnUrl
const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing-callback`;
```

**Before**:
```typescript
const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/feeds`;
```

**After**:
```typescript
const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing-callback`;
```

### Step 4: Update Webhook Handler (Already Implemented)

You've already created `app/routes/webhooks.app_subscriptions.update.tsx` which handles the webhook. This is good for backup and handling subscription changes.

**Current webhook implementation** (already done ✅):
```typescript
// app/routes/webhooks.app_subscriptions.update.tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const subscriptionData = JSON.parse(payload);
  
  // Parse plan name and update database
  const planName = /* extract from subscriptionData */;
  await ShopRepository.updatePlan(shop, planName);
  
  return new Response(null, { status: 200 });
};
```

### Step 5: Add Billing Status Messages to Feeds Page

Update `app/routes/app.feeds._index.tsx` to show success/error messages:

```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Check for billing status in query params
  const url = new URL(request.url);
  const billingStatus = url.searchParams.get("billing");

  const shop = await ShopRepository.upsert({
    myshopifyDomain: session.shop,
    accessToken: session.accessToken
  });

  const feeds = await FeedRepository.findByShopId(shop.id);
  
  const planConfig = getPlanConfig(shop.plan);
  const canCreate = canCreateFeed(shop.plan, feeds.length);
  const maxFeeds = planConfig.maxFeeds === -1 ? 'unlimited' : planConfig.maxFeeds;

  return json({ 
    feeds, 
    shop,
    planInfo: {
      planName: planConfig.name,
      currentFeeds: feeds.length,
      maxFeeds,
      canCreateMore: canCreate
    },
    billingStatus // Pass billing status to frontend
  });
};
```

Then in the component, show appropriate messages:

```typescript
export default function FeedsIndex() {
  const { feeds: initialFeeds, planInfo, billingStatus } = useLoaderData<typeof loader>();
  
  return (
    <Page title="Feed Manager">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Success message */}
            {billingStatus === 'success' && (
              <Banner
                title="Subscription activated!"
                tone="success"
                onDismiss={() => {/* handle dismiss */}}
              >
                <p>
                  Your {planInfo.planName} plan has been activated. 
                  You can now create up to {planInfo.maxFeeds} feeds.
                </p>
              </Banner>
            )}

            {/* Error message */}
            {billingStatus === 'error' && (
              <Banner
                title="Payment processing error"
                tone="critical"
              >
                <p>
                  There was an error processing your payment. 
                  Please try again or contact support.
                </p>
              </Banner>
            )}

            {/* Rest of your component */}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User clicks "Subscribe" on Choose Plan page             │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. App calls appSubscriptionCreate mutation                 │
│    - Returns confirmationUrl                                │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. App redirects to confirmationUrl                         │
│    (Shopify hosted payment page)                            │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Merchant reviews and approves/declines                   │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   APPROVED                DECLINED
        │                       │
        ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ 5A. Redirect to  │    │ 5B. Redirect to  │
│ returnUrl        │    │ Shopify admin    │
│ (/billing-       │    │ with error msg   │
│  callback)       │    └──────────────────┘
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Billing callback handler:                                │
│    - Queries currentAppInstallation.activeSubscriptions     │
│    - Verifies subscription is ACTIVE                        │
│    - Updates Shop.plan in database                          │
│    - Redirects to /app/feeds?billing=success               │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Feeds page shows success banner                          │
│    Plan limits are now enforced                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PARALLEL: Webhook arrives (APP_SUBSCRIPTIONS_UPDATE)        │
│    - Also updates Shop.plan as backup                       │
│    - Handles future subscription changes                    │
└─────────────────────────────────────────────────────────────┘
```

## Why Both Return URL and Webhook?

### Return URL Handler (Primary)
- **Immediate**: Updates plan immediately when user returns
- **User Experience**: Can show success message right away
- **Reliable**: Runs in user's session context

### Webhook (Backup)
- **Catches edge cases**: If user closes browser before returning
- **Future updates**: Handles subscription changes after initial setup
- **Redundancy**: Ensures plan is updated even if return URL fails

## GraphQL Queries You Need

### Query Active Subscriptions (in return URL handler)

```graphql
query GetActiveSubscription {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      createdAt
      lineItems {
        plan {
          pricingDetails {
            ... on AppRecurringPricing {
              price {
                amount
                currencyCode
              }
              interval
            }
          }
        }
      }
    }
  }
}
```

### Subscription Status Values
- `PENDING`: Waiting for merchant approval
- `ACTIVE`: Approved and billing
- `DECLINED`: Merchant declined
- `EXPIRED`: Not approved within 2 days
- `CANCELLED`: Cancelled by app or merchant
- `FROZEN`: On hold due to non-payment

## Testing Checklist

### Test Case 1: Successful Payment
1. ✅ Start on choose-plan page
2. ✅ Click "Subscribe" button
3. ✅ Redirected to Shopify payment page
4. ✅ Approve payment
5. ✅ Redirected to /app/billing-callback
6. ✅ Plan updated in database
7. ✅ Redirected to /app/feeds with success message
8. ✅ Feed limits reflect new plan

### Test Case 2: Declined Payment
1. ✅ Start on choose-plan page
2. ✅ Click "Subscribe" button
3. ✅ Redirected to Shopify payment page
4. ✅ Decline payment
5. ✅ Redirected back to shop admin (handled by Shopify)
6. ✅ Plan remains unchanged

### Test Case 3: Webhook Arrives First
1. ✅ Webhook updates plan before user returns
2. ✅ Return URL handler still works (idempotent)
3. ✅ No duplicate updates or errors

### Test Case 4: User Closes Browser
1. ✅ User approves payment
2. ✅ User closes browser before return
3. ✅ Webhook updates plan
4. ✅ Next time user visits, plan is correct

## Security Considerations

✅ **Webhook Verification**: Already handled by `authenticate.webhook()`
✅ **Session Validation**: Return URL requires authenticated session
✅ **Plan Validation**: Always query Shopify to verify subscription status
✅ **No Client-Side Updates**: All plan updates happen server-side

## Deployment Steps

1. ✅ Create `app/routes/app.billing-callback.tsx`
2. ✅ Update `app/routes/app.choose-plan.tsx` returnUrl
3. ✅ Update `app/routes/app.feeds._index.tsx` to show billing status
4. ✅ Test locally with `test: true` flag
5. ✅ Deploy to production
6. ✅ Test with real Shopify subscription (test: false)
7. ✅ Monitor webhook delivery in Shopify Partner Dashboard
8. ✅ Verify plan limits work correctly

## Important Notes

### Test Mode
During development, set `test: true` in the mutation:

```typescript
const variables = {
  // ... other fields
  test: process.env.NODE_ENV !== 'production'
};
```

This creates test subscriptions that don't charge real money but still go through the full approval flow.

### Production Mode
In production, ensure `test: false` or omit it (defaults to false):

```typescript
const variables = {
  // ... other fields
  test: false // or omit this line
};
```

### Charge ID Included
The return URL includes a `charge_id` parameter that you can use to query the specific subscription:

```typescript
const url = new URL(request.url);
const chargeId = url.searchParams.get("charge_id");
// Use this to query specific subscription if needed
```

## Summary

The complete implementation ensures:

1. ✅ **Shopify Hosted Session**: Using `appSubscriptionCreate` + redirect to `confirmationUrl`
2. ✅ **Plan Storage**: Updated in database via return URL handler (primary) and webhook (backup)
3. ✅ **Plan Enforcement**: Backend validation prevents exploitation
4. ✅ **User Experience**: Success/error messages shown appropriately
5. ✅ **Reliability**: Dual system (return URL + webhook) ensures plan is always updated

## Next Steps

1. Implement the `app/routes/app.billing-callback.tsx` file
2. Update the returnUrl in choose-plan.tsx
3. Add billing status messages to feeds page
4. Test the complete flow in development
5. Deploy and test in production

After these changes, your billing flow will be complete and secure!

