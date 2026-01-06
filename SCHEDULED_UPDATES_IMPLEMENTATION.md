# Scheduled Feed Updates - Implementation Guide

## Overview

The automated feed regeneration system now fully respects subscription plan limits. This ensures:
- ✅ **Free plan users**: Manual updates only (no automated updates)
- ✅ **Paid plan users**: Automated updates based on their plan tier
- ✅ **Fair usage**: Daily update limits enforced per shop
- ✅ **Server-side**: All updates happen in the background, even when the app is closed

## Plan-Based Automated Updates

### Update Frequency by Plan

| Plan     | Max Scheduled Updates/Day | Update Times (Local Timezone)                    |
|----------|---------------------------|--------------------------------------------------|
| **Free** | 0 (Manual only)           | None - user must click "Regenerate" manually    |
| **Base** | 1                         | 2:00 AM                                          |
| **Mid**  | 1                         | 2:00 AM                                          |
| **Basic**| 1                         | 2:00 AM                                          |
| **Grow** | 1                         | 2:00 AM                                          |
| **Pro**  | 4                         | 2:00 AM, 8:00 AM, 2:00 PM, 8:00 PM              |
| **Premium**| 8                       | 2:00 AM, 5:00 AM, 8:00 AM, 11:00 AM, 2:00 PM, 5:00 PM, 8:00 PM, 11:00 PM |

## How It Works

### Architecture

```
Netlify Scheduled Function (runs every hour)
    ↓
POST /api/feeds/regenerate-scheduled
    ↓
Feed Scheduler Service
    ↓
1. Load all shops with active subscriptions
2. Check plan for each shop (skip free plan)
3. For each shop, get all feeds
4. Check if feed is due based on:
   - Timezone (each feed has its own timezone)
   - Last run time
   - Plan's scheduled hours
   - Daily update limit
5. Enqueue feeds for regeneration
    ↓
Background Worker / Queue System
    ↓
Generate feed and upload to S3
    ↓
Update feed.lastRunAt and feed.lastSuccessAt
```

### Key Features

#### 1. **Plan-Based Filtering**
```typescript
// Free plan shops are automatically excluded
if (maxScheduledUpdates === 0) {
  console.log(`Skipping shop - plan has no scheduled updates`);
  continue;
}
```

#### 2. **Daily Update Limits**
```typescript
// Pro plan: Max 4 updates per day
// If shop already had 4 updates today, skip remaining feeds
if (currentCount >= maxScheduledUpdates) {
  console.log(`Shop has reached daily limit (${maxScheduledUpdates} updates)`);
  continue;
}
```

#### 3. **Timezone-Aware Scheduling**
Each feed regenerates at the appropriate time in **its own timezone**:
```typescript
// Feed in New York timezone: 2 AM EST
// Feed in London timezone: 2 AM GMT
// Both feeds regenerate at their local 2 AM
```

#### 4. **Minimum Time Between Updates**
Prevents feeds from regenerating too frequently:
```typescript
// 1 update/day: Minimum 23 hours between updates
// 4 updates/day: Minimum 5 hours between updates  
// 8 updates/day: Minimum 2 hours between updates
```

## Implementation Details

### Modified Files

#### 1. `app/services/scheduling/feed-scheduler.server.ts`
**Changes:**
- Added `PLAN_FEATURES` import for plan limits
- Modified `getFeedsDueForRegeneration()` to:
  - Load shops with active subscriptions
  - Check plan features and skip free plan shops
  - Return plan info with each feed
- Modified `shouldRegenerateNow()` to:
  - Support multiple updates per day (1, 4, or 8)
  - Calculate scheduled hours based on plan
  - Enforce minimum time between updates
- Modified `regenerateDueFeeds()` to:
  - Track update counts per shop
  - Enforce daily limits per shop
  - Log plan and update count information

#### 2. `app/routes/api/feeds.regenerate-scheduled.ts`
**Changes:**
- Updated stats to include `skippedFreePlan` count
- Enhanced logging to show free plan exclusions

### Scheduled Hours Logic

```typescript
function getScheduledHours(maxUpdatesPerDay: number): number[] {
  if (maxUpdatesPerDay === 1) return [2];           // 2 AM only
  if (maxUpdatesPerDay === 4) return [2, 8, 14, 20]; // Every 6 hours
  if (maxUpdatesPerDay === 8) return [2, 5, 8, 11, 14, 17, 20, 23]; // Every 3 hours
}
```

## User Experience

### Free Plan Users
- **Manual Updates**: Click "Regenerate" button anytime
- **Webhook Updates**: Automatic when products change
- **No Scheduled Updates**: Feeds don't regenerate automatically on a schedule
- **Upgrade Prompt**: UI encourages upgrading for automated updates

### Paid Plan Users
- **Manual Updates**: Available anytime (instant)
- **Webhook Updates**: Automatic when products change
- **Scheduled Updates**: Happen automatically based on plan tier
  - Base/Mid/Basic/Grow: Once daily at 2 AM
  - Pro: 4 times daily (every 6 hours)
  - Premium: 8 times daily (every 3 hours)
- **Last Update**: Timestamp shows when feed was last updated
- **Next Update**: (Future feature) Show next scheduled update time

## Verification & Testing

### Check Scheduled Function Setup

1. **Environment Variable**
   ```bash
   # In Netlify Dashboard → Environment Variables
   FEED_REGENERATION_SECRET=<your-secret-here>
   ```

2. **Netlify Configuration** (`netlify.toml`)
   ```toml
   [functions."scheduled-feed-regeneration"]
     schedule = "0 * * * *"  # Every hour
   ```

