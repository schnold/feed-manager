// Netlify Function for background worker tasks
// This handles feed generation and other background processes

import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

// Initialize Redis connection
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

// Create queue for feed generation
const feedQueue = new Queue('feed-generation', {
  connection: redis,
});

// Worker for processing feed generation jobs
const worker = new Worker('feed-generation', async (job) => {
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

// Export handler for Netlify Functions
export const handler = async (event, context) => {
  // This function can be triggered by webhooks or scheduled events
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
