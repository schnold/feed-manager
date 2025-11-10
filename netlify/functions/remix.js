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
const remixHandler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV || "production",
});

// Wrap handler to ensure request URL is valid
export const handler = async (event, context) => {
  try {
    // Ensure the request has a valid URL
    // Netlify Functions v2 format
    if (!event.path) {
      event.path = event.rawPath || "/";
    }
    
    // Construct rawUrl if missing (required by adapter)
    if (!event.rawUrl) {
      const protocol = event.headers?.['x-forwarded-proto'] || 'https';
      const host = event.headers?.host || event.headers?.['x-forwarded-host'] || 'localhost';
      const path = event.path || event.rawPath || "/";
      const query = event.rawQueryString || "";
      event.rawUrl = `${protocol}://${host}${path}${query ? `?${query}` : ""}`;
    }
    
    // Ensure url exists (fallback to rawUrl)
    if (!event.url) {
      event.url = event.rawUrl;
    }
    
    // Ensure headers exist
    if (!event.headers) {
      event.headers = {};
    }
    
    // Ensure queryStringParameters exists
    if (!event.queryStringParameters) {
      event.queryStringParameters = {};
    }
    
    // Ensure multiValueQueryStringParameters exists
    if (!event.multiValueQueryStringParameters) {
      event.multiValueQueryStringParameters = {};
    }
    
    // Ensure rawQueryString exists
    if (!event.rawQueryString) {
      const queryParams = event.queryStringParameters || {};
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
      event.rawQueryString = queryString;
    }
    
    return await remixHandler(event, context);
  } catch (error) {
    console.error("Error in Remix handler:", error);
    console.error("Event structure:", {
      path: event?.path,
      rawPath: event?.rawPath,
      rawUrl: event?.rawUrl,
      url: event?.url,
      headers: event?.headers ? Object.keys(event.headers) : "missing",
    });
    
    // Return a proper error response
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/plain",
      },
      body: `Internal Server Error: ${error.message}`,
    };
  }
};

// Export for Netlify Functions
export { handler as default };
