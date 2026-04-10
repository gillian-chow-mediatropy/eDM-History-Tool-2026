-- CreateTable
CREATE TABLE "public"."BuilderCampaignDraft" (
    "id" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "subject" TEXT,
    "preheader" TEXT,
    "templateMasterId" TEXT NOT NULL,
    "sourceCampaignMasterId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "layoutJson" JSONB NOT NULL,
    "htmlDraft" TEXT,
    "latestVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuilderCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BuilderCampaignDraftVersion" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "layoutJson" JSONB NOT NULL,
    "htmlDraft" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuilderCampaignDraftVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuilderCampaignDraft_templateMasterId_isActive_idx" ON "public"."BuilderCampaignDraft"("templateMasterId", "isActive");

-- CreateIndex
CREATE INDEX "BuilderCampaignDraft_sourceCampaignMasterId_idx" ON "public"."BuilderCampaignDraft"("sourceCampaignMasterId");

-- CreateIndex
CREATE INDEX "BuilderCampaignDraft_campaignName_idx" ON "public"."BuilderCampaignDraft"("campaignName");

-- CreateIndex
CREATE UNIQUE INDEX "BuilderCampaignDraftVersion_draftId_versionNumber_key" ON "public"."BuilderCampaignDraftVersion"("draftId", "versionNumber");

-- CreateIndex
CREATE INDEX "BuilderCampaignDraftVersion_draftId_createdAt_idx" ON "public"."BuilderCampaignDraftVersion"("draftId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."BuilderCampaignDraft" ADD CONSTRAINT "BuilderCampaignDraft_templateMasterId_fkey" FOREIGN KEY ("templateMasterId") REFERENCES "public"."TemplateMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BuilderCampaignDraft" ADD CONSTRAINT "BuilderCampaignDraft_sourceCampaignMasterId_fkey" FOREIGN KEY ("sourceCampaignMasterId") REFERENCES "public"."SourceCampaignMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BuilderCampaignDraftVersion" ADD CONSTRAINT "BuilderCampaignDraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "public"."BuilderCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
