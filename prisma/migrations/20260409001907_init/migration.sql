-- CreateEnum
CREATE TYPE "public"."TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ProofSendStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'APPROVER');

-- CreateEnum
CREATE TYPE "public"."MarketType" AS ENUM ('MARKET', 'ADDITIONAL_MARKET');

-- CreateTable
CREATE TABLE "public"."EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "html" TEXT NOT NULL,
    "status" "public"."TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "markets" JSONB,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TemplateMaster" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AreaMaster" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketMaster" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."MarketType" NOT NULL DEFAULT 'MARKET',
    "areaId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SourceCampaignMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requestId" TEXT,
    "previewLink" TEXT,
    "templateMasterId" TEXT,
    "areaMasterId" TEXT,
    "marketMasterId" TEXT,
    "additionalMarkets" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCampaignMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "html" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProofSend" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "provider" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "public"."ProofSendStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_slug_key" ON "public"."EmailTemplate"("slug");

-- CreateIndex
CREATE INDEX "EmailTemplate_status_idx" ON "public"."EmailTemplate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "public"."User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "public"."PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "public"."PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateMaster_code_key" ON "public"."TemplateMaster"("code");

-- CreateIndex
CREATE INDEX "TemplateMaster_isActive_sortOrder_idx" ON "public"."TemplateMaster"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AreaMaster_code_key" ON "public"."AreaMaster"("code");

-- CreateIndex
CREATE INDEX "AreaMaster_isActive_name_idx" ON "public"."AreaMaster"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MarketMaster_code_key" ON "public"."MarketMaster"("code");

-- CreateIndex
CREATE INDEX "MarketMaster_isActive_name_idx" ON "public"."MarketMaster"("isActive", "name");

-- CreateIndex
CREATE INDEX "MarketMaster_type_idx" ON "public"."MarketMaster"("type");

-- CreateIndex
CREATE INDEX "MarketMaster_areaId_idx" ON "public"."MarketMaster"("areaId");

-- CreateIndex
CREATE INDEX "SourceCampaignMaster_isActive_name_idx" ON "public"."SourceCampaignMaster"("isActive", "name");

-- CreateIndex
CREATE INDEX "SourceCampaignMaster_templateMasterId_idx" ON "public"."SourceCampaignMaster"("templateMasterId");

-- CreateIndex
CREATE INDEX "SourceCampaignMaster_areaMasterId_idx" ON "public"."SourceCampaignMaster"("areaMasterId");

-- CreateIndex
CREATE INDEX "SourceCampaignMaster_marketMasterId_idx" ON "public"."SourceCampaignMaster"("marketMasterId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "public"."UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "public"."UserSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailTemplateVersion_templateId_createdAt_idx" ON "public"."EmailTemplateVersion"("templateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplateVersion_templateId_versionNumber_key" ON "public"."EmailTemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "ProofSend_templateId_createdAt_idx" ON "public"."ProofSend"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "ProofSend_status_createdAt_idx" ON "public"."ProofSend"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketMaster" ADD CONSTRAINT "MarketMaster_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "public"."AreaMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SourceCampaignMaster" ADD CONSTRAINT "SourceCampaignMaster_templateMasterId_fkey" FOREIGN KEY ("templateMasterId") REFERENCES "public"."TemplateMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SourceCampaignMaster" ADD CONSTRAINT "SourceCampaignMaster_areaMasterId_fkey" FOREIGN KEY ("areaMasterId") REFERENCES "public"."AreaMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SourceCampaignMaster" ADD CONSTRAINT "SourceCampaignMaster_marketMasterId_fkey" FOREIGN KEY ("marketMasterId") REFERENCES "public"."MarketMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailTemplateVersion" ADD CONSTRAINT "EmailTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."EmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProofSend" ADD CONSTRAINT "ProofSend_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."EmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProofSend" ADD CONSTRAINT "ProofSend_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "public"."EmailTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
