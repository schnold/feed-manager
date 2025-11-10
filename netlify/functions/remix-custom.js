// ES Module function for Netlify
// Lazy load to avoid top-level await issues with esbuild
let nodeHandler;
let initialized = false;

async function initialize() {
  if (initialized) return;
  
  console.log("[remix-custom] Initializing...");
  const build = await import("../../build/server/index.js");
  const { createRequestHandler } = await import("@remix-run/node");
  
  nodeHandler = createRequestHandler({ 
    build, 
    mode: process.env.NODE_ENV || "production"
  });
  
  initialized = true;
  console.log("[remix-custom] Initialized successfully");
}

function createRequestFromEvent(event) {
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const host = event.headers?.host || event.headers?.['x-forwarded-host'] || 'localhost';
  const path = event.rawPath || event.path || "/";
  const query = event.rawQueryString || "";
  const url = `${protocol}://${host}${path}${query ? `?${query}` : ""}`;

  const headers = new Headers();
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value !== undefined) {
        headers.append(key, value);
      }
    }
  }

  const controller = new AbortController();
  return new Request(url, {
    method: event.httpMethod || "GET",
    headers,
    signal: controller.signal,
    body: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : undefined,
  });
}

async function createNetlifyResponse(webResponse) {
  const headers = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const contentType = headers["content-type"] || "";
  let body;

  if (contentType.includes("image/") || contentType.includes("application/octet-stream")) {
    const buffer = await webResponse.arrayBuffer();
    body = Buffer.from(buffer).toString("base64");
    return {
      statusCode: webResponse.status,
      headers,
      body,
      isBase64Encoded: true,
    };
  }

  body = await webResponse.text();
  return {
    statusCode: webResponse.status,
    headers,
    body,
  };
}

export const handler = async (event, context) => {
  try {
    // Initialize on first request
    await initialize();
    
    const request = createRequestFromEvent(event);
    const webResponse = await nodeHandler(request, {
      context: { netlifyEvent: event, netlifyContext: context },
    });
    return await createNetlifyResponse(webResponse);
  } catch (error) {
    console.error("[remix-custom] ERROR:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<!DOCTYPE html><html><body><h1>Error</h1><p>${error?.message || "Server error"}</p></body></html>`,
    };
  }
};

export default handler;

