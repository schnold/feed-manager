-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifySubscriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingInterval" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopifySubscriptionId_key" ON "public"."Subscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_shopId_idx" ON "public"."Subscription"("shopId");

-- CreateIndex
CREATE INDEX "Subscription_shopifySubscriptionId_idx" ON "public"."Subscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "public"."Subscription"("status");

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
