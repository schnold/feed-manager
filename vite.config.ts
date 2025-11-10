import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the remix server. The CLI will eventually
// stop passing in HOST, so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

// Safely parse the SHOPIFY_APP_URL, defaulting to localhost if not set or invalid
let host: string;
try {
  const appUrl = process.env.SHOPIFY_APP_URL?.trim();
  if (appUrl && appUrl !== "") {
    host = new URL(appUrl).hostname;
  } else {
    host = "localhost";
  }
} catch (error) {
  console.warn("Invalid SHOPIFY_APP_URL, falling back to localhost:", process.env.SHOPIFY_APP_URL);
  host = "localhost";
}

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*", "**/*.tmp.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: false,
      },
      // Optimize for Netlify Functions
      serverBuildFile: "index.js",
      serverModuleFormat: "esm",
      serverPlatform: "node",
      serverMinify: process.env.NODE_ENV === "production",
      serverDependenciesToBundle: [
        "@netlify/remix-adapter",
        "@shopify/shopify-app-remix",
        "@shopify/shopify-app-session-storage-prisma",
        "@prisma/client",
        "bullmq",
        "ioredis",
        "xmlbuilder2",
      ],
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
}) satisfies UserConfig;
