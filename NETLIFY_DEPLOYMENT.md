# Netlify Deployment Guide for Shopify Feed Manager

This guide covers deploying your Shopify Feed Manager app to Netlify, including all necessary configurations and considerations.

## Prerequisites

- Netlify account
- PostgreSQL database (Neon, Supabase, or Railway)
- Redis instance (Upstash, Redis Cloud, or Railway)
- S3-compatible storage (AWS S3, Cloudflare R2, etc.)
- Shopify Partner account

## 1. Netlify Configuration

### Build Settings

The `netlify.toml` file has been created with the following configuration:

- **Build Command**: `npm run build`
- **Publish Directory**: `build/client`
- **Node Version**: 18
- **Functions Directory**: `netlify/functions`

### Environment Variables

Set these environment variables in your Netlify dashboard:

```bash
# Shopify App Configuration
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-netlify-app.netlify.app
SCOPES=write_products,read_products,read_product_listings,read_locales,read_markets

# Database (PostgreSQL)
DATABASE_URL=postgres://user:password@host:port/dbname?sslmode=require

# Storage (S3/R2)
S3_ENDPOINT=https://your-s3-endpoint.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=your-feed-bucket
FEED_CDN_BASE=https://your-cdn-domain.com/feeds

# Queue (Redis)
REDIS_URL=redis://user:password@host:port

# Runtime
NODE_ENV=production
```

## 2. Database Setup

### PostgreSQL Configuration

