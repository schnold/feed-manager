# Feed Regeneration Setup Guide

This guide explains how to set up automatic feed regeneration in your Shopify Feed Manager app.

## Overview

Feeds can be regenerated in three ways:
1. **Manual** - Click the "Regenerate" button in the UI
2. **Webhooks** - Automatically when products are updated
3. **Scheduled** - Automatically at regular intervals

## Manual Regeneration

Users can click the "Regenerate" button next to any feed in the feed list to manually trigger regeneration with the feed's current settings.

## Webhook-Based Regeneration

Already configured! Feeds automatically regenerate when products are created, updated, or deleted.

Configured webhooks:
- `webhooks.products.create.tsx`
- `webhooks.products.update.tsx`
- `webhooks.products.delete.tsx`

## Scheduled Regeneration

### Setup Instructions

#### 1. Add Environment Variable

Add `FEED_REGENERATION_SECRET` to your Netlify environment variables:

1. Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
2. Click "Add a variable"
3. Name: `FEED_REGENERATION_SECRET`
4. Value: Generate a secure random string (e.g., use `openssl rand -hex 32`)
5. Save

#### 2. Deploy the Scheduled Function

The scheduled function is already configured in `netlify.toml`:

```toml
[functions."scheduled-feed-regeneration"]
  schedule = "0 2 * * *"  # Daily at 2 AM UTC
```

After deploying, Netlify will automatically run this function based on the schedule.

#### 3. Verify Setup

1. Go to Netlify Dashboard → Functions
2. Find "scheduled-feed-regeneration"
3. Check the "Next run" time
4. View logs to confirm successful execution

### Customizing the Schedule

Edit `netlify.toml` to change when feeds regenerate:

```toml
# Daily at 2 AM UTC
schedule = "0 2 * * *"

# Every 6 hours
schedule = "0 */6 * * *"

# Every Monday at 3 AM UTC
schedule = "0 3 * * 1"

# First day of month at midnight
schedule = "0 0 1 * *"
```

Cron format: `minute hour day-of-month month day-of-week`

## API Endpoint for Custom Automation

You can call the regeneration API directly from any service:

### Regenerate All Feeds for All Shops

```bash
curl -X POST https://your-site.netlify.app/api/feeds/regenerate-all \
  -H "Content-Type: application/json" \
  -H "X-Regeneration-Secret: your-secret-here"
```

### Regenerate Feeds for a Specific Shop

```bash
curl -X POST https://your-site.netlify.app/api/feeds/regenerate-all \
  -H "Content-Type: application/json" \
  -H "X-Regeneration-Secret: your-secret-here" \
  -d '{"shopDomain": "your-shop.myshopify.com"}'
```

### Response Format

```json
{
  "success": true,
  "message": "Enqueued 5 of 5 feeds for regeneration",
  "stats": {
    "totalShops": 1,
    "totalFeeds": 5,
    "enqueuedFeeds": 5,
    "failedFeeds": 0
  }
}
```

## Using External Cron Services

Instead of Netlify scheduled functions, you can use external services like:

- **Cron-job.org** - Free cron service
- **EasyCron** - Reliable cron service
- **GitHub Actions** - Use workflow schedules
- **AWS EventBridge** - Enterprise solution

Just configure them to call the API endpoint with the secret header.

### Example: GitHub Actions

Create `.github/workflows/regenerate-feeds.yml`:

```yaml
name: Regenerate Feeds

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  regenerate:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger feed regeneration
        run: |
          curl -X POST https://your-site.netlify.app/api/feeds/regenerate-all \
            -H "Content-Type: application/json" \
            -H "X-Regeneration-Secret: ${{ secrets.FEED_REGENERATION_SECRET }}" \
            -w "\nStatus: %{http_code}\n"
```

## Monitoring

### Check Regeneration Status

1. **Netlify Functions Logs**: View execution logs in Netlify Dashboard
2. **Feed Status**: Check feed status in the app UI (shows "Running" or "Success")
3. **Feed Updated Time**: View "Last Updated" column in feed list

### Troubleshooting

**Scheduled function not running:**
- Verify `FEED_REGENERATION_SECRET` is set in Netlify
- Check function logs for errors
- Ensure the schedule syntax is correct

**Regeneration fails:**
- Check that feeds exist in the database
- Verify shop access tokens are valid
- Review server logs for specific errors

**Performance concerns:**
- For many feeds, consider staggering regeneration times
- Use Redis for better queue performance
- Monitor Netlify function execution time limits

## Best Practices

1. **Schedule During Low Traffic**: Run regeneration during off-peak hours
2. **Monitor First Run**: Watch logs after initial setup
3. **Set Up Alerts**: Configure Netlify notifications for function failures
4. **Test Manually**: Use the "Regenerate" button to test before relying on automation
5. **Keep Secrets Secure**: Never commit `FEED_REGENERATION_SECRET` to version control

## Architecture

```
┌─────────────────┐
│   User Action   │ → Manual regeneration via UI button
└─────────────────┘

┌─────────────────┐
│ Shopify Webhook │ → Automatic on product changes
└─────────────────┘

┌─────────────────┐
│ Scheduled Task  │ → Periodic regeneration
└─────────────────┘
         ↓
┌─────────────────┐
│ Regeneration    │ → API: /api/feeds/regenerate-all
│     API         │
└─────────────────┘
         ↓
┌─────────────────┐
│  Feed Queue     │ → enqueueFeedGeneration()
└─────────────────┘
         ↓
┌─────────────────┐
│ Feed Generator  │ → generateGoogleXmlAndUpload()
└─────────────────┘
         ↓
┌─────────────────┐
│  S3/R2 Storage  │ → Updated XML feed file
└─────────────────┘
```

## Support

For issues or questions, contact: hi@letsgolukas.com

