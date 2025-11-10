import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { generateGoogleXML } from "../feeds/generate-google-xml.server";
import { FeedRepository } from "../../db/repositories/feed.server";

// Redis connection for BullMQ - only connect if REDIS_URL is provided
// Note: We need separate connections for Queue (can use number) and Worker (must be null)
let redisQueue: Redis | null = null;
let redisWorker: Redis | null = null;

if (process.env.REDIS_URL) {
  try {
    // Connection for Queue - can use maxRetriesPerRequest: 3
    redisQueue = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: () => null, // Disable automatic retries
    });

    // Connection for Worker - must use maxRetriesPerRequest: null for blocking operations
    redisWorker = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ Workers
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: () => null, // Disable automatic retries
    });
  } catch (error) {
    console.warn('Failed to create Redis connection:', error);
    redisQueue = null;
    redisWorker = null;
  }
} else {
  console.warn('REDIS_URL not provided. Queue functionality will be disabled.');
}

// Handle Redis connection errors gracefully
if (redisQueue) {
  redisQueue.on('error', (error) => {
    console.warn('Redis queue connection error:', error.message);
    console.warn('Queue functionality will be disabled. Install Redis locally or fix Redis URL.');
  });

  redisQueue.on('connect', () => {
    console.log('Redis queue connected successfully');
  });

  redisQueue.on('ready', async () => {
    console.log('Redis queue ready');
    // Check eviction policy
    try {
      const policy = await redisQueue!.config('GET', 'maxmemory-policy');
      if (policy && policy[1] !== 'noeviction') {
        console.warn(`⚠️  Redis eviction policy is "${policy[1]}". For optimal BullMQ performance, it should be "noeviction".`);
        console.warn('   This may cause job data to be evicted under memory pressure.');
      }
    } catch (error) {
      console.warn('Could not check Redis eviction policy:', error);
    }
  });
}

if (redisWorker) {
  redisWorker.on('error', (error) => {
    console.warn('Redis worker connection error:', error.message);
  });

  redisWorker.on('connect', () => {
    console.log('Redis worker connected successfully');
  });
}

// Job data interface
interface FeedGenerationJob {
  feedId: string;
  shopId: string;
  shopDomain: string; // Shop domain for Shopify API access
  accessToken: string; // Shop access token for Shopify API access
  triggeredBy?: string; // "manual" | "webhook" | "schedule" | "creation"
}

// Create the feed generation queue with error handling
let feedGenerationQueue: Queue<FeedGenerationJob> | null = null;

if (redisQueue) {
  try {
    feedGenerationQueue = new Queue<FeedGenerationJob>("feed-generation", {
      connection: redisQueue,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000
        },
        removeOnComplete: 10,
        removeOnFail: 5
      }
    });
  } catch (error) {
    console.warn('Failed to create feed generation queue:', error);
    feedGenerationQueue = null;
  }
} else {
  console.warn('Redis not available. Feed generation queue will not be created.');
}

export { feedGenerationQueue };

// Add job to queue
export async function enqueueFeedGeneration(data: FeedGenerationJob) {
  if (!feedGenerationQueue) {
    console.warn('Feed generation queue is not available. Processing feed generation synchronously.');
    // Fallback: process feed generation synchronously
    try {
      await FeedRepository.updateStatus(data.feedId, "running", new Date());
      await generateGoogleXML({
        feedId: data.feedId,
        shopDomain: data.shopDomain,
        accessToken: data.accessToken
      });
      await FeedRepository.updateStatus(data.feedId, "success", new Date(), new Date());
      console.log(`[Sync] Successfully generated feed ${data.feedId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await FeedRepository.updateStatus(data.feedId, "error", new Date(), undefined, errorMessage);
      console.error(`[Sync] Failed to generate feed ${data.feedId}:`, errorMessage);
      throw error;
    }
    return;
  }

  return feedGenerationQueue.add(
    `generate-feed-${data.feedId}`,
    data,
    {
      // Prevent duplicate jobs for same feed
      jobId: `feed-${data.feedId}`,
      // Remove existing job with same ID if any
      removeOnComplete: true,
      removeOnFail: true
    }
  );
}

// Worker to process feed generation jobs
// Note: Workers should NOT be created in serverless environments like Netlify Functions
// They should run in a separate long-running process
let feedGenerationWorker: Worker<FeedGenerationJob> | null = null;

// Only create worker if we're NOT in a serverless environment
// In Netlify Functions, workers should run separately (e.g., in a scheduled function or external service)
if (redisWorker && feedGenerationQueue && process.env.NODE_ENV !== 'production') {
  try {
    feedGenerationWorker = new Worker<FeedGenerationJob>(
      "feed-generation",
      async (job: Job<FeedGenerationJob>) => {
        const { feedId, shopId, shopDomain, accessToken, triggeredBy } = job.data;

        console.log(`[Worker] Processing feed generation for feed ${feedId} (triggered by: ${triggeredBy})`);

        try {
          // Update feed status to running
          await FeedRepository.updateStatus(feedId, "running", new Date());

          // Generate the feed with shop credentials for API access
          await generateGoogleXML({
            feedId,
            shopDomain,
            accessToken
          });

          // Update feed status to success
          await FeedRepository.updateStatus(
            feedId,
            "success",
            new Date(),
            new Date()
          );

          console.log(`[Worker] Successfully generated feed ${feedId}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          // Update feed status to error
          await FeedRepository.updateStatus(
            feedId,
            "error",
            new Date(),
            undefined,
            errorMessage
          );

          console.error(`[Worker] Failed to generate feed ${feedId}:`, errorMessage);
          throw error;
        }
      },
      {
        connection: redisWorker, // Use worker-specific connection with maxRetriesPerRequest: null
        concurrency: 2 // Process 2 feeds concurrently
      }
    );
  } catch (error) {
    console.warn('Failed to create feed generation worker:', error);
    feedGenerationWorker = null;
  }
} else if (process.env.NODE_ENV === 'production') {
  console.log('Worker not created in production serverless environment. Use a separate worker process.');
}

export { feedGenerationWorker };

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down feed generation worker...");
  if (feedGenerationWorker) {
    await feedGenerationWorker.close();
  }
  if (feedGenerationQueue) {
    await feedGenerationQueue.close();
  }
  if (redisQueue) {
    await redisQueue.disconnect();
  }
  if (redisWorker) {
    await redisWorker.disconnect();
  }
  process.exit(0);
});