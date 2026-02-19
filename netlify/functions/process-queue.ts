import type { Handler } from "@netlify/functions";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { generateGoogleXML } from "../../app/services/feeds/generate-google-xml.server";
import { FeedRepository } from "../../app/db/repositories/feed.server";

/**
 * Netlify Function to process pending jobs from the feed generation queue
 *
 * This function should be triggered:
 * 1. On a schedule (every 5-10 minutes) to process any pending jobs
 * 2. Via webhook/API call after adding jobs to the queue
 *
 * Setup:
 * 1. Add schedule in netlify.toml:
 *    [functions."process-queue"]
 *    schedule = "* / 5 * * * *"  # Every 5 minutes (space added to prevent comment break)
 *
 * 2. Ensure REDIS_URL is set in Netlify environment variables
 */

interface FeedGenerationJob {
  feedId: string;
  shopId: string;
  shopDomain: string;
  accessToken: string;
  triggeredBy?: string;
}

const handler: Handler = async () => {
  console.log("[Queue Processor] Starting queue processing...");

  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL not configured");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Redis not configured" })
    };
  }

  let redisConnection: Redis | null = null;
  let queue: Queue<FeedGenerationJob> | null = null;
  const processedJobs: string[] = [];
  const failedJobs: string[] = [];

  try {
    // Create Redis connection with TLS support
    const redisOptions: any = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      connectTimeout: 5000,
    };

    if (process.env.REDIS_URL.startsWith('rediss://')) {
      redisOptions.tls = {
        rejectUnauthorized: false
      };
    }

    redisConnection = new Redis(process.env.REDIS_URL, redisOptions);

    // Add error listener to catch async connection issues
    redisConnection.on('error', (err) => {
      console.warn("[Queue Processor] Redis connection error:", err.message);
    });

    // Create queue instance
    queue = new Queue<FeedGenerationJob>("feed-generation", {
      connection: redisConnection,
    });

    // Get waiting jobs (limit to 10 per execution to avoid timeout)
    const waitingJobs = await queue.getWaiting(0, 9);

    console.log(`[Queue Processor] Found ${waitingJobs.length} waiting jobs`);

    if (waitingJobs.length === 0) {
      await redisConnection.disconnect();
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No jobs to process",
          processed: 0
        })
      };
    }

    // Process each job
    for (const job of waitingJobs) {
      const { feedId, shopDomain, accessToken, triggeredBy } = job.data;

      try {
        console.log(`[Queue Processor] Processing feed ${feedId} (triggered by: ${triggeredBy})`);

        // Check if feed still exists before even starting
        const feed = await FeedRepository.findById(feedId);
        if (!feed) {
          console.warn(`[Queue Processor] Feed ${feedId} no longer exists. Skipping and removing job.`);
          await job.remove();
          continue;
        }

        // Generate the feed - handles its own status updates to success/error
        await generateGoogleXML({
          feedId,
          shopDomain,
          accessToken
        });

        // Mark job as completed
        await job.moveToCompleted("success", job.token || "0");
        await job.remove();

        processedJobs.push(feedId);
        console.log(`[Queue Processor] Successfully processed feed ${feedId}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Queue Processor] Failed to process job ${job.id}:`, errorMessage);

        try {
          // If generateGoogleXML failed, it already updated the status to 'error'.
          // Here we just handle the BullMQ job lifecycle.
          await job.moveToFailed(new Error(errorMessage), job.token || "0");
          failedJobs.push(feedId);
        } catch (jobError) {
          console.error(`[Queue Processor] Failed to move job to failed:`, jobError);
        }
      }
    }

    // Cleanup
    await redisConnection.disconnect();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Queue processing completed",
        processed: processedJobs.length,
        failed: failedJobs.length,
        processedJobs,
        failedJobs
      })
    };

  } catch (error) {
    console.error("[Queue Processor] Error:", error);

    if (redisConnection) {
      try {
        await redisConnection.disconnect();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process queue",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};

export { handler };
