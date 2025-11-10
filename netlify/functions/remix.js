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

// Wrap handler to ensure request URL is valid and handle errors properly
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
    
    // Ensure httpMethod exists (required by adapter)
    if (!event.httpMethod) {
      event.httpMethod = "GET";
    }
    
    // Ensure requestContext exists (required by adapter)
    if (!event.requestContext) {
      event.requestContext = {
        http: {
          method: event.httpMethod || "GET",
          path: event.path || "/",
          protocol: "HTTP/1.1",
          sourceIp: event.headers?.['x-forwarded-for']?.split(',')[0] || "127.0.0.1",
          userAgent: event.headers?.['user-agent'] || "",
        },
      };
    }
    
    // Ensure isBase64Encoded exists (defaults to false)
    if (event.isBase64Encoded === undefined) {
      event.isBase64Encoded = false;
    }
    
    // Ensure body exists (can be null or string)
    if (event.body === undefined) {
      event.body = null;
    }
    
    // Call the handler and catch any errors
    const response = await remixHandler(event, context);
    return response;
  } catch (error) {
    // Handle errors more gracefully
    console.error("Error in Remix handler:", error);
    console.error("Error stack:", error.stack);
    console.error("Event structure:", {
      path: event?.path,
      rawPath: event?.rawPath,
      rawUrl: event?.rawUrl,
      url: event?.url,
      headers: event?.headers ? Object.keys(event.headers) : "missing",
      requestContext: event?.requestContext ? "exists" : "missing",
    });
    
    // Return a proper error response that matches Netlify's expected format
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      body: `<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Internal Server Error</h1><p>${error.message || "An error occurred"}</p></body></html>`,
    };
  }
};

// Export for Netlify Functions
export { handler as default };
