import { createRequestHandler } from "@netlify/remix-adapter";
import * as build from "../../build/server/index.js";

// Validate that build has required exports
if (!build) {
  throw new Error(
    "Remix build is missing. Make sure the build completed successfully."
  );
}

// Debug: Log available exports (remove in production if needed)
if (process.env.NODE_ENV !== "production") {
  console.log("Build exports:", Object.keys(build));
  console.log("Routes type:", typeof build.routes);
  console.log("Routes value:", build.routes ? "exists" : "missing");
}

// Ensure routes is properly set - it might be undefined if route config isn't loaded
if (!build.routes) {
  console.error("Warning: build.routes is undefined. This may cause routing issues.");
  // Try to provide a fallback or throw a more descriptive error
  throw new Error(
    "Remix build is missing routes export. " +
    "This may be due to a build configuration issue with v3_routeConfig. " +
    "Available exports: " + Object.keys(build).join(", ")
  );
}

// Create the request handler using Netlify adapter
export const handler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV || "production",
});

// Export for Netlify Functions
export { handler as default };