1. **Create a PostgreSQL database** (recommended providers):
   - [Neon](https://neon.tech/) - Serverless PostgreSQL
   - [Supabase](https://supabase.com/) - PostgreSQL with additional features
   - [Railway](https://railway.app/) - Simple PostgreSQL hosting

2. **Update Prisma Schema** for PostgreSQL:

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Session {
  id        String   @id @default(cuid())
  shop      String
  state     String
  isOnline  Boolean  @default(false)
  scope     String?
  expires   DateTime?
  accessToken String
  userId    BigInt?
  firstName String?
  lastName  String?
  email     String?
  locale    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("sessions")
}

model Feed {
  id            String   @id @default(cuid())
  name          String
  description   String?
  shopDomain    String
  targetMarkets String[]
  language      String   @default("en")
  locationId    String?
  filters       Json?
  mapping       Json?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@map("feeds")
}
```

3. **Run migrations**:
```bash
npx prisma migrate deploy
npx prisma generate
```

## 3. Redis Setup

### Redis Configuration

1. **Create a Redis instance** (recommended providers):
   - [Upstash](https://upstash.com/) - Serverless Redis
   - [Redis Cloud](https://redis.com/redis-enterprise-cloud/overview/) - Managed Redis
   - [Railway](https://railway.app/) - Simple Redis hosting

2. **Configure Redis connection** in your environment variables

## 4. Storage Setup

### S3-Compatible Storage

1. **Create storage bucket**:
   - AWS S3
   - Cloudflare R2
   - DigitalOcean Spaces

2. **Configure CORS** for your domain:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://your-netlify-app.netlify.app"],
    "ExposeHeaders": []
  }
]
```

## 5. Worker Process

### Netlify Functions for Background Tasks

The worker process is handled through Netlify Functions:

1. **Feed Generation**: `netlify/functions/worker.js`
2. **Webhook Processing**: Handled by the main Remix function
3. **Scheduled Tasks**: Use Netlify's scheduled functions

### Scheduled Functions

Create `netlify/functions/scheduled.js`:

```javascript
export const handler = async (event, context) => {
  // Run scheduled tasks like feed regeneration
  const { generateAllFeeds } = await import('../../app/services/feeds/generate-google-xml.server.js');
  
  try {
    await generateAllFeeds();
    return { statusCode: 200, body: 'Scheduled task completed' };
  } catch (error) {
    console.error('Scheduled task failed:', error);
    return { statusCode: 500, body: 'Scheduled task failed' };
  }
};
```

## 6. Shopify App Configuration

### Update App URLs

1. **Update `shopify.app.toml`**:
```toml
application_url = "https://your-netlify-app.netlify.app"

[auth]
redirect_urls = [
  "https://your-netlify-app.netlify.app/auth/callback",
  "https://your-netlify-app.netlify.app/auth/shopify/callback"
]
```

2. **Deploy app configuration**:
```bash
shopify app deploy
```

### Webhook Configuration

Configure webhooks in your Shopify Partner Dashboard:

- **Products create**: `https://your-netlify-app.netlify.app/webhooks/products/create`
- **Products update**: `https://your-netlify-app.netlify.app/webhooks/products/update`
- **Products delete**: `https://your-netlify-app.netlify.app/webhooks/products/delete`
- **App uninstalled**: `https://your-netlify-app.netlify.app/webhooks/app/uninstalled`

## 7. Deployment Steps

### Initial Deployment

1. **Connect Repository**:
   - Go to Netlify dashboard
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository

2. **Configure Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `build/client`
   - Node version: 18

3. **Set Environment Variables**:
   - Add all required environment variables in Netlify dashboard
   - Mark sensitive variables as "sensitive"

4. **Deploy**:
   - Netlify will automatically build and deploy your app
   - Monitor the build logs for any issues

### Database Migration

1. **Run migrations** in Netlify Functions:
   - Create a one-time migration function
   - Or run migrations locally with production DATABASE_URL

2. **Verify database connection**:
   - Check that your app can connect to PostgreSQL
   - Verify tables are created correctly

## 8. Testing

### Health Checks

1. **Test app functionality**:
   - Visit your Netlify app URL
   - Test Shopify app installation
   - Verify feed generation works

2. **Test webhooks**:
   - Use Shopify CLI to trigger test webhooks
   - Verify webhook processing works

3. **Test background tasks**:
   - Trigger feed generation
   - Verify worker functions execute

## 9. Monitoring and Maintenance

### Logs

- **Netlify Functions logs**: Available in Netlify dashboard
- **Application logs**: Use console.log for debugging
- **Error tracking**: Consider adding Sentry or similar

### Performance

- **Function timeout**: Netlify Functions have a 10-second timeout
- **Memory limits**: 1024MB for Pro plans
- **Concurrent executions**: Monitor usage

### Scaling

- **Database connections**: Use connection pooling
- **Redis connections**: Monitor connection limits
- **Function concurrency**: Adjust based on usage

## 10. Troubleshooting

### Common Issues

1. **Build failures**:
   - Check Node.js version compatibility
   - Verify all dependencies are installed
   - Check for TypeScript errors

2. **Database connection issues**:
   - Verify DATABASE_URL format
   - Check SSL requirements
   - Verify network access

3. **Redis connection issues**:
   - Verify REDIS_URL format
   - Check authentication
   - Verify network access

4. **Function timeouts**:
   - Optimize database queries
   - Use background processing for long tasks
   - Consider breaking large operations into smaller chunks

### Debug Commands

```bash
# Test locally with Netlify CLI
npm install -g netlify-cli
netlify dev

# Check function logs
netlify functions:list
netlify functions:invoke worker

# Test database connection
npx prisma db push
```

## 11. Security Considerations

1. **Environment Variables**: Never commit sensitive data
2. **Database Security**: Use SSL connections
3. **Redis Security**: Use authentication
4. **CORS Configuration**: Restrict to your domains
5. **Rate Limiting**: Consider adding rate limiting
6. **Input Validation**: Validate all inputs

## 12. Cost Optimization

1. **Function Usage**: Monitor execution time and frequency
2. **Database**: Use connection pooling
3. **Redis**: Monitor memory usage
4. **Storage**: Optimize file sizes and caching

## Next Steps

1. Deploy to Netlify
2. Configure all environment variables
3. Test the complete functionality
4. Set up monitoring and alerts
5. Configure custom domain (optional)
6. Set up CI/CD for automatic deployments

For additional support, refer to:
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Remix on Netlify](https://remix.run/docs/en/main/guides/netlify)
- [Shopify App Development](https://shopify.dev/docs/apps)
