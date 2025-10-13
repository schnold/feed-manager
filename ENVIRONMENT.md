## Environment Variables

Copy these into a `.env` file (root or `web/feed-manager/.env` depending on your process) and set the values.

### Shopify
- `SHOPIFY_API_KEY`: Your app API key
- `SHOPIFY_API_SECRET`: Your app API secret
- `SHOPIFY_APP_URL`: Public base URL of the app (during dev, the tunnel URL)
- `SCOPES`: `read_products,read_product_listings,read_locales,read_markets`
- `SHOP_CUSTOM_DOMAIN` (optional): Limit to a specific shop domain

### Database (Neon Postgres)
- `DATABASE_URL`: `postgres://USER:PASSWORD@HOST/DBNAME?sslmode=require`

### Storage (S3 / Cloudflare R2)
- `S3_ENDPOINT`: For R2 use your account endpoint, e.g. `https://<accountid>.r2.cloudflarestorage.com`. You may optionally include the bucket suffix (e.g. `...cloudflarestorage.com/<bucket>`). If included, the app will infer `S3_BUCKET` from this value when `S3_BUCKET` is not set.
- `S3_REGION`: For R2 use `auto`; for AWS S3 use your region (e.g., `us-east-1`).
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`: Bucket name (e.g., `feed-manager`). If omitted and your `S3_ENDPOINT` includes a `/bucket` suffix, it will be inferred.
- `FEED_CDN_BASE` (optional): If you front R2 with a custom domain or CDN, set it here (e.g., `https://feeds.example.com`).

### Queue (optional)
- `REDIS_URL`: `redis://localhost:6379`

### Node
- `NODE_ENV`: `development` | `production`


