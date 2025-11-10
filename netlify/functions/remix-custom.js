import { createRequestHandler } from "@netlify/remix-adapter";
import * as build from "../../build/server/index.js";

// Polyfill Request to always have a signal (fixes "Cannot read properties of undefined (reading 'aborted')" error)
// This is necessary because the Netlify adapter creates Request objects without signals in serverless environments
const OriginalRequest = globalThis.Request;
globalThis.Request = class Request extends OriginalRequest {
  constructor(input, init) {
    // Ensure signal is always present
    const initWithSignal = {
      ...init,
      signal: init?.signal || new AbortController().signal,
    };
    super(input, initWithSignal);
  }
};

console.log("[remix-custom] Initializing custom Netlify handler...");
console.log("[remix-custom] Build exports:", Object.keys(build));
console.log("[remix-custom] Build.routes type:", typeof build.routes);
console.log("[remix-custom] Build.routes value:", build.routes ? "exists" : "undefined/null");

// Validate build structure
if (!build.routes) {
  console.error("[remix-custom] FATAL: build.routes is undefined!");
  console.error("[remix-custom] This indicates a Remix build configuration issue with v3_routeConfig");
  console.error("[remix-custom] Available build exports:", Object.keys(build).join(", "));
  throw new Error(
    "Remix build is missing routes export. " +
    "This may be due to a build configuration issue with v3_routeConfig. " +
    "Available exports: " + Object.keys(build).join(", ")
  );
}

// Create Remix request handler using Netlify adapter
// Use getLoadContext to ensure requests have signals for serverless environments
const remixHandler = createRequestHandler({ 
  build, 
  mode: process.env.NODE_ENV || "production",
  getLoadContext: (event, context) => {
    // Ensure the request has a signal property to prevent "aborted" errors
    // This is a workaround for serverless environments where requests might not have signals
    return {
      netlifyEvent: event,
      netlifyContext: context,
    };
  }
});

export const handler = async (event, context) => {
  console.log("[remix-custom] Handler invoked");
  console.log("[remix-custom] Event path:", event.rawPath || event.path);
  console.log("[remix-custom] HTTP method:", event.httpMethod || event.requestContext?.http?.method);

  try {
    // Ensure the event has all required properties for Netlify adapter
    if (!event.path) {
      event.path = event.rawPath || "/";
    }
    
    if (!event.rawUrl) {
      const protocol = event.headers?.['x-forwarded-proto'] || 'https';
      const host = event.headers?.host || event.headers?.['x-forwarded-host'] || 'localhost';
      const path = event.path || event.rawPath || "/";
      const query = event.rawQueryString || "";
      event.rawUrl = `${protocol}://${host}${path}${query ? `?${query}` : ""}`;
    }
    
    if (!event.url) {
      event.url = event.rawUrl;
    }
    
    if (!event.headers) {
      event.headers = {};
    }
    
    if (!event.queryStringParameters) {
      event.queryStringParameters = {};
    }
    
    if (!event.multiValueQueryStringParameters) {
      event.multiValueQueryStringParameters = {};
    }
    
    if (!event.rawQueryString) {
      const queryParams = event.queryStringParameters || {};
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
      event.rawQueryString = queryString;
    }
    
    if (!event.httpMethod) {
      event.httpMethod = "GET";
    }
    
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
    
    if (event.isBase64Encoded === undefined) {
      event.isBase64Encoded = false;
    }
    
    if (event.body === undefined) {
      event.body = null;
    }

    // Call Remix handler (Netlify adapter handles the conversion)
    console.log("[remix-custom] Calling Remix handler...");
    const response = await remixHandler(event, context);
    console.log("[remix-custom] Remix handler completed, status:", response?.statusCode || response?.status);

    return response;
  } catch (error) {
    console.error("[remix-custom] ERROR:", error);
    console.error("[remix-custom] Error name:", error?.name);
    console.error("[remix-custom] Error message:", error?.message);
    console.error("[remix-custom] Error stack:", error?.stack);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      body: `<!DOCTYPE html>
<html>
<head>
  <title>Error</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
    h1 { color: #d32f2f; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Internal Server Error</h1>
  <p><strong>Error:</strong> ${error?.message || "An unexpected error occurred"}</p>
  <details>
    <summary>Stack Trace</summary>
    <pre>${error?.stack || "No stack trace available"}</pre>
  </details>
  <p style="margin-top: 2rem;">
    <a href="/">Go back to home</a>
  </p>
</body>
</html>`,
    };
  }
};

export default handler;
