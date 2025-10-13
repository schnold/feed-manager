# Production Deployment Guide

This guide covers deploying the Shopify Feed Manager app to production.

## Prerequisites

- Node.js 18+ runtime
- PostgreSQL database (e.g., Neon, Railway, Supabase)
- Redis instance (for BullMQ queue)
- S3-compatible storage (AWS S3, Cloudflare R2, etc.)
- Domain and SSL certificate for the app

## Environment Setup

### Required Environment Variables

```bash
# Shopify App Configuration
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-app-domain.com
SCOPES=read_products,read_product_listings,read_locales,read_markets

# Database (PostgreSQL)
DATABASE_URL=postgres://user:password@host:port/dbname?sslmode=require

# Storage (S3/R2)
S3_ENDPOINT=https://your-s3-endpoint.com
S3_REGION=us-east-1  # or 'auto' for Cloudflare R2
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=your-feed-bucket
FEED_CDN_BASE=https://your-cdn-domain.com/feeds  # Optional CDN

# Queue (Redis)
REDIS_URL=redis://user:password@host:port

# Runtime
NODE_ENV=production
```

## Database Migration

For production, switch from SQLite back to PostgreSQL:

1. Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. Update the schema for PostgreSQL compatibility:
```prisma
model Session {
  // ... other fields
  userId        BigInt?  // Change back from String to BigInt
  // ... other fields
}

model Feed {
  // ... other fields
  targetMarkets String[]  // Change back from String to String[]
  // ... other fields
}
```

3. Generate and run migrations:
```bash
npx prisma migrate deploy
npx prisma generate
```

## Deployment Platforms

### Option 1: Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically detect and deploy the Remix app
4. Add Redis and PostgreSQL services from Railway marketplace

### Option 2: Render

1. Connect repository to Render
2. Set up web service with these settings:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
3. Add PostgreSQL and Redis services
4. Configure environment variables

### Option 3: DigitalOcean App Platform

1. Create new app from GitHub repository
2. Configure build settings:
   - Build Command: `npm ci && npm run build`
   - Run Command: `npm start`
3. Add managed PostgreSQL and Redis
4. Set environment variables

### Option 4: Self-Hosted (Docker)

Create `Dockerfile`:
```dockerfile
FROM node:18-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

And `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:pass@postgres:5432/feeddb
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
  
  worker:
    build: .
    command: npm run worker:dev
    environment:
      DATABASE_URL: postgres://user:pass@postgres:5432/feeddb
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
  
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: feeddb
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Worker Process

The app requires a separate worker process to handle feed generation:

### For Platform Deployments

Most platforms support background workers. Configure a separate service:

**Railway/Render/DigitalOcean:**
- Add a Background Worker service
- Build Command: `npm install`
- Start Command: `npm run worker:dev`
- Use same environment variables as main app

### Process Management

For self-hosted deployments, use PM2:

```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'feed-manager-web',
    script: 'npm start',
    instances: 1,
    env: {
      NODE_ENV: 'production'
    }
  }, {
    name: 'feed-manager-worker',
    script: 'npm run worker:dev',
    instances: 1,
    env: {
      NODE_ENV: 'production'
    }
  }]
}
```

Start with: `pm2 start ecosystem.config.js`

## Storage Configuration

### AWS S3

```bash
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=my-shopify-feeds
FEED_CDN_BASE=https://d1234567890.cloudfront.net/feeds
```

### Cloudflare R2

```bash
S3_ENDPOINT=https://1234567890abcdef.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=shopify-feeds
FEED_CDN_BASE=https://feeds.yourdomain.com
```

## Security Considerations

1. **Environment Variables**: Use platform-specific secret management
2. **Database**: Enable SSL connections (`sslmode=require`)
3. **Redis**: Use AUTH and SSL for external Redis instances
4. **Storage**: Configure CORS for your domain
5. **Rate Limiting**: Consider adding rate limiting middleware
6. **Logging**: Set up structured logging for monitoring

## Monitoring

### Health Checks

Add health check endpoint in `app/routes/health.tsx`:
```typescript
export async function loader() {
  // Check database connection
  // Check Redis connection
  // Check S3 connectivity
  return new Response("OK", { status: 200 })
}
```

### Logging

Use structured logging:
```bash
npm install winston
```

### Metrics

Consider adding metrics with:
```bash
npm install @prometheus-io/client
```

## Shopify Partner Setup

1. Create Shopify Partner account
2. Create new app in Partner Dashboard
3. Configure app URLs:
   - App URL: `https://yourdomain.com`
   - Allowed redirection URL(s): `https://yourdomain.com/auth/shopify/callback`
4. Set required scopes: `read_products,read_product_listings,read_locales,read_markets`
5. Configure webhooks endpoints:
   - Products create: `https://yourdomain.com/webhooks/products/create`
   - Products update: `https://yourdomain.com/webhooks/products/update`
   - Products delete: `https://yourdomain.com/webhooks/products/delete`

## Performance Optimization

1. **Database**: Add indexes for frequently queried fields
2. **Redis**: Configure appropriate memory settings
3. **Worker Concurrency**: Adjust based on available resources
4. **CDN**: Use CloudFront or similar for feed delivery
5. **Caching**: Add Redis caching for frequently accessed data

## Backup Strategy

1. **Database**: Regular automated backups
2. **File Storage**: S3 versioning and cross-region replication
3. **Configuration**: Store environment variables in secure vault

## Scaling Considerations

- **Horizontal Scaling**: Run multiple worker instances
- **Database**: Consider read replicas for high traffic
- **Queue**: Use Redis Cluster for high throughput
- **Storage**: Monitor bandwidth and request costs

## Troubleshooting

### Common Issues

1. **Database Connection**: Check SSL settings and firewall rules
2. **Redis Connection**: Verify AUTH and network access
3. **S3 Upload Failures**: Check credentials and bucket permissions
4. **Feed Generation Errors**: Monitor worker logs
5. **Webhook Timeouts**: Ensure fast response times

### Log Analysis

Monitor these key metrics:
- Feed generation success/failure rates
- API response times
- Database query performance
- Queue processing times
- Storage upload success rates

## Post-Deployment Checklist

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] Worker process running
- [ ] Webhooks configured in Shopify
- [ ] Health checks passing
- [ ] Logging and monitoring active
- [ ] Backup strategy implemented
- [ ] SSL certificates valid
- [ ] Performance testing completed