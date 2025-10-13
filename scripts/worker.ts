#!/usr/bin/env tsx

/**
 * Feed Generation Worker
 * 
 * This script starts the BullMQ worker to process feed generation jobs
 * and initializes the cron scheduler for automatic feed generation.
 * Run with: npm run worker:dev
 */

import "../app/services/queue/feed-queue.server";
import { initializeScheduler, cronScheduler } from "../app/services/scheduler/cron-scheduler.server";

async function startWorker() {
  console.log("🚀 Starting feed generation worker...");
  
  try {
    // Initialize the cron scheduler
    await initializeScheduler();
    console.log("✅ Worker and scheduler initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize worker:", error);
    process.exit(1);
  }
}

// Start the worker
startWorker();

console.log("Press Ctrl+C to stop the worker");

// Keep the process running
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully");
  cronScheduler.shutdown();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully");
  cronScheduler.shutdown();
  process.exit(0);
});