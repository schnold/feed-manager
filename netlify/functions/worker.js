// Netlify Function for background worker tasks
// This handles feed generation and other background processes

import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

// Initialize Redis connection - only if REDIS_URL is provided
let redis = null;
let feedQueue = null;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: () => null, // Disable automatic retries
    });

    // Handle Redis connection errors gracefully
    redis.on('error', (error) => {
      console.warn('Redis connection error in worker:', error.message);
    });

    // Create queue for feed generation
    feedQueue = new Queue('feed-generation', {
      connection: redis,
    });
  } catch (error) {
    console.warn('Failed to initialize Redis in worker:', error);
    redis = null;
    feedQueue = null;
  }
} else {
  console.warn('REDIS_URL not provided. Worker queue functionality will be disabled.');
}

// Worker for processing feed generation jobs - only create if Redis is available
let worker = null;

if (redis && feedQueue) {
  try {
    worker = new Worker('feed-generation', async (job) => {
      const { feedId, shopDomain } = job.data;
      
      try {
        // Import the feed generation logic
        const { generateFeed } = await import('../../app/services/feeds/generate-google-xml.server.js');
        
        // Generate the feed
        await generateFeed(feedId, shopDomain);
        
        console.log(`Feed ${feedId} generated successfully for shop ${shopDomain}`);
      } catch (error) {
        console.error(`Error generating feed ${feedId}:`, error);
        throw error;
      }
    }, {
      connection: redis,
      concurrency: 5,
    });

    // Handle worker events
    worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err);
    });
  } catch (error) {
    console.warn('Failed to create worker:', error);
    worker = null;
  }
}

// Export handler for Netlify Functions
export const handler = async (event, context) => {
  // This function can be triggered by webhooks or scheduled events
  if (!feedQueue) {
    console.warn('Feed queue not available. Redis connection required for worker functionality.');
    return {
      statusCode: 503,
      body: JSON.stringify({ error: 'Queue service unavailable. Redis connection required.' })
    };
  }

  const { feedId, shopDomain, action } = JSON.parse(event.body || '{}');
  
  try {
    switch (action) {
      case 'generate-feed':
        await feedQueue.add('generate-feed', { feedId, shopDomain });
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Feed generation queued' })
        };
      
      case 'process-webhook':
        // Handle product webhook processing
        await feedQueue.add('process-webhook', { feedId, shopDomain, data: event.body });
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Webhook processed' })
        };
      
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid action' })
        };
    }
  } catch (error) {
    console.error('Worker function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
