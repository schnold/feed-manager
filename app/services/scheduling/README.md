# Feed Scheduling System

## Overview

This directory contains the timezone-aware scheduling system for automated feed regeneration. Each feed is regenerated once per day at 2 AM in its configured timezone, even when the app is not open.

## How It Works

### Architecture

1. **Netlify Scheduled Function** (`netlify/functions/scheduled-feed-regeneration.ts`)
   - Runs every hour (configured in `netlify.toml`)
   - Calls the `/api/feeds/regenerate-scheduled` endpoint
   - Provides the secret token for authentication

2. **Regeneration API Endpoint** (`app/routes/api/feeds.regenerate-scheduled.ts`)
   - Receives the hourly trigger from Netlify
   - Uses the scheduler service to find feeds due for regeneration
   - Enqueues feed generation jobs for feeds that need updating

3. **Scheduler Service** (`feed-scheduler.server.ts`)
   - Contains the core timezone-aware scheduling logic
   - Determines which feeds need regeneration based on:
     - Feed's timezone setting
     - Last successful run time
     - Configured hour of day (default: 2 AM)
   - Manages feed schedules in the database

### Key Features

- **Timezone-Aware**: Each feed runs at 2 AM in its own timezone
- **Once-Per-Day**: Feeds are only regenerated once per 24-hour period in their timezone
- **Reliable**: Uses database timestamps to track last runs and prevent duplicates
- **Automatic**: No manual intervention required once set up
- **Background Processing**: Uses BullMQ for queue management with Redis

## Setup Instructions

### 1. Environment Variables

Add the following to your Netlify environment variables:

```bash
FEED_REGENERATION_SECRET=your-secure-random-secret-here
```

You can generate a secure secret with:
```bash
openssl rand -base64 32
```

### 2. Netlify Configuration

The `netlify.toml` file is already configured with:

```toml
[functions."scheduled-feed-regeneration"]
  schedule = "0 * * * *"  # Every hour
```

This schedule runs the function every hour at the top of the hour.

### 3. Database Setup

The system uses the existing `FeedSchedule` table in your Prisma schema:

```prisma
model FeedSchedule {
  id      String  @id @default(cuid())
  feedId  String
  feed    Feed    @relation(fields: [feedId], references: [id])
  cron    String
  enabled Boolean @default(true)
}
```

Schedules are automatically created when feeds are created or updated.

## Usage

### Creating a Feed

When you create a new feed, a schedule is automatically set up:

```typescript
await createOrUpdateFeedSchedule(feed.id, {
  hourOfDay: 2,  // 2 AM in feed's timezone
  enabled: true
});
```

### Updating a Feed

When you update a feed (especially if you change its timezone), the schedule is automatically updated to ensure the feed regenerates at the correct time in the new timezone.

### Manual Testing

You can test the scheduling system by:

1. **Via API**:
   ```bash
   curl -X POST https://your-app.netlify.app/api/feeds/regenerate-scheduled \
     -H "Content-Type: application/json" \
     -H "X-Regeneration-Secret: your-secret" \
     -d '{"hourOfDay": 2, "toleranceMinutes": 60}'
   ```

2. **Via Netlify Functions UI**:
   - Go to your Netlify dashboard
   - Navigate to Functions → scheduled-feed-regeneration
   - Click "Trigger function" to manually invoke it

## How Scheduling Works

### Timezone Detection

```typescript
// Example: Feed with timezone "America/New_York"
const nextRun = getNextScheduledRun("America/New_York", 2);
// Returns: Next occurrence of 2 AM Eastern Time
```

### Regeneration Check

The system checks if a feed should regenerate by:

1. Converting current time to feed's timezone
2. Checking if last run was on a different day in that timezone
3. Verifying we're within the tolerance window of 2 AM

```typescript
const shouldRegenerate = shouldRegenerateNow(
  "America/New_York",  // Feed timezone
  lastRunAt,            // Last successful run
  2,                    // Hour of day (2 AM)
  60                    // Tolerance in minutes
);
```

### Example Timeline

For a feed in `America/New_York` timezone:

- **Day 1, 2:00 AM ET**: Feed regenerates
- **Day 1, 3:00 AM ET**: Check runs, skips (already ran today)
- **Day 1, 11:59 PM ET**: Check runs, skips (already ran today)
- **Day 2, 2:00 AM ET**: Feed regenerates again
- **Day 2, 2:30 AM ET**: Check runs, skips (already ran today)

## UI Updates

The feeds list page shows:

- **Last Update**: The last successful regeneration time in the feed's timezone
- **Next Scheduled**: The next scheduled regeneration time in the feed's timezone

Both timestamps include the timezone abbreviation (e.g., "EST", "PST") for clarity.

## Troubleshooting

### Feed Not Regenerating

1. **Check Schedule Exists**:
   ```sql
   SELECT * FROM "FeedSchedule" WHERE "feedId" = 'your-feed-id';
   ```

2. **Check Last Run Time**:
   ```sql
   SELECT "lastSuccessAt", "timezone" FROM "Feed" WHERE "id" = 'your-feed-id';
   ```