3. **Verify in Netlify Dashboard**
   - Go to Functions tab
   - Find "scheduled-feed-regeneration"
   - Check "Next run" time
   - View execution logs

### Test Different Scenarios

#### Test 1: Free Plan (No Scheduled Updates)
```bash
# Create shop on free plan with feed
# Wait for hourly trigger
# Expected: Feed is NOT regenerated automatically
# Logs should show: "Skipping shop - plan has no scheduled updates"
```

#### Test 2: Base Plan (1 Update/Day)
```bash
# Create shop on base plan with feed
# Set feed timezone to your local timezone
# Wait for 2 AM (or trigger manually)
# Expected: Feed regenerates once at 2 AM
# Second trigger within same day: Feed is NOT regenerated
# Logs should show: "Enqueued feed ... Update 1/1"
```

#### Test 3: Pro Plan (4 Updates/Day)
```bash
# Create shop on pro plan with 2 feeds
# Wait for scheduled times (2 AM, 8 AM, 2 PM, 8 PM)
# Expected: Each feed regenerates 4 times per day
# Logs should show: "Enqueued feed ... Update 1/4", "Update 2/4", etc.
```

#### Test 4: Multiple Shops with Different Plans
```bash
# Shop A: Free plan
# Shop B: Base plan  
# Shop C: Pro plan
# Trigger scheduled function
# Expected:
#   - Shop A: 0 feeds regenerated
#   - Shop B: 1 feed regenerated (if due)
#   - Shop C: Up to 4 feeds regenerated (if due)
```

### Manual Testing

You can manually trigger the scheduled function:

```bash
# Call the API endpoint directly
curl -X POST https://your-app.netlify.app/api/feeds/regenerate-scheduled \
  -H "Content-Type: application/json" \
  -H "X-Regeneration-Secret: YOUR_SECRET" \
  -d '{"hourOfDay": 2, "toleranceMinutes": 60}'
```

Expected response:
```json
{
  "success": true,
  "message": "Processed 10 feeds. 3 feeds enqueued for regeneration.",
  "stats": {
    "totalFeeds": 10,
    "dueFeeds": 5,
    "enqueuedFeeds": 3,
    "skippedFeeds": 5,
    "skippedFreePlan": 2,
    "failedFeeds": 0
  }
}
```

## Monitoring & Logs

### Key Log Messages

**Successful Enqueue:**
```
[Scheduler] ✅ Enqueued feed abc123 (Google Feed) for shop example.myshopify.com 
  - Plan: pro, Update 2/4, Timezone: America/New_York
```

**Free Plan Skip:**
```
[Scheduler] Skipping shop example.myshopify.com - plan "free" has no scheduled updates
```

**Daily Limit Reached:**
```
[Scheduler] Skipping feed abc123 - shop example.myshopify.com 
  has reached daily limit (1 updates for plan "base")
```

**Not Due Yet:**
```
(Feed is skipped silently, included in skippedFeeds count)
```

### Feed Status Updates

When a feed regenerates, the database is updated:
```typescript
feed.lastRunAt = new Date();      // When regeneration started
feed.lastSuccessAt = new Date();  // When regeneration completed successfully
feed.status = "success";           // Or "error" if failed
feed.productCount = 150;           // Number of products in feed
feed.variantCount = 450;           // Number of variants in feed
```

## Troubleshooting

### Issue: Feeds Not Regenerating Automatically

**Possible Causes:**
1. ❌ `FEED_REGENERATION_SECRET` not set
   - **Fix**: Add to Netlify environment variables
   
2. ❌ Shop is on free plan
   - **Fix**: Upgrade to paid plan for scheduled updates
   
3. ❌ Feed already regenerated today (daily limit reached)
   - **Fix**: Wait until next scheduled time
   
4. ❌ Current time not within tolerance of scheduled hour
   - **Fix**: Wait for next scheduled hour (runs every hour)
   
5. ❌ Netlify scheduled function not deployed
   - **Fix**: Deploy the function via Netlify

### Issue: Too Many Updates Happening

**Check:**
1. Verify plan's `maxScheduledUpdates` is correct
2. Check logs for update counts per shop
3. Ensure `lastRunAt` is being updated correctly

### Issue: Updates Happening at Wrong Time

**Check:**
1. Verify feed's timezone setting
2. Check server's system time
3. Ensure tolerance window is appropriate (default 60 minutes)

## Future Enhancements

### Potential Improvements

1. **UI Enhancements**
   - Show next scheduled update time in feed list
   - Display update history (last 10 updates)
   - Show remaining updates for today

2. **Configuration Options**
   - Allow users to choose update times
   - Enable/disable scheduled updates per feed
   - Customize update frequency within plan limits

3. **Notifications**
   - Email when feed fails to regenerate
   - Slack/webhook notifications for updates
   - Daily summary of regenerations

4. **Analytics**
   - Track regeneration success rate
   - Monitor feed sizes over time
   - Alert on unusual patterns

## Summary

✅ **Free plan**: Manual updates only, no automated scheduling
✅ **Paid plans**: Automated updates based on tier (1, 4, or 8 per day)  
✅ **Timezone-aware**: Each feed updates at local time
✅ **Fair limits**: Daily update caps enforced per shop
✅ **Background processing**: Works when app is closed
✅ **Timestamp tracking**: `lastRunAt` and `lastSuccessAt` updated
✅ **User feedback**: Feed list shows last update time

The system is production-ready and respects all subscription plan limits!
