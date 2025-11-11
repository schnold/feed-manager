# Plan Enforcement Implementation

## Overview
This document outlines the implementation of plan-based feed limits to ensure users can only create feeds according to their subscription plan.

## Security Considerations
✅ **Backend Validation**: All plan limits are enforced on the server-side
✅ **Centralized Configuration**: Single source of truth for plan limits
✅ **Exploitation Prevention**: Direct API calls are validated
✅ **Database-Backed**: Plan information stored in Shop model

## Files Created/Modified

### 1. New Files Created

#### `app/config/plans.server.ts`
- **Purpose**: Centralized plan configuration
- **Features**:
  - Defines all plan types (base, mid, basic, grow, pro, premium)
  - Stores feed limits, pricing, and features
  - Utility functions: `canCreateFeed()`, `getRemainingFeeds()`, `getPlanConfig()`
  - Type-safe plan names

**Key Functions**:
```typescript
canCreateFeed(planName: string, currentFeedCount: number): boolean
// Returns true if shop can create more feeds

getPlanConfig(planName: string): PlanConfig
// Returns plan configuration with limits and pricing

getRemainingFeeds(planName: string, currentFeedCount: number): number
// Returns number of feeds remaining (-1 for unlimited)
```

#### `app/routes/webhooks.app_subscriptions.update.tsx`
- **Purpose**: Handle Shopify subscription webhook
- **Function**: Updates shop's plan in database when subscription changes
- **Process**:
  1. Receives webhook from Shopify
  2. Parses subscription name (e.g., "BASE Plan")
  3. Updates Shop.plan field in database
  4. Logs all operations for debugging

### 2. Modified Files

#### `app/routes/app.feeds.new.tsx`
**Changes**:
- Added plan limit validation before feed creation (lines 136-150)
- Imports `canCreateFeed` and `getPlanConfig`
- Returns 403 error with clear message when limit reached
- Checks current feed count against plan limit

**Security**: Server-side validation prevents exploitation via direct API calls

#### `app/routes/app.feeds._index.tsx`
**Changes**:
- Added plan information to loader data
- Shows current plan and usage statistics
- Hides "Create Feed" button when limit reached
- Displays warning banner when at limit
- Shows accurate feed count vs plan limit

**UI Improvements**:
- Warning banner at top when limit reached
- Clear plan information card
- Upgrade link when limit reached
- Dynamic "Create Feed" button visibility

#### `app/routes/app.choose-plan.tsx`
**Changes**:
- Imports centralized plan configuration
- Shows current active plan
- Uses PLANS config instead of hardcoded values
- Highlights current plan with "Active Plan" badge
- Updates loader to fetch and display current plan

#### `app/db/repositories/shop.server.ts`
**Changes**:
- Added `updatePlan()` method
- Allows updating shop plan without full upsert

#### `shopify.app.toml`
**Changes**:
- Added webhook subscription for `app_subscriptions/update`
- Configured webhook URI: `/webhooks/app_subscriptions/update`

## Plan Configuration

| Plan | Max Feeds | Monthly Price | Yearly Price | Updates/Day |
|------|-----------|---------------|--------------|-------------|
| BASE | 2 | €5 | €45 | 1 |
| MID | 4 | €14 | €126 | 1 |
| BASIC | 6 | €21 | €189 | 1 |
| GROW | 8 | €27 | €243 | 1 |
| PRO | 20 | €59 | €531 | 4 |
| PREMIUM | Unlimited | €134 | €1206 | 8 |

## How It Works

### Feed Creation Flow
1. User clicks "Create Feed" button
2. **Frontend**: Button is hidden if limit reached
3. **Backend**: Validates plan limit before creation
4. If limit reached: Returns 403 error with upgrade message
5. If within limit: Creates feed successfully

### Subscription Update Flow
1. User selects and subscribes to a plan
2. Shopify processes payment
3. Shopify sends `app_subscriptions/update` webhook
4. Webhook handler updates Shop.plan in database
5. Next page load reflects new plan limits

## Testing Instructions

### Test Case 1: Feed Limit Enforcement
1. **Setup**: Ensure shop is on BASE plan (2 feeds max)
2. **Action**: Create 2 feeds successfully
3. **Expected**: Can create feeds 1 and 2
4. **Action**: Try to create 3rd feed
5. **Expected**: Error message displayed, feed not created
6. **Verify**: Only 2 feeds exist in database

### Test Case 2: Frontend UI Updates
1. **Setup**: Shop with 2 feeds on BASE plan (at limit)
2. **Expected**:
   - ❌ "Create Feed" button is hidden
   - ⚠️ Warning banner displayed at top
   - ℹ️ Plan info shows "2 of 2 feeds used"
   - 🔗 Upgrade link visible
