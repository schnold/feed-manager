import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { generateGoogleXML } from "../feeds/generate-google-xml.server";
import { FeedRepository } from "../../db/repositories/feed.server";

// Redis connection for BullMQ - only connect if REDIS_URL is provided
// Note: We need separate connections for Queue (can use number) and Worker (must be null)
let redisQueue: Redis | null = null;
let redisWorker: Redis | null = null;

// Check if we're in a serverless environment (Netlify Functions, AWS Lambda, etc.)
// Netlify Functions run in AWS Lambda, so we check for Lambda environment variables
const isServerless = !!(
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.AWS_EXECUTION_ENV ||
  process.env.VERCEL ||
  (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL)
);

if (process.env.REDIS_URL && !isServerless) {
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
} else if (process.env.REDIS_URL && isServerless) {
  // In serverless, we still create the queue connection but don't connect immediately
  // This allows queue operations to work if Redis is available
  try {
    redisQueue = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000, // Shorter timeout for serverless
      retryStrategy: () => null, // Disable automatic retries
      // Don't auto-reconnect in serverless - let it fail gracefully
      reconnectOnError: false,
    });
  } catch (error) {
    console.warn('Failed to create Redis connection in serverless:', error);
    redisQueue = null;
  }
} else {
  console.warn('REDIS_URL not provided. Queue functionality will be disabled.');
}

// Handle Redis connection errors gracefully
if (redisQueue) {
  redisQueue.on('error', (error) => {
    // In serverless, connection errors are expected and should be handled silently
    // Don't log connection errors in serverless to reduce noise
    if (!isServerless) {
      console.warn('Redis queue connection error:', error.message);
      console.warn('Queue functionality will be disabled. Install Redis locally or fix Redis URL.');
    }
    // Silently disable queue functionality - don't throw or cause unhandled errors
    // The queue will fall back to synchronous processing
    try {
      redisQueue = null;
    } catch (e) {
      // Ignore any errors during cleanup
    }
  });

  redisQueue.on('connect', () => {
    if (!isServerless) {
      console.log('Redis queue connected successfully');
    }
  });

  redisQueue.on('ready', async () => {
    if (!isServerless) {
      console.log('Redis queue ready');
      // Check eviction policy
      try {
        const policy = await redisQueue!.config('GET', 'maxmemory-policy');
        if (policy && policy[1] !== 'noeviction') {
          console.warn(`⚠️  Redis eviction policy is "${policy[1]}". For optimal BullMQ performance, it should be "noeviction".`);
          console.warn('   This may cause job data to be evicted under memory pressure.');
        }
      } catch (error) {
        // Silently ignore eviction policy check errors
      }
    }
  });

  // Handle close events gracefully
  redisQueue.on('close', () => {
    // Connection closed - this is normal in serverless environments
    if (!isServerless) {
      console.log('Redis queue connection closed');
    }
  });
}

if (redisWorker) {
  redisWorker.on('error', (error) => {
    // Silently handle worker connection errors
    if (!isServerless) {
      console.warn('Redis worker connection error:', error.message);
    }
    try {
      redisWorker = null;
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  redisWorker.on('connect', () => {
    if (!isServerless) {
      console.log('Redis worker connected successfully');
    }
  });

  redisWorker.on('close', () => {
    if (!isServerless) {
      console.log('Redis worker connection closed');
    }
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
    
    // Handle queue errors gracefully
    feedGenerationQueue.on('error', (error) => {
      if (!isServerless) {
        console.warn('Feed generation queue error:', error.message);
      }
      // Don't throw - queue will fall back to synchronous processing
    });
  } catch (error) {
    // Silently handle queue creation errors
    if (!isServerless) {
      console.warn('Failed to create feed generation queue:', error);
    }
    feedGenerationQueue = null;
  }
} else {
  if (!isServerless) {
    console.warn('Redis not available. Feed generation queue will not be created.');
  }
}

export { feedGenerationQueue };

// Add job to queue
export async function enqueueFeedGeneration(data: FeedGenerationJob) {
  const processSynchronously = async () => {
    console.warn('Feed generation queue is not available. Processing feed generation synchronously.');
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
  };

  if (!feedGenerationQueue) {
    return processSynchronously();
  }

  // Try to enqueue, but fall back to synchronous processing if Redis fails
  try {
    return await feedGenerationQueue.add(
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
  } catch (error) {
    console.warn(`Failed to enqueue feed generation (${error instanceof Error ? error.message : 'Unknown error'}). Falling back to synchronous processing.`);
    return processSynchronously();
  }
}

// Worker to process feed generation jobs
// Note: Workers should NOT be created in serverless environments like Netlify Functions
// They should run in a separate long-running process
let feedGenerationWorker: Worker<FeedGenerationJob> | null = null;

// Only create worker if we're NOT in a serverless environment
// In Netlify Functions, workers should run separately (e.g., in a scheduled function or external service)
if (redisWorker && feedGenerationQueue && !isServerless) {
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
} else if (isServerless) {
  // In serverless environments, workers should not be created
  // They should run in a separate long-running process or scheduled function
  if (process.env.NODE_ENV === 'production') {
    console.log('Worker not created in production serverless environment. Use a separate worker process.');
  }
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