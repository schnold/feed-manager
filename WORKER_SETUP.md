# Feed Generation Worker Setup

## Overview

The Feed Manager app uses a background worker to process feed generation jobs asynchronously. This ensures that feed generation doesn't block the main application and can handle multiple feeds concurrently.

## Architecture

- **Queue System**: BullMQ (backed by Redis)
- **Worker Process**: Separate Node.js process that processes feed generation jobs
- **Database**: PostgreSQL (Neon) for storing feed metadata
- **Storage**: Cloudflare R2 for storing generated XML files

## Prerequisites

1. **Redis**: The worker requires a Redis server to manage the job queue
   - You can use a cloud Redis service (Redis Cloud, Upstash, etc.)
   - Or install Redis locally:
     - **Windows**: Use WSL2 and install Redis, or use a Docker container
     - **macOS**: `brew install redis`
     - **Linux**: `sudo apt-get install redis-server`

2. **Environment Variables**: Make sure your `.env` file has the following:
   ```env
   # Redis URL for BullMQ queue
   REDIS_URL=redis://default:password@host:port

   # Database
   DATABASE_URL=postgresql://...
   DIRECT_DATABASE_URL=postgresql://...

   # S3/R2 Storage
   S3_ENDPOINT=https://...
   S3_REGION=auto
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_BUCKET=feed-manager
   FEED_CDN_BASE=https://pub-xxx.r2.dev
   ```

## Running the Worker

### Development

Open a **separate terminal** from your main app and run:

```bash
npm run worker:dev
```

This will:
1. Connect to Redis
2. Start listening for feed generation jobs
3. Initialize cron schedulers for automatic feed generation
4. Process jobs concurrently (2 at a time by default)

### Production

The worker should run as a separate process alongside your main app:

```bash
# Build the app first
npm run build

# Start the worker
npm run worker:dev
```

**Important**: Make sure the worker is running continuously in production, or feed generation will not work!

## How It Works

### Feed Creation Flow

1. **User creates a feed** → Feed is saved to database with `status: "pending"`
2. **Job is enqueued** → `enqueueFeedGeneration()` adds a job to the Redis queue
3. **Worker picks up job** → Worker changes status to `"running"`
4. **Products are fetched** → Worker iterates through Shopify products
5. **XML is generated** → Feed XML is built according to Google Shopping spec
6. **Upload to R2** → XML file is uploaded to Cloudflare R2
7. **Status updated** → Feed status changes to `"success"` with product counts
8. **UI updates** → Frontend polls and shows the feed is ready

### Status Flow

```
idle → pending → running → success
                    ↓
                  error
```

- **idle**: Feed exists but hasn't been generated yet (shouldn't happen with auto-generation)
- **pending**: Feed generation has been queued
- **running**: Worker is actively generating the feed
- **success**: Feed has been generated and is available
- **error**: Something went wrong during generation

## Troubleshooting

### Worker not processing jobs?

1. **Check Redis connection**:
   ```bash
   # Test Redis connection
   redis-cli -u $REDIS_URL ping
   ```
   Should return `PONG`

2. **Check worker logs**:
   - Look for `✅ Worker and scheduler initialized successfully`
   - Check for any Redis connection errors

3. **Verify Redis URL format**:
   ```
   redis://username:password@host:port
   redis://default:password@host:port/0
   ```

### Feeds stuck in "pending" or "running"?

1. **Restart the worker** - Jobs will be retried automatically
2. **Check database** - Make sure the feed record exists
3. **Check S3 credentials** - Verify R2 access keys are correct

### Manual feed generation (bypass queue)

If the worker is not available, the system will fall back to synchronous generation:

```typescript
// In feed-queue.server.ts
if (!feedGenerationQueue) {
  // Processes feed synchronously without queue
  await generateGoogleXML({ feedId, request });
}
```

This is slower but ensures feeds can still be generated.

## Deployment Considerations

### Separate Worker Dyno/Container

For production, run the worker as a separate service:

**Heroku**:
```yaml
# Procfile
web: npm start
worker: npm run worker:dev
```

**Docker Compose**:
```yaml
version: '3'
services:
  web:
    build: .
    command: npm start

  worker:
    build: .
    command: npm run worker:dev
```

**Fly.io**:
```toml
[[services]]
  internal_port = 8080
  processes = ["web"]

[[vm]]
  processes = ["worker"]
  size = "shared-cpu-1x"
```

### Scaling

- **Multiple workers**: You can run multiple worker instances for better concurrency
- **Adjust concurrency**: Change in `feed-queue.server.ts`:
  ```typescript
  {
    connection: redis,
    concurrency: 5 // Process 5 feeds at once
  }
  ```

### Monitoring

Monitor your worker with:
- **BullMQ Dashboard**: Use `bull-board` for a web UI
- **Logs**: Watch for `[Worker]` prefixed logs
- **Redis**: Monitor queue length and job status

## Testing

To test the complete flow:

1. Start the main app: `npm run dev`
2. Start the worker: `npm run worker:dev` (in a separate terminal)
3. Create a new feed in the UI
4. Watch the logs:
   - Worker should pick up the job
   - Feed status should change from `pending` → `running` → `success`
   - XML file should appear in R2 storage
5. Copy the feed link and verify the XML is accessible

## Alternative: No Worker Setup

If you don't want to run a separate worker, the system will process feeds synchronously. However:

- ⚠️ Feed generation will block the request
- ⚠️ Large feeds may timeout
- ⚠️ No concurrent processing
- ✅ Simpler deployment (single process)

The system automatically detects if Redis is unavailable and falls back to synchronous processing.
