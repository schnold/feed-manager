# Complete Feed Regeneration Flow

## Overview

This document explains exactly how feeds are regenerated in all scenarios, with a focus on how subscription plans are enforced.

## Three Ways Feeds Regenerate

### 1. Manual Regeneration (User-Initiated)

**Trigger**: User clicks "Regenerate" button in the UI

**Plan Enforcement**: ❌ None (always allowed)

**Flow**:
```
User clicks "Regenerate" button
    ↓
POST /app/feeds (action: regenerate)
    ↓
Verify user owns the feed
    ↓
enqueueFeedGeneration({
  feedId,
  shopId,
  shopDomain,
  accessToken,
  triggeredBy: "manual"
})
    ↓
Queue/Worker processes job
    ↓
Update feed.lastRunAt = now
Update feed.status = "running"
    ↓
generateGoogleXML() - Fetch products, build XML
    ↓
uploadXmlToS3() - Upload to cloud storage
    ↓
Update feed.lastSuccessAt = now
Update feed.status = "success"
Update feed.publicUrl
Update feed.productCount
Update feed.variantCount
    ↓
User sees "Last updated: just now"
```

**Key Points**:
- ✅ No plan limits - free plan users can manually regenerate
- ✅ Instant - processed immediately
- ✅ On-demand - happens when user wants it
- ✅ Always available - even if daily scheduled limit reached

---

### 2. Webhook Regeneration (Product Changes)

**Trigger**: Shopify sends webhook when product created/updated/deleted

**Plan Enforcement**: ❌ None (always allowed)

**Flow**:
```
Merchant updates product in Shopify
    ↓
Shopify sends webhook to /webhooks/products/update
    ↓
authenticate.webhook() - Verify HMAC signature
    ↓
Find shop by domain
    ↓
Get all feeds for shop
    ↓
For each feed:
  enqueueFeedGeneration({
    feedId,
    shopId,
    shopDomain,
    accessToken,
    triggeredBy: "webhook"
  })
    ↓
Queue/Worker processes jobs (same as manual)
    ↓
Feeds updated with latest product data
```

**Key Points**:
- ✅ No plan limits - real-time product sync is essential
- ✅ Automatic - merchant doesn't need to do anything
- ✅ Real-time - feeds updated within minutes of product changes
- ✅ All plans - even free plan gets webhook updates

**Configured Webhooks**:
- `webhooks.products.create.tsx` - New products added
- `webhooks.products.update.tsx` - Products modified
- `webhooks.products.delete.tsx` - Products removed

---

### 3. Scheduled Regeneration (Automated)

**Trigger**: Netlify scheduled function runs every hour

**Plan Enforcement**: ✅ **YES - Fully enforced**

**Flow**:
```
Netlify Scheduled Function
(runs every hour at :00)
    ↓
POST /api/feeds/regenerate-scheduled
Headers: X-Regeneration-Secret
Body: { hourOfDay: 2, toleranceMinutes: 60 }
    ↓
Verify secret token
    ↓
getFeedsDueForRegeneration()
    ↓
Load all shops with active subscriptions
    ↓
For each shop:
  ├─ Get plan (subscription.planId or shop.plan)
  ├─ Get plan features (PLAN_FEATURES[plan])
  ├─ Get maxScheduledUpdates (0, 1, 4, or 8)
  │
  ├─ IF maxScheduledUpdates === 0 (FREE PLAN):
  │   └─ Skip shop - log "no scheduled updates"
  │
  └─ IF maxScheduledUpdates > 0 (PAID PLAN):
      └─ Get all feeds for shop
          └─ For each feed:
              ├─ Check shouldRegenerateNow()
              │   ├─ Is current hour a scheduled hour?
              │   │   (1/day: [2], 4/day: [2,8,14,20], 8/day: [2,5,8,11,14,17,20,23])
              │   ├─ Has enough time passed since lastRunAt?
              │   │   (1/day: 23hrs, 4/day: 5hrs, 8/day: 2hrs)
              │   └─ Return true/false
              │
              ├─ IF shouldRegenerate === false:
              │   └─ Skip - not due yet
              │
              └─ IF shouldRegenerate === true:
                  ├─ Check shop's daily limit
                  │   └─ IF shop already had N updates today:
                  │       └─ Skip - daily limit reached
                  │
                  └─ Enqueue feed generation
                      └─ Increment shop's update count
    ↓
Return stats:
{
  totalFeeds: 20,
  dueFeeds: 8,
  enqueuedFeeds: 5,
  skippedFeeds: 10,
  skippedFreePlan: 5,
  errors: []
}
    ↓
Background worker processes enqueued jobs
(same as manual/webhook flow)
```

**Key Points**:
- ✅ Plan limits enforced - free plan excluded
- ✅ Daily limits enforced - shops can't exceed their quota
- ✅ Timezone-aware - each feed updates at local time
- ✅ Multi-update support - Pro/Premium get multiple updates
- ✅ Background - works even when app is closed

**Scheduled Hours by Plan**:
```
Free:    [] - None
Base:    [2] - 2 AM
Mid:     [2] - 2 AM
Basic:   [2] - 2 AM
Grow:    [2] - 2 AM
Pro:     [2, 8, 14, 20] - 2 AM, 8 AM, 2 PM, 8 PM
Premium: [2, 5, 8, 11, 14, 17, 20, 23] - Every 3 hours
```

---

## Plan Enforcement Matrix

| Regeneration Type | Free Plan | Base Plan | Pro Plan | Premium Plan |
|-------------------|-----------|-----------|----------|--------------|
| **Manual** | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| **Webhooks** | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| **Scheduled** | ❌ Disabled (0/day) | ✅ 1/day | ✅ 4/day | ✅ 8/day |

---

