/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    // Shopify
    SHOPIFY_API_KEY?: string;
    SHOPIFY_API_SECRET?: string;
    SHOPIFY_APP_URL?: string;
    SCOPES?: string;
    SHOP_CUSTOM_DOMAIN?: string;

    // Database
    DATABASE_URL?: string;

    // Storage (S3-compatible / Cloudflare R2)
    S3_ENDPOINT?: string; // e.g. https://<accountid>.r2.cloudflarestorage.com or with /<bucket>
    S3_REGION?: string; // e.g. auto (R2) or us-east-1
    S3_ACCESS_KEY_ID?: string;
    S3_SECRET_ACCESS_KEY?: string;
    S3_BUCKET?: string;
    FEED_CDN_BASE?: string; // Public base URL for feeds (CDN/R2 public domain)

    // Queue
    REDIS_URL?: string;

    NODE_ENV?: "development" | "production" | "test";
  }
}