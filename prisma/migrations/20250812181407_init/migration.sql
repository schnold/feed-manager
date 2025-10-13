-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Shop" (
    "id" TEXT NOT NULL,
    "myshopifyDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feed" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "targetMarkets" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "publicPath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedMapping" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "ruleJson" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "FeedMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedFilter" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT,
    "group" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedSchedule" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FeedSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedRun" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeedRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedAsset" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" BYTEA,
    "contentText" TEXT,
    "isGzip" BOOLEAN NOT NULL DEFAULT true,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/xml; charset=utf-8',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_myshopifyDomain_key" ON "public"."Shop"("myshopifyDomain");

-- CreateIndex
CREATE INDEX "FeedAsset_feedId_version_idx" ON "public"."FeedAsset"("feedId", "version");

-- AddForeignKey
ALTER TABLE "public"."Feed" ADD CONSTRAINT "Feed_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedMapping" ADD CONSTRAINT "FeedMapping_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "public"."Feed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedFilter" ADD CONSTRAINT "FeedFilter_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "public"."Feed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedSchedule" ADD CONSTRAINT "FeedSchedule_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "public"."Feed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedRun" ADD CONSTRAINT "FeedRun_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "public"."Feed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedAsset" ADD CONSTRAINT "FeedAsset_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "public"."Feed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
