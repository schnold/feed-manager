-- Run this query to check if subscriptions are properly connected to shops
-- This will show all subscriptions with their associated shop information

SELECT
    s.id as subscription_id,
    s."shopifySubscriptionId",
    s.name as subscription_name,
    s."planId",
    s.status,
    s.price,
    s."billingInterval",
    s."shopId",
    sh."myshopifyDomain" as shop_domain,
    sh.plan as shop_plan,
    sh.features as shop_features
FROM "Subscription" s
LEFT JOIN "Shop" sh ON s."shopId" = sh.id
ORDER BY s."createdAt" DESC
LIMIT 20;

-- Check for orphaned subscriptions (subscriptions without a shop)
SELECT
    COUNT(*) as orphaned_count,
    s.id,
    s.name,
    s."shopId"
FROM "Subscription" s
LEFT JOIN "Shop" sh ON s."shopId" = sh.id
WHERE sh.id IS NULL;

-- Show shop with their subscription count
SELECT
    sh.id,
    sh."myshopifyDomain",
    sh.plan,
    sh.features,
    COUNT(s.id) as subscription_count,
    COUNT(CASE WHEN s.status = 'ACTIVE' THEN 1 END) as active_subscription_count
FROM "Shop" sh
LEFT JOIN "Subscription" s ON s."shopId" = sh.id
GROUP BY sh.id, sh."myshopifyDomain", sh.plan, sh.features
ORDER BY sh."createdAt" DESC;
