import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
  useLoaderData,
} from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import "@shopify/polaris/build/esm/styles.css";

// Loader to provide API key for App Bridge meta tag
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* App Bridge API key meta tag - required for latest App Bridge CDN version */}
        {apiKey && (
          <meta name="shopify-api-key" content={apiKey} />
        )}
        {/* App Bridge script for Web Vitals tracking and admin performance monitoring */}
        {/* This is required for Built for Shopify status and Core Web Vitals tracking */}
        {/* The script must be loaded before any other scripts that depend on it */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  // Log the error for debugging
  console.error("Root ErrorBoundary caught error:", error);

  let errorMessage = "An unexpected error occurred";
  let errorDetails = "";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}`;
    errorDetails = error.data?.message || "";
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || "";
  }

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* App Bridge script for Web Vitals tracking and admin performance monitoring */}
        {/* Note: API key meta tag not included in error boundary as it's a client component */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
        <title>Error - Feed Manager</title>
        <Meta />
        <Links />
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1 style={{ color: "#d32f2f" }}>Application Error</h1>
        <p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>{errorMessage}</p>
        {errorDetails && (
          <details style={{ marginTop: "1rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Error Details</summary>
            <pre style={{
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: "4px",
              overflow: "auto",
              fontSize: "0.9rem"
            }}>
              {errorDetails}
            </pre>
          </details>
        )}
        <p style={{ marginTop: "2rem" }}>
          <a href="/" style={{ color: "#1976d2", textDecoration: "underline" }}>
            Go back to home
          </a>
        </p>
        <Scripts />
      </body>
    </html>
  );
}
