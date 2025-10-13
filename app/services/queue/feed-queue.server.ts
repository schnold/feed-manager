import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { generateGoogleXML } from "../feeds/generate-google-xml.server";
import { FeedRepository } from "../../db/repositories/feed.server";

// Redis connection for BullMQ
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true
});

// Handle Redis connection errors gracefully
redis.on('error', (error) => {
  console.warn('Redis connection error:', error.message);
  console.warn('Queue functionality will be disabled. Install Redis locally or fix Redis URL.');
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('ready', async () => {
  console.log('Redis ready');
  // Check eviction policy
  try {
    const policy = await redis.config('GET', 'maxmemory-policy');
    if (policy && policy[1] !== 'noeviction') {
      console.warn(`⚠️  Redis eviction policy is "${policy[1]}". For optimal BullMQ performance, it should be "noeviction".`);
      console.warn('   This may cause job data to be evicted under memory pressure.');
    }
  } catch (error) {
    console.warn('Could not check Redis eviction policy:', error);
  }
});

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

try {
  feedGenerationQueue = new Queue<FeedGenerationJob>("feed-generation", {
    connection: redis,
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
let feedGenerationWorker: Worker<FeedGenerationJob> | null = null;

try {
  if (feedGenerationQueue) {
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
        connection: redis,
        concurrency: 2 // Process 2 feeds concurrently
      }
    );
  }
} catch (error) {
  console.warn('Failed to create feed generation worker:', error);
  feedGenerationWorker = null;
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
  await redis.disconnect();
  process.exit(0);
});