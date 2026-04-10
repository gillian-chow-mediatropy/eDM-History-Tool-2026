const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");
const {
    createInitialBuilderModel,
    renderHtmlFromModel,
    validateBuilderModel
} = require("../lib/builder-layout");

const router = express.Router();

function toSafeApiError(error, fallbackMessage) {
    const message = String(error?.message || "");
    if (
        message.includes("Can't reach database server") ||
        message.includes("Authentication failed against database server") ||
        message.includes("prisma.")
    ) {
        return "Database connection failed. Please verify docker postgres is running and DATABASE_URL is correct.";
    }
    return fallbackMessage;
}

function cloneJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return null;
    }
}

function readVersionLabel(layoutJson) {
    return String(layoutJson?.metadata?.versionLabel || "").trim();
}

function mapDraft(draft) {
    return {
        id: draft.id,
        campaignName: draft.campaignName,
        subject: draft.subject || "",
        preheader: draft.preheader || "",
        templateMasterId: draft.templateMasterId,
        sourceCampaignMasterId: draft.sourceCampaignMasterId || "",
        schemaVersion: draft.schemaVersion,
        layoutJson: draft.layoutJson,
        htmlDraft: draft.htmlDraft || "",
        latestVersionNumber: draft.latestVersionNumber,
        isActive: draft.isActive,
        createdById: draft.createdById || "",
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        templateName: draft.templateMaster?.name || "",
        sourceCampaignName: draft.sourceCampaignMaster?.name || ""
    };
}

