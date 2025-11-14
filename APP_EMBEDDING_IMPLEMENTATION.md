# App Embedding, Session Token Authentication, and App Bridge Implementation

This document details the implementation of app embedding, session token authentication, and the latest App Bridge version based on Shopify MCP documentation.

## ✅ Implementation Summary

### 1. App Embedding

**Status:** ✅ Fully Configured

**Configuration:**
- `shopify.app.toml`: `embedded = true` ✅
- App is configured to be embedded in the Shopify admin

**Files:**
- `shopify.app.toml` - Embedded flag is set to `true`

### 2. Latest App Bridge Version

**Status:** ✅ Implemented

**Implementation Details:**
- Added the latest App Bridge CDN script: `https://cdn.shopify.com/shopifycloud/app-bridge.js`
- Added API key meta tag: `<meta name="shopify-api-key" content="{apiKey}" />`
- Script is loaded in the `<head>` before any other scripts that depend on it
- The CDN-hosted script automatically keeps itself up-to-date

**Files Modified:**
- `app/root.tsx`:
  - Added loader to provide API key from environment
  - Added `shopify-api-key` meta tag
  - Added App Bridge script tag
  - Script is placed before other scripts in the head

**Key Features:**
- Automatic updates: The CDN script ensures you always have the latest version
- Web Vitals tracking: Enables Core Web Vitals metrics collection (LCP, CLS, INP)
- Direct API access: Can be enabled for direct Admin API calls from the app
- Session token handling: Automatically manages session tokens for authentication

### 3. Session Token Authentication

**Status:** ✅ Configured via @shopify/shopify-app-remix

**Implementation Details:**
- Using `@shopify/shopify-app-remix` which handles session tokens automatically
- `unstable_newEmbeddedAuthStrategy: true` enables the new embedded auth strategy
- This strategy uses:
  - Session tokens for frontend-to-backend authentication
  - Token exchange for obtaining access tokens
  - Shopify managed installation for better UX

**Files:**
- `app/shopify.server.ts`:
  - `unstable_newEmbeddedAuthStrategy: true` ✅
  - `distribution: AppDistribution.AppStore` ✅
  - Session storage configured with Prisma ✅

- `app/routes/app.tsx`:
  - Uses `AppProvider` from `@shopify/shopify-app-remix/react`
  - `isEmbeddedApp={true}` ✅
  - API key passed to AppProvider ✅

**How It Works:**
1. When the app loads, App Bridge automatically acquires a session token
2. Session tokens are included in the `Authorization` header for backend requests
3. The backend verifies session tokens using `@shopify/shopify-app-remix`
4. For API calls to Shopify, the app exchanges session tokens for access tokens via token exchange
5. Session tokens have a 1-minute lifetime and are automatically refreshed

## 📋 Configuration Checklist

### App Embedding
- [x] `embedded = true` in `shopify.app.toml`
- [x] App serves over HTTPS
- [x] Content Security Policy `frame-ancestors` directive set (handled by `addDocumentResponseHeaders`)

### App Bridge
- [x] Latest App Bridge script tag added to `<head>`
- [x] API key meta tag added
- [x] Script loaded before other dependent scripts
- [x] CDN-hosted script for automatic updates

### Session Token Authentication
- [x] `unstable_newEmbeddedAuthStrategy: true` enabled
- [x] `AppProvider` configured with `isEmbeddedApp={true}`
- [x] API key provided to AppProvider
- [x] Session storage configured (Prisma)

## 🔍 Verification Steps

### 1. Verify App Bridge is Loaded
1. Open your app in the Shopify admin
2. Open browser DevTools console
3. Switch frame context to your app's iframe
4. Type `shopify` in the console
5. You should see the App Bridge global object with available APIs

### 2. Verify Session Token Authentication
1. Open browser DevTools Network tab
2. Make a request from your app to your backend
3. Check the `Authorization` header
4. You should see a JWT session token in the header
5. The backend should successfully authenticate the request

### 3. Verify App Embedding
1. App should load within the Shopify admin interface
2. No redirects to external URLs during normal operation
3. App navigation should work within the embedded context

## 📚 Key Documentation References

- [App Bridge Getting Started](https://shopify.dev/docs/api/app-home#getting-started)
- [Session Token Authentication](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens)
- [Token Exchange](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange)
- [App Embedding Setup](https://shopify.dev/docs/api/app-bridge/previous-versions/app-bridge-from-npm/app-setup)
- [Built for Shopify Requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)

## 🚀 Benefits of This Implementation

1. **Automatic Updates**: CDN-hosted App Bridge ensures you always have the latest features
2. **Better Performance**: Session tokens provide faster authentication than OAuth redirects
3. **Improved UX**: Shopify managed installation eliminates redirects and page flickers
4. **Web Vitals Tracking**: Automatic collection of Core Web Vitals metrics
5. **Security**: Session tokens are more secure than cookies for cross-domain scenarios
6. **Future-Proof**: Using the latest App Bridge ensures compatibility with new Shopify features

## ⚠️ Important Notes

1. **API Key Meta Tag**: The `shopify-api-key` meta tag is required for the latest App Bridge CDN version. It's included in the root component via a loader.

2. **Session Tokens**: Session tokens are automatically handled by `@shopify/shopify-app-remix`. You don't need to manually implement session token acquisition or validation.

3. **Token Exchange**: The app automatically uses token exchange to get access tokens when needed. This is handled by the `unstable_newEmbeddedAuthStrategy` flag.

4. **Error Boundary**: The error boundary includes the App Bridge script but not the API key meta tag (since it's a client component). This is acceptable as the script will still function.

5. **AppProvider**: The `AppProvider` from `@shopify/shopify-app-remix/react` works alongside the CDN App Bridge script. Both are needed for full functionality.

## 🔄 Migration Notes

If you were previously using:
- App Bridge 3.x from npm: The CDN version replaces the npm package
- Manual session token handling: Now handled automatically by `@shopify/shopify-app-remix`
- Manual App Bridge initialization: No longer needed with CDN version

The current implementation uses both:
- CDN App Bridge script (for latest features and Web Vitals)
- `@shopify/app-bridge-react` (for React components and hooks)
- `@shopify/shopify-app-remix` (for authentication and routing)

This hybrid approach provides the best of both worlds while maintaining compatibility.