## Feed Generation Process (Common to All Types)

Once a feed is enqueued (by any of the 3 triggers), the generation process is the same:

### Step 1: Update Status
```typescript
await FeedRepository.updateStatus(
  feedId, 
  "running", 
  new Date()  // lastRunAt
);
```

### Step 2: Fetch Products
```typescript
const products = await fetchProductsFromShopify({
  shopDomain,
  accessToken,
  filters: feed.filters,
  country: feed.country
});
```

### Step 3: Apply Mappings
```typescript
const items = products.map(product => {
  return applyMappings(product, feed.mappings);
});
```

### Step 4: Generate XML
```typescript
const xml = generateGoogleXML(items, feed);
```

### Step 5: Upload to S3
```typescript
const publicUrl = await uploadXmlToS3({
  key: `${shopId}/${feedId}.xml`,
  body: xml,
  contentType: 'application/xml'
});
```

### Step 6: Update Feed Record
```typescript
await db.feed.update({
  where: { id: feedId },
  data: {
    status: "success",
    lastSuccessAt: new Date(),
    publicUrl: publicUrl,
    productCount: products.length,
    variantCount: totalVariants
  }
});
```

---

## Database Timestamps

Every feed tracks these timestamps:

| Field | Updated When | Purpose |
|-------|--------------|---------|
| `lastRunAt` | Generation starts | Last time regeneration was attempted |
| `lastSuccessAt` | Generation succeeds | Last time feed was successfully updated |
| `createdAt` | Feed created | When feed was first created |
| `updatedAt` | Any change | Last time feed record was modified |

**Example Timeline**:
```
2:00 AM - Scheduled check runs
2:01 AM - Feed enqueued (lastRunAt = 2:01 AM)
2:01 AM - Status changed to "running"
2:03 AM - Generation complete (lastSuccessAt = 2:03 AM)
2:03 AM - Status changed to "success"
```

**UI Display**:
```
Last updated: 5 hours ago  (uses lastSuccessAt)
Status: Success            (uses status)
```

---

## Error Handling

If feed generation fails:

```typescript
await FeedRepository.updateStatus(
  feedId,
  "error",
  new Date(),       // lastRunAt - we tried
  undefined,        // lastSuccessAt - unchanged (previous success)
  errorMessage      // lastError - what went wrong
);
```

**Result**:
- `lastRunAt` is updated (we attempted)
- `lastSuccessAt` stays the same (still shows last successful update)
- `status` changes to "error"
- `lastError` stores the error message for debugging

---

## Configuration

### Environment Variables

```bash
# Required for scheduled regeneration
FEED_REGENERATION_SECRET=<random-secret>

# S3 for storing feed files
S3_BUCKET=<bucket-name>
S3_REGION=<region>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>

# Database
DATABASE_URL=<postgres-connection-string>

# Shopify
SHOPIFY_API_KEY=<api-key>
SHOPIFY_API_SECRET=<api-secret>
```

### Netlify Scheduled Function

```toml
# netlify.toml
[functions."scheduled-feed-regeneration"]
  schedule = "0 * * * *"  # Every hour at :00
```

---

## Monitoring

### Key Metrics to Track

1. **Regeneration Success Rate**
   - Query feeds with status="success" vs status="error"
   - Target: >99% success rate

2. **Regeneration Time**
   - Calculate: lastSuccessAt - lastRunAt
   - Target: <2 minutes per feed

3. **Scheduled Update Coverage**
   - Count shops by plan
   - Verify free plan shops not getting scheduled updates

4. **Daily Update Distribution**
   - Pro plans: Should see 4 updates/day
   - Premium plans: Should see 8 updates/day

### Logs to Monitor

```bash
# Check Netlify function logs for:
[Scheduler] Summary: X feeds enqueued, Y skipped (not due), Z skipped (free plan)

# Check worker logs for:
[Worker] Successfully generated feed abc123
[Worker] Failed to generate feed abc123: <error>

# Check feed status in database:
SELECT 
  status, 
  COUNT(*) 
FROM Feed 
GROUP BY status;
```

---

## Troubleshooting

### Issue: Free plan feeds regenerating automatically

**Diagnosis**:
```sql
SELECT s.myshopifyDomain, s.plan, f.id, f.lastRunAt
FROM Shop s
JOIN Feed f ON f.shopId = s.id
WHERE s.plan = 'free'
AND f.lastRunAt > NOW() - INTERVAL '24 hours'
ORDER BY f.lastRunAt DESC;
```

**Fix**: Check logs for "skippedFreePlan" count - should match number of free plan shops

### Issue: Pro plan only getting 1 update/day

**Diagnosis**: Check the scheduled hours logic and `shouldRegenerateNow()` function

**Fix**: Verify `getScheduledHours(4)` returns `[2, 8, 14, 20]`

### Issue: Feeds not updating at all

**Diagnosis**:
1. Check FEED_REGENERATION_SECRET is set
2. Check Netlify function is deployed and scheduled
3. Check function logs for errors
4. Verify API endpoint is reachable

**Fix**: Follow setup instructions in SCHEDULED_UPDATES_IMPLEMENTATION.md

---

## Summary

**Three regeneration paths**:
1. ✅ Manual - No limits, instant, user-initiated
2. ✅ Webhooks - No limits, automatic, product-triggered
3. ✅ Scheduled - **Plan-enforced**, automatic, time-triggered

**Plan enforcement**:
- Free: Manual + Webhooks only
- Paid: Manual + Webhooks + Scheduled (1-8/day)

**Database tracking**:
- `lastRunAt` - When we tried
- `lastSuccessAt` - When we succeeded
- `status` - Current state
- `lastError` - What went wrong (if error)

The system is **complete, tested, and production-ready**! 🎉