3. **Action**: Upgrade to MID plan (4 feeds)
4. **Expected**:
   - ✅ "Create Feed" button visible
   - ✅ No warning banner
   - ℹ️ Plan info shows "2 of 4 feeds used"

### Test Case 3: Backend API Protection
1. **Setup**: Shop at feed limit
2. **Action**: Send direct POST request to `/app/feeds/new` endpoint
3. **Expected**: 403 Forbidden response
4. **Verify**: Feed not created in database
5. **Message**: "You have reached the maximum number of feeds..."

### Test Case 4: Webhook Integration
1. **Action**: Subscribe to a new plan via Shopify
2. **Expected**: Webhook received and processed
3. **Verify**: Check logs for "Successfully updated shop X to Y plan"
4. **Verify**: Database shows correct plan in Shop.plan field
5. **Verify**: Next page load reflects new limits

### Test Case 5: Premium (Unlimited) Plan
1. **Setup**: Upgrade to PREMIUM plan
2. **Action**: Create 25+ feeds
3. **Expected**: All feeds created successfully
4. **Verify**: Plan info shows "X feeds (unlimited on your plan)"
5. **Verify**: "Create Feed" button always visible

## Security Features

### ✅ Server-Side Validation
- All limit checks performed on backend
- Cannot be bypassed by modifying frontend code
- Direct API calls are validated

### ✅ Database-Backed Plans
- Plan information stored in Shop model
- Updated via webhook when subscription changes
- Single source of truth

### ✅ Centralized Configuration
- All plan limits in one file
- Easy to update and maintain
- Consistent between frontend and backend

### ✅ Clear Error Messages
- User-friendly error messages
- Include current plan and limit information
- Provide upgrade path

## Deployment Checklist

- [x] Create plan configuration file
- [x] Add backend validation
- [x] Update frontend UI
- [x] Create webhook handler
- [x] Register webhook in shopify.app.toml
- [ ] Deploy to production
- [ ] Run `npm run deploy` to register webhooks with Shopify
- [ ] Test with real Shopify subscription flow
- [ ] Monitor webhook logs for successful updates
- [ ] Verify plan limits work in production

## Monitoring & Debugging

### Check Webhook Delivery
```bash
# Check if webhook is registered
# In Shopify Partner Dashboard > Apps > Your App > API & Webhooks

# Look for: app_subscriptions/update webhook
```

### Verify Plan Updates
```sql
-- Check shop plans in database
SELECT myshopifyDomain, plan, updatedAt FROM Shop;
```

### Test Webhook Locally
```bash
# Use Shopify CLI to trigger test webhooks
shopify app webhook trigger --topic app_subscriptions/update
```

### Debug Logs to Check
- `Received app_subscriptions/update webhook for {shop}`
- `Updating shop {shop} to plan: {planName}`
- `Successfully updated shop {shop} to {planName} plan`
- `Feed creation prevented: limit reached for {plan} plan`

## Known Limitations

1. **Plan Update Delay**: There may be a slight delay between subscription confirmation and webhook delivery. Users may need to refresh the page.

2. **Manual Plan Updates**: If plan needs to be manually adjusted, use:
   ```typescript
   await ShopRepository.updatePlan(shopDomain, 'pro');
   ```

3. **Webhook Failures**: If webhook fails, plan won't update automatically. Monitor webhook delivery status in Shopify admin.

## Future Enhancements

1. **Grace Period**: Allow 1-2 extra feeds as grace period before hard limit
2. **Auto-Upgrade Prompts**: Show upgrade modal when approaching limit
3. **Usage Analytics**: Track feed usage patterns per plan
4. **Plan History**: Log plan changes for auditing
5. **Admin Override**: Allow manual plan adjustments via admin panel

## Support & Troubleshooting

If plan limits aren't working:

1. **Check Shop.plan field**: Verify correct plan in database
2. **Check webhook logs**: Ensure webhooks are being received
3. **Verify webhook registration**: Run `npm run deploy`
4. **Check API version**: Ensure shopify.app.toml uses correct API version
5. **Test manually**: Use ShopRepository.updatePlan() to set plan directly

## Conclusion

The plan enforcement system is now fully implemented with:
- ✅ Backend validation preventing exploitation
- ✅ Frontend UI reflecting limits accurately
- ✅ Automatic plan updates via webhooks
- ✅ Centralized, maintainable configuration
- ✅ Clear user experience and error messages

All components are in place to ensure users can only create feeds according to their subscription plan, with no possibility of exploitation through direct API calls or frontend manipulation.

