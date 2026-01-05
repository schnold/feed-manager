import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Define billing plan constants for type safety
export const PLAN_BASE_MONTHLY = 'BASE_MONTHLY';
export const PLAN_BASE_YEARLY = 'BASE_YEARLY';
export const PLAN_MID_MONTHLY = 'MID_MONTHLY';
export const PLAN_MID_YEARLY = 'MID_YEARLY';
export const PLAN_BASIC_MONTHLY = 'BASIC_MONTHLY';
export const PLAN_BASIC_YEARLY = 'BASIC_YEARLY';
export const PLAN_GROW_MONTHLY = 'GROW_MONTHLY';
export const PLAN_GROW_YEARLY = 'GROW_YEARLY';
export const PLAN_PRO_MONTHLY = 'PRO_MONTHLY';
export const PLAN_PRO_YEARLY = 'PRO_YEARLY';
export const PLAN_PREMIUM_MONTHLY = 'PREMIUM_MONTHLY';
export const PLAN_PREMIUM_YEARLY = 'PREMIUM_YEARLY';

console.log("[shopify.server] Initializing Shopify app configuration...");
console.log("[shopify.server] Environment check:", {
  SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL ? "set" : "missing",
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ? "set" : "missing",
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ? "set" : "missing",
  SCOPES: process.env.SCOPES ? "set" : "missing",
  DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
  NODE_ENV: process.env.NODE_ENV,
});

// Validate required environment variables
if (!process.env.SHOPIFY_APP_URL || process.env.SHOPIFY_APP_URL.trim() === "") {
  const error = new Error(
    "SHOPIFY_APP_URL environment variable is required. " +
    "Please set it in your Netlify environment variables to your site URL (e.g., https://your-site.netlify.app)"
  );
  console.error("[shopify.server] FATAL:", error.message);
  throw error;
}

if (!process.env.SHOPIFY_API_KEY) {
  const error = new Error("SHOPIFY_API_KEY environment variable is required");
  console.error("[shopify.server] FATAL:", error.message);
  throw error;
}

if (!process.env.SHOPIFY_API_SECRET) {
  const error = new Error("SHOPIFY_API_SECRET environment variable is required");
  console.error("[shopify.server] FATAL:", error.message);
  throw error;
}

let shopify;
try {
  console.log("[shopify.server] Creating shopifyApp instance...");
  shopify = shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.April25,
    scopes: process.env.SCOPES?.split(","),
    appUrl: process.env.SHOPIFY_APP_URL,
    authPathPrefix: "/auth",
    sessionStorage: new PrismaSessionStorage(prisma),
    distribution: AppDistribution.AppStore,
    // Explicitly set isEmbeddedApp to true for immediate authentication
    // This works with unstable_newEmbeddedAuthStrategy to enable:
    // - Shopify managed installation (no redirects)
    // - Token exchange (immediate authentication)
    // - Seamless sign-up using Shopify credentials
    isEmbeddedApp: true,
    future: {
      unstable_newEmbeddedAuthStrategy: true, // Enables token exchange and Shopify managed installation
      removeRest: true,
    },
    // Billing configuration - defines all available plans
    billing: {
      [PLAN_BASE_MONTHLY]: {
        lineItems: [
          {
            amount: 5.0,
            currencyCode: "EUR",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [PLAN_BASE_YEARLY]: {
        lineItems: [
          {
            amount: 45.0,
            currencyCode: "EUR",
            interval: BillingInterval.Annual,
          },
        ],
      },
      [PLAN_MID_MONTHLY]: {
        lineItems: [
          {
            amount: 14.0,
            currencyCode: "EUR",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [PLAN_MID_YEARLY]: {
        lineItems: [
          {
            amount: 126.0,
            currencyCode: "EUR",
            interval: BillingInterval.Annual,
          },
        ],
      },
      [PLAN_BASIC_MONTHLY]: {
        lineItems: [
          {
            amount: 21.0,
            currencyCode: "EUR",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [PLAN_BASIC_YEARLY]: {
        lineItems: [
          {
            amount: 189.0,
            currencyCode: "EUR",
            interval: BillingInterval.Annual,
          },
        ],
      },
      [PLAN_GROW_MONTHLY]: {
        lineItems: [
          {
            amount: 27.0,
            currencyCode: "EUR",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [PLAN_GROW_YEARLY]: {
        lineItems: [
          {
            amount: 243.0,
            currencyCode: "EUR",
            interval: BillingInterval.Annual,
          },
        ],
      },
      [PLAN_PRO_MONTHLY]: {
        lineItems: [
          {
            amount: 59.0,
            currencyCode: "EUR",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [PLAN_PRO_YEARLY]: {
        lineItems: [
          {
            amount: 531.0,
            currencyCode: "EUR",
            interval: BillingInterval.Annual,
          },
        ],
      },
      [PLAN_PREMIUM_MONTHLY]: {
        lineItems: [
          {
            amount: 134.0,
            currencyCode: "EUR",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [PLAN_PREMIUM_YEARLY]: {
        lineItems: [
          {
            amount: 1206.0,
            currencyCode: "EUR",
            interval: BillingInterval.Annual,
          },
        ],
      },
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  });
  console.log("[shopify.server] Shopify app initialized successfully");
} catch (error) {
  console.error("[shopify.server] FATAL: Failed to initialize shopifyApp:", error);
  if (error instanceof Error) {
    console.error("[shopify.server] Error message:", error.message);
    console.error("[shopify.server] Error stack:", error.stack);
  }
  throw error;
}

export default shopify;
export const apiVersion = ApiVersion.April25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
