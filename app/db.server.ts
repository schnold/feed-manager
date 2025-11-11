import { PrismaClient } from "@prisma/client";

console.log("[db.server] Initializing Prisma client...");
console.log("[db.server] NODE_ENV:", process.env.NODE_ENV);
console.log("[db.server] DATABASE_URL:", process.env.DATABASE_URL ? "set" : "missing");

declare global {
  var prismaGlobal: PrismaClient;
}

let prisma: PrismaClient;

try {
  if (process.env.NODE_ENV !== "production") {
    if (!global.prismaGlobal) {
      console.log("[db.server] Creating new Prisma client (development)");
      global.prismaGlobal = new PrismaClient();
    }
    prisma = global.prismaGlobal;
  } else {
    // In production (serverless), always create a new client
    // Don't use global cache in serverless environments
    console.log("[db.server] Creating new Prisma client (production)");
    prisma = new PrismaClient({
      // Note: Connection pool settings (connection_limit, pool_timeout) should be
      // configured in the DATABASE_URL connection string for serverless environments.
      // Example: postgresql://user:pass@host:port/db?connection_limit=20&pool_timeout=30
      // This helps prevent "Timed out fetching a new connection from the connection pool" errors
    });
  }
  console.log("[db.server] Prisma client initialized successfully");
} catch (error) {
  console.error("[db.server] FATAL: Failed to initialize Prisma client:", error);
  if (error instanceof Error) {
    console.error("[db.server] Error message:", error.message);
    console.error("[db.server] Error stack:", error.stack);
  }
  throw error;
}

export default prisma;
