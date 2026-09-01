-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "languageCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "referralSource" TEXT,
    "openCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'telegram_stars',
    "externalPaymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XTR',
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "App_slug_key" ON "App"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "AppUser_userId_idx" ON "AppUser"("userId");

-- CreateIndex
CREATE INDEX "AppUser_appId_lastSeenAt_idx" ON "AppUser"("appId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_appId_userId_key" ON "AppUser"("appId", "userId");

-- CreateIndex
CREATE INDEX "UsageEvent_appId_userId_feature_createdAt_idx" ON "UsageEvent"("appId", "userId", "feature", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_appId_userId_feature_periodKey_key" ON "UsageCounter"("appId", "userId", "feature", "periodKey");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_appId_name_createdAt_idx" ON "AnalyticsEvent"("appId", "name", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_appId_userId_createdAt_idx" ON "AnalyticsEvent"("appId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Referral_appId_referrerId_idx" ON "Referral"("appId", "referrerId");

-- CreateIndex
CREATE INDEX "Referral_appId_code_idx" ON "Referral"("appId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_appId_refereeId_key" ON "Referral"("appId", "refereeId");

-- CreateIndex
CREATE INDEX "Purchase_appId_userId_status_idx" ON "Purchase"("appId", "userId", "status");

-- CreateIndex
CREATE INDEX "Purchase_appId_createdAt_idx" ON "Purchase"("appId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_provider_externalPaymentId_key" ON "Purchase"("provider", "externalPaymentId");

-- CreateIndex
CREATE INDEX "Translation_appId_userId_createdAt_idx" ON "Translation"("appId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
