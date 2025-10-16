import { createRequestHandler } from "@remix-run/node";
import * as build from "../../build/server/index.js";

// Create the request handler
export const handler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV,
});

// Export for Netlify Functions
export { handler as default };