3. **Verify Netlify Function**:
   - Check Netlify Functions logs
   - Ensure `FEED_REGENERATION_SECRET` is set
   - Verify the function is scheduled and enabled

4. **Check API Endpoint**:
   ```bash
   curl https://your-app.netlify.app/api/feeds/regenerate-scheduled
   # Should return 401 without secret, confirming it's accessible
   ```

### Feed Regenerating Too Often

This shouldn't happen as the system checks `lastSuccessAt` and only regenerates if:
- Last run was on a different day in the feed's timezone
- Current time is within the tolerance window of the scheduled hour

### Feed Not Showing in UI

Make sure:
- The feed has a `timezone` set
- The `lastSuccessAt` is being updated after successful generation
- The page is being refreshed (it polls every 5 seconds when feeds are running)

## Advanced Configuration

### Change Regeneration Hour

To change when feeds regenerate (e.g., to 3 AM instead of 2 AM):

1. Update the Netlify function call:
   ```typescript
   body: JSON.stringify({
     hourOfDay: 3,  // Change to desired hour
     toleranceMinutes: 60
   })
   ```

2. Update feed creation/update code:
   ```typescript
   await createOrUpdateFeedSchedule(feedId, {
     hourOfDay: 3,  // Change to match
     enabled: true
   });
   ```

### Change Tolerance Window

The tolerance window allows feeds to regenerate within X minutes of the scheduled time:

```typescript
await regenerateDueFeeds(
  2,   // Hour of day
  120  // Tolerance in minutes (2 hours)
);
```

### Disable Automatic Regeneration

To disable automatic regeneration for a specific feed:

```typescript
await disableFeedSchedule(feedId);
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Netlify Scheduled Function                             │
│  Runs: Every hour (0 * * * *)                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ POST /api/feeds/regenerate-scheduled
                 │ Headers: X-Regeneration-Secret
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Regeneration API Endpoint                              │
│  - Validates secret                                     │
│  - Calls regenerateDueFeeds()                           │
└────────────────┬────────────────────────────────────────┘
                 │
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Feed Scheduler Service                                 │
│  - Gets all feeds from database                         │
│  - Checks each feed's timezone                          │
│  - Compares with lastSuccessAt                          │
│  - Determines if regeneration is due                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ For each feed due for regeneration
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Feed Queue (BullMQ + Redis)                            │
│  - Enqueues feed generation job                         │
│  - Worker processes job asynchronously                  │
│  - Updates lastRunAt and lastSuccessAt                  │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

```prisma
model Feed {
  // ... other fields
  timezone      String      // IANA timezone (e.g., "America/New_York")
  status        String      // idle|running|success|error
  lastRunAt     DateTime?   // When feed generation last started
  lastSuccessAt DateTime?   // When feed was last successfully generated

  schedules     FeedSchedule[]
}

model FeedSchedule {
  id      String  @id @default(cuid())
  feedId  String
  feed    Feed    @relation(fields: [feedId], references: [id])
  cron    String  // Cron expression (e.g., "0 2 * * *")
  enabled Boolean @default(true)
}
```

## API Reference

### `getNextScheduledRun(timezone, hourOfDay)`

Returns the next scheduled run time for a feed.

**Parameters**:
- `timezone`: IANA timezone string (e.g., "America/New_York")
- `hourOfDay`: Hour in 24-hour format (0-23), default: 2

**Returns**: Date object for next scheduled run

### `shouldRegenerateNow(timezone, lastRunAt, hourOfDay, toleranceMinutes)`

Determines if a feed should be regenerated now.

**Parameters**:
- `timezone`: IANA timezone string
- `lastRunAt`: Date of last successful run (or null)
- `hourOfDay`: Scheduled hour (0-23), default: 2
- `toleranceMinutes`: Tolerance window in minutes, default: 60

**Returns**: boolean

### `getFeedsDueForRegeneration(hourOfDay, toleranceMinutes)`

Gets all feeds that need regeneration.

**Returns**: Array of objects with feed, shop, shouldRegenerate, and nextScheduledRun

### `regenerateDueFeeds(hourOfDay, toleranceMinutes)`

Regenerates all feeds that are due.

**Returns**: Statistics object with counts and errors

### `createOrUpdateFeedSchedule(feedId, config)`

Creates or updates a feed schedule.

**Parameters**:
- `feedId`: Feed ID
- `config`: Object with hourOfDay, enabled, and optional cron

### `disableFeedSchedule(feedId)`

Disables scheduled regeneration for a feed.

### `getFeedSchedule(feedId)`

Gets schedule information for a feed.

**Returns**: Object with feed, schedule, nextScheduledRun, and timing info

## Best Practices

1. **Always set a timezone when creating feeds**
   - Use IANA timezone format (e.g., "America/New_York")
   - This ensures accurate scheduling

2. **Monitor Netlify function logs**
   - Check for errors or warnings
   - Verify feeds are being enqueued correctly

3. **Use appropriate tolerance windows**
   - Default 60 minutes works for most cases
   - Increase if your function execution varies significantly

4. **Test in development**
   - Use the manual API testing method
   - Verify feeds regenerate at expected times

5. **Keep Redis available**
   - The queue system requires Redis
   - Falls back to synchronous processing if unavailable
