import { createRequestHandler } from "@remix-run/node";
import * as build from "../../build/server/index.js";

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

// Create Remix request handler
const remixHandler = createRequestHandler({ build, mode: process.env.NODE_ENV || "production" });

// Convert Netlify event to Web Request
function createRequest(event) {
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const host = event.headers?.host || event.headers?.['x-forwarded-host'] || 'localhost';
  const path = event.rawPath || event.path || "/";
  const query = event.rawQueryString || "";
  const url = `${protocol}://${host}${path}${query ? `?${query}` : ""}`;

  console.log("[remix-custom] Creating request for URL:", url);

  const headers = new Headers();
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value !== undefined) {
        headers.append(key, value);
      }
    }
  }

  const init = {
    method: event.httpMethod || event.requestContext?.http?.method || "GET",
    headers,
  };

  if (event.body) {
    init.body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
  }

  return new Request(url, init);
}

// Convert Web Response to Netlify response
async function createNetlifyResponse(webResponse) {
  const headers = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body;
  const contentType = headers["content-type"] || "";

  // Handle different content types
  if (contentType.includes("text/") || contentType.includes("application/json") || contentType.includes("application/xml")) {
    body = await webResponse.text();
    return {
      statusCode: webResponse.status,
      headers,
      body,
    };
  } else if (contentType.includes("image/") || contentType.includes("application/octet-stream") || contentType.includes("application/pdf")) {
    // Binary content - base64 encode
    const buffer = await webResponse.arrayBuffer();
    body = Buffer.from(buffer).toString("base64");
    return {
      statusCode: webResponse.status,
      headers,
      body,
      isBase64Encoded: true,
    };
  } else {
    // Default to text for HTML and other text-based content
    body = await webResponse.text();
    return {
      statusCode: webResponse.status,
      headers,
      body,
    };
  }
}

export const handler = async (event, context) => {
  console.log("[remix-custom] Handler invoked");
  console.log("[remix-custom] Event path:", event.rawPath || event.path);
  console.log("[remix-custom] HTTP method:", event.httpMethod || event.requestContext?.http?.method);

  try {
    // Create Web Request from Netlify event
    const request = createRequest(event);
    console.log("[remix-custom] Request created successfully");

    // Call Remix handler
    console.log("[remix-custom] Calling Remix handler...");
    const webResponse = await remixHandler(request, {
      context: {
        netlifyEvent: event,
        netlifyContext: context,
      },
    });
    console.log("[remix-custom] Remix handler completed, status:", webResponse.status);

    // Convert Web Response to Netlify response
    const netlifyResponse = await createNetlifyResponse(webResponse);
    console.log("[remix-custom] Response converted successfully");

    return netlifyResponse;
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
