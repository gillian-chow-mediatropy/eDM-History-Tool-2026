-- CreateEnum
CREATE TYPE "public"."CampaignStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'FINAL', 'ARCHIVED');

-- AlterTable
ALTER TABLE "public"."BuilderCampaignDraft" ADD COLUMN "campaignId" TEXT;

-- CreateTable
CREATE TABLE "public"."Campaign" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "templateMasterId" TEXT,
    "sourceCampaignId" TEXT,
    "areaMasterId" TEXT,
    "marketMasterId" TEXT,
    "additionalMarkets" JSONB,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "currentProofRound" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignVersion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "subject" TEXT,
    "preheader" TEXT,
    "layoutJson" JSONB,
    "htmlContent" TEXT,
    "changeNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignProofSend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignVersionId" TEXT,
    "iterationNo" INTEGER NOT NULL,
    "recipients" JSONB NOT NULL,
    "subject" TEXT,
    "status" "public"."ProofSendStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignProofSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignActivity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_code_key" ON "public"."Campaign"("code");

-- CreateIndex
CREATE INDEX "Campaign_status_isActive_idx" ON "public"."Campaign"("status", "isActive");

-- CreateIndex
CREATE INDEX "Campaign_templateMasterId_idx" ON "public"."Campaign"("templateMasterId");

-- CreateIndex
CREATE INDEX "Campaign_sourceCampaignId_idx" ON "public"."Campaign"("sourceCampaignId");

-- CreateIndex
CREATE INDEX "Campaign_areaMasterId_idx" ON "public"."Campaign"("areaMasterId");

-- CreateIndex
CREATE INDEX "Campaign_marketMasterId_idx" ON "public"."Campaign"("marketMasterId");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "public"."Campaign"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignVersion_campaignId_versionNumber_key" ON "public"."CampaignVersion"("campaignId", "versionNumber");

-- CreateIndex
CREATE INDEX "CampaignVersion_campaignId_createdAt_idx" ON "public"."CampaignVersion"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignProofSend_campaignId_createdAt_idx" ON "public"."CampaignProofSend"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignProofSend_campaignVersionId_idx" ON "public"."CampaignProofSend"("campaignVersionId");

-- CreateIndex
CREATE INDEX "CampaignProofSend_status_createdAt_idx" ON "public"."CampaignProofSend"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignActivity_campaignId_createdAt_idx" ON "public"."CampaignActivity"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignActivity_type_idx" ON "public"."CampaignActivity"("type");

-- CreateIndex
CREATE INDEX "BuilderCampaignDraft_campaignId_idx" ON "public"."BuilderCampaignDraft"("campaignId");

-- AddForeignKey
ALTER TABLE "public"."BuilderCampaignDraft" ADD CONSTRAINT "BuilderCampaignDraft_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_templateMasterId_fkey" FOREIGN KEY ("templateMasterId") REFERENCES "public"."TemplateMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_sourceCampaignId_fkey" FOREIGN KEY ("sourceCampaignId") REFERENCES "public"."SourceCampaignMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_areaMasterId_fkey" FOREIGN KEY ("areaMasterId") REFERENCES "public"."AreaMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_marketMasterId_fkey" FOREIGN KEY ("marketMasterId") REFERENCES "public"."MarketMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignVersion" ADD CONSTRAINT "CampaignVersion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignProofSend" ADD CONSTRAINT "CampaignProofSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignProofSend" ADD CONSTRAINT "CampaignProofSend_campaignVersionId_fkey" FOREIGN KEY ("campaignVersionId") REFERENCES "public"."CampaignVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignActivity" ADD CONSTRAINT "CampaignActivity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