router.get("/drafts/:id", requireAuth("builder:view"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Draft id is required." });

        const draft = await prisma.builderCampaignDraft.findUnique({
            where: { id },
            include: { templateMaster: true, sourceCampaignMaster: true }
        });
        if (!draft) return res.status(404).json({ error: "Draft not found." });

        const versions = await prisma.builderCampaignDraftVersion.findMany({
            where: { draftId: id },
            orderBy: [{ versionNumber: "desc" }],
            take: 30
        });

        res.json({
            draft: mapDraft(draft),
            versions: versions.map((item) => ({
                id: item.id,
                draftId: item.draftId,
                versionNumber: item.versionNumber,
                versionLabel: readVersionLabel(item.layoutJson),
                campaignName: String(item.layoutJson?.metadata?.campaignName || draft.campaignName || ""),
                subject: String(item.layoutJson?.metadata?.subject || draft.subject || ""),
                htmlDraft: item.htmlDraft || "",
                layoutJson: item.layoutJson,
                createdById: item.createdById || "",
                createdAt: item.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to load builder draft.") });
    }
});

router.get("/drafts", requireAuth("builder:view"), async (req, res) => {
    try {
        const templateMasterId = String(req.query?.templateMasterId || "").trim();
        const sourceCampaignMasterId = String(req.query?.sourceCampaignMasterId || "").trim();
        const campaignId = String(req.query?.campaignId || "").trim();
        const campaignName = String(req.query?.campaignName || "").trim();

        const where = { isActive: true };
        if (templateMasterId) where.templateMasterId = templateMasterId;
        if (sourceCampaignMasterId) where.sourceCampaignMasterId = sourceCampaignMasterId;
        if (campaignId) where.campaignId = campaignId;
        if (campaignName) where.campaignName = campaignName;

        const drafts = await prisma.builderCampaignDraft.findMany({
            where,
            include: { templateMaster: true, sourceCampaignMaster: true },
            orderBy: [{ updatedAt: "desc" }],
            take: 50
        });

        res.json({ drafts: drafts.map(mapDraft) });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to load builder drafts.") });
    }
});

router.post("/drafts/init", requireAuth("builder:edit"), async (req, res) => {
    try {
        const templateMasterId = String(req.body?.templateMasterId || "").trim();
        const sourceCampaignMasterId = String(req.body?.sourceCampaignMasterId || "").trim();
        const campaignId = String(req.body?.campaignId || "").trim();
        const campaignName = String(req.body?.campaignName || "").trim();
        const subject = String(req.body?.subject || "").trim();
        const preheader = String(req.body?.preheader || "").trim();
        const htmlSource = String(req.body?.htmlSource || "");
        const createInitialVersion = Boolean(req.body?.createInitialVersion === true);

        if (!templateMasterId) return res.status(400).json({ error: "templateMasterId is required." });

        const [templateMaster, sourceCampaign] = await Promise.all([
            prisma.templateMaster.findUnique({ where: { id: templateMasterId } }),
            sourceCampaignMasterId
                ? prisma.sourceCampaignMaster.findUnique({ where: { id: sourceCampaignMasterId } })
                : Promise.resolve(null)
        ]);
        const campaign = campaignId
            ? await prisma.campaign.findUnique({ where: { id: campaignId } })
            : null;

        if (!templateMaster) return res.status(404).json({ error: "Template master not found." });
        if (sourceCampaignMasterId && !sourceCampaign) return res.status(404).json({ error: "Source campaign not found." });
        if (campaignId && !campaign) return res.status(404).json({ error: "Campaign not found." });

        const layoutJson = createInitialBuilderModel({
            template: templateMaster,
            sourceCampaign,
            campaignName,
            subject,
            preheader,
            htmlSource
        });
        const renderResult = renderHtmlFromModel(layoutJson);
        const explicitHtmlDraft = String(htmlSource || "").trim();
        const persistedHtmlDraft = explicitHtmlDraft || renderResult;
        const whereExisting = {
            templateMasterId,
            sourceCampaignMasterId: sourceCampaignMasterId || null,
            campaignId: campaignId || null,
            campaignName: campaignName || sourceCampaign?.name || "Untitled Campaign",
            isActive: true
        };

        const existing = await prisma.builderCampaignDraft.findFirst({
            where: whereExisting,
            orderBy: [{ updatedAt: "desc" }]
        });

        let draft;
        let nextVersionForCampaign = Number(campaign?.currentVersionNumber || 0);
        if (existing) {
            const nextVersion = Number(existing.latestVersionNumber || 0) + 1;
            if (createInitialVersion) {
                nextVersionForCampaign = nextVersion;
            }
            draft = await prisma.builderCampaignDraft.update({
                where: { id: existing.id },
                data: {
                    subject: subject || existing.subject,
                    preheader: preheader || existing.preheader,
                    schemaVersion: 1,
                    layoutJson,
                    htmlDraft: persistedHtmlDraft,
                    latestVersionNumber: createInitialVersion
                        ? nextVersion
                        : Number(existing.latestVersionNumber || 0),
                    campaignId: campaignId || existing.campaignId || null,
                    createdById: req.auth.user.id
                }
            });

            if (createInitialVersion) {
                await prisma.builderCampaignDraftVersion.create({
                    data: {
                        draftId: existing.id,
                        versionNumber: nextVersion,
                        layoutJson,
                        htmlDraft: persistedHtmlDraft,
                        createdById: req.auth.user.id
                    }
                });
            }
        } else {
            const initialVersionNumber = createInitialVersion ? 1 : 0;
            draft = await prisma.builderCampaignDraft.create({
                data: {
                    campaignName: whereExisting.campaignName,
                    subject: subject || whereExisting.campaignName,
                    preheader: preheader || null,
                    templateMasterId,
                    sourceCampaignMasterId: sourceCampaignMasterId || null,
                    campaignId: campaignId || null,
                    schemaVersion: 1,
                    layoutJson,
                    htmlDraft: persistedHtmlDraft,
                    latestVersionNumber: initialVersionNumber,
                    isActive: true,
                    createdById: req.auth.user.id
                }
            });

            if (createInitialVersion) {
                await prisma.builderCampaignDraftVersion.create({
                    data: {
                        draftId: draft.id,
                        versionNumber: 1,
                        layoutJson,
                        htmlDraft: persistedHtmlDraft,
                        createdById: req.auth.user.id
                    }
                });
                nextVersionForCampaign = 1;
            }
        }

        if (campaignId) {
            const campaignUpdate = {
                status: "IN_PROGRESS",
                templateMasterId,
                updatedById: req.auth.user.id
            };
            if (createInitialVersion) {
                campaignUpdate.currentVersionNumber = nextVersionForCampaign;
            }
            await prisma.campaign.update({
                where: { id: campaignId },
                data: campaignUpdate
            });
        }

        const hydrated = await prisma.builderCampaignDraft.findUnique({
            where: { id: draft.id },
            include: { templateMaster: true, sourceCampaignMaster: true }
        });

        res.json({
            ok: true,
            draft: mapDraft(hydrated),
            message: createInitialVersion
                ? "Step 2 foundation draft initialized with version snapshot."
                : "Step 2 foundation draft initialized and persisted."
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to initialize builder draft.") });
    }
});

router.patch("/drafts/:id", requireAuth("builder:edit"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Draft id is required." });

        const current = await prisma.builderCampaignDraft.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: "Draft not found." });

        const nextCampaignName = req.body?.campaignName !== undefined
            ? String(req.body.campaignName || "").trim()
            : current.campaignName;
        const nextSubject = req.body?.subject !== undefined
            ? String(req.body.subject || "").trim()
            : String(current.subject || "");
        const nextPreheader = req.body?.preheader !== undefined
            ? String(req.body.preheader || "").trim()
            : String(current.preheader || "");
        const requestedHtmlDraft = req.body?.htmlDraft !== undefined
            ? String(req.body.htmlDraft || "")
            : "";
        const nextLayout = req.body?.layoutJson !== undefined ? req.body.layoutJson : current.layoutJson;

        const validationError = validateBuilderModel(nextLayout);
        if (validationError) return res.status(400).json({ error: validationError });

        const htmlDraft = requestedHtmlDraft.trim() ? requestedHtmlDraft : renderHtmlFromModel(nextLayout);
        const updated = await prisma.builderCampaignDraft.update({
            where: { id },
            data: {
                campaignName: nextCampaignName || current.campaignName,
                subject: nextSubject || current.subject,
                preheader: nextPreheader || null,
                schemaVersion: 1,
                layoutJson: nextLayout,
                htmlDraft
            },
            include: { templateMaster: true, sourceCampaignMaster: true }
        });

        res.json({
            ok: true,
            draft: mapDraft(updated),
            message: "Step 2 draft saved."
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to update builder draft.") });
    }
});

router.post("/drafts/:id/versions", requireAuth("builder:edit"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Draft id is required." });

        const current = await prisma.builderCampaignDraft.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: "Draft not found." });

        const nextLayout = req.body?.layoutJson !== undefined ? req.body.layoutJson : current.layoutJson;
        const versionLabel = String(req.body?.versionLabel || "").trim();
        const requestedHtmlDraft = req.body?.htmlDraft !== undefined
            ? String(req.body.htmlDraft || "")
            : "";
        const versionLayout = cloneJson(nextLayout);
        if (!versionLayout) return res.status(400).json({ error: "layoutJson is invalid." });
        versionLayout.metadata = {
            ...(versionLayout.metadata || {})
        };
        if (versionLabel) {
            versionLayout.metadata.versionLabel = versionLabel;
        } else if (versionLayout.metadata?.versionLabel !== undefined) {
            delete versionLayout.metadata.versionLabel;
        }

        const validationError = validateBuilderModel(versionLayout);
        if (validationError) return res.status(400).json({ error: validationError });

        const nextVersion = Number(current.latestVersionNumber || 1) + 1;
        const htmlDraft = requestedHtmlDraft.trim() ? requestedHtmlDraft : renderHtmlFromModel(versionLayout);

        const [, version] = await prisma.$transaction([
            prisma.builderCampaignDraft.update({
                where: { id },
                data: {
                    layoutJson: versionLayout,
                    htmlDraft,
                    schemaVersion: 1,
                    latestVersionNumber: nextVersion
                }
            }),
            prisma.builderCampaignDraftVersion.create({
                data: {
                    draftId: id,
                    versionNumber: nextVersion,
                    layoutJson: versionLayout,
                    htmlDraft,
                    createdById: req.auth.user.id
                }
            })
        ]);

        res.json({
            ok: true,
            version: {
                id: version.id,
                draftId: version.draftId,
                versionNumber: version.versionNumber,
                versionLabel: readVersionLabel(version.layoutJson),
                createdAt: version.createdAt
            },
            message: "Step 2 draft version saved."
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to create builder draft version.") });
    }
});

router.delete("/drafts/:id/versions/:versionId", requireAuth("builder:edit"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        const versionId = String(req.params.versionId || "").trim();
        if (!id) return res.status(400).json({ error: "Draft id is required." });
        if (!versionId) return res.status(400).json({ error: "Version id is required." });

        const [draft, version] = await Promise.all([
            prisma.builderCampaignDraft.findUnique({ where: { id } }),
            prisma.builderCampaignDraftVersion.findFirst({
                where: {
                    id: versionId,
                    draftId: id
                }
            })
        ]);

        if (!draft) return res.status(404).json({ error: "Draft not found." });
        if (!version) return res.status(404).json({ error: "Draft version not found." });

        await prisma.builderCampaignDraftVersion.delete({
            where: { id: versionId }
        });

        const remaining = await prisma.builderCampaignDraftVersion.findMany({
            where: { draftId: id },
            orderBy: [{ versionNumber: "desc" }],
            take: 30
        });

        res.json({
            ok: true,
            versions: remaining.map((item) => ({
                id: item.id,
                draftId: item.draftId,
                versionNumber: item.versionNumber,
                versionLabel: readVersionLabel(item.layoutJson),
                campaignName: String(item.layoutJson?.metadata?.campaignName || draft.campaignName || ""),
                subject: String(item.layoutJson?.metadata?.subject || draft.subject || ""),
                htmlDraft: item.htmlDraft || "",
                layoutJson: item.layoutJson,
                createdById: item.createdById || "",
                createdAt: item.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to delete builder draft version.") });
    }
});

router.delete("/versions/:versionId", requireAuth("builder:edit"), async (req, res) => {
    try {
        const versionId = String(req.params.versionId || "").trim();
        if (!versionId) return res.status(400).json({ error: "Version id is required." });

        const version = await prisma.builderCampaignDraftVersion.findUnique({
            where: { id: versionId }
        });
        if (!version) return res.status(404).json({ error: "Draft version not found." });

        await prisma.builderCampaignDraftVersion.delete({
            where: { id: versionId }
        });

        res.json({
            ok: true,
            deletedVersionId: versionId,
            draftId: version.draftId
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to delete builder draft version.") });
    }
});

module.exports = router;
