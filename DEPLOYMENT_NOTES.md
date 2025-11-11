# Deployment Notes

## Prisma Connection Pool Configuration

If you're experiencing "Timed out fetching a new connection from the connection pool" errors in production (serverless environments like Netlify), you need to configure connection pool settings in your `DATABASE_URL`.

### For PostgreSQL databases:

Add connection pool parameters to your `DATABASE_URL` connection string:

```
postgresql://user:password@host:port/database?connection_limit=20&pool_timeout=30
```

**Parameters:**
- `connection_limit`: Maximum number of connections in the pool (recommended: 20-50 for serverless)
- `pool_timeout`: Timeout in seconds for getting a connection from the pool (recommended: 30-60)

### Example:

If your current `DATABASE_URL` is:
```
postgresql://user:pass@host:5432/mydb
```

Update it to:
```
postgresql://user:pass@host:5432/mydb?connection_limit=20&pool_timeout=30
```

### Where to configure:

1. **Netlify**: Go to Site settings → Environment variables → Edit `DATABASE_URL`
2. **Other platforms**: Update the `DATABASE_URL` environment variable in your deployment settings

### Why this is needed:

Serverless environments (like Netlify Functions) can have many concurrent requests. The default Prisma connection pool (limit: 5, timeout: 10s) is too small for these environments, causing connection timeouts when multiple requests try to access the database simultaneously.

## Embedded App Configuration

The app is configured as an embedded app (`embedded = true` in `shopify.app.toml`). The `addDocumentResponseHeaders` function in `entry.server.tsx` sets the proper Content-Security-Policy headers required for iframe embedding.

If you see 404 errors or `inject.js` errors related to `getElementById`, ensure:
1. `addDocumentResponseHeaders` is enabled in `entry.server.tsx` (it is by default)
2. The app is configured as embedded in both `shopify.app.toml` and the Partner Dashboard
3. The `SHOPIFY_APP_URL` environment variable matches your deployment URL

