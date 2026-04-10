const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");

const router = express.Router();

const CAMPAIGN_STATUSES = new Set(["DRAFT", "IN_PROGRESS", "FINAL", "ARCHIVED"]);
const PROOF_SEND_STATUSES = new Set(["QUEUED", "SENT", "FAILED"]);

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

function normalizeArray(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry || "").trim()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,\n;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeStatus(value, fallback = "DRAFT") {
    const normalized = String(value || "").trim().toUpperCase();
    return CAMPAIGN_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

function normalizeProofStatus(value, fallback = "QUEUED") {
    const normalized = String(value || "").trim().toUpperCase();
    return PROOF_SEND_STATUSES.has(normalized) ? normalized : fallback;
}

async function getNextCampaignVersionNumber(campaignId) {
    const last = await prisma.campaignVersion.findFirst({
        where: { campaignId },
        orderBy: [{ versionNumber: "desc" }],
        select: { versionNumber: true }
    });
    return Number(last?.versionNumber || 0) + 1;
}

function mapCampaign(campaign) {
    return {
        id: campaign.id,
        code: campaign.code,
        name: campaign.name,
        status: campaign.status,
        templateMasterId: campaign.templateMasterId || "",
        templateName: campaign.templateMaster?.name || "",
        areaMasterId: campaign.areaMasterId || "",
        areaName: campaign.areaMaster?.name || "",
        marketMasterId: campaign.marketMasterId || "",
        marketName: campaign.marketMaster?.name || "",
        additionalMarkets: Array.isArray(campaign.additionalMarkets) ? campaign.additionalMarkets : [],
        currentVersionNumber: Number(campaign.currentVersionNumber || 0),
        currentProofRound: Number(campaign.currentProofRound || 0),
        isActive: Boolean(campaign.isActive),
        createdById: campaign.createdById || "",
        createdByName: campaign.createdByName || "",
        updatedById: campaign.updatedById || "",
        updatedByName: campaign.updatedByName || "",
        deletedAt: campaign.deletedAt || null,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
        versionsCount: Number(campaign._count?.versions || 0),
        proofSendsCount: Number(campaign._count?.proofSends || 0),
        activitiesCount: Number(campaign._count?.activities || 0)
    };
}

function mapCampaignActivity(item) {
    return {
        id: item.id,
        campaignId: item.campaignId,
        type: item.type,
        message: item.message,
        metadata: item.metadata || null,
        createdById: item.createdById || "",
        createdAt: item.createdAt
    };
}

async function createCampaignActivity({ campaignId, type, message, metadata = null, userId = "" }) {
    if (!campaignId) return;
    await prisma.campaignActivity.create({
        data: {
            campaignId,
            type: String(type || "INFO"),
            message: String(message || ""),
            metadata,
            createdById: userId || null
        }
    });
}

async function attachUserNames(campaigns) {
    const list = Array.isArray(campaigns) ? campaigns : [];
    const ids = new Set();
    for (const campaign of list) {
        if (campaign?.createdById) ids.add(String(campaign.createdById));
        if (campaign?.updatedById) ids.add(String(campaign.updatedById));
    }
    if (!ids.size) return list;

    const users = await prisma.user.findMany({
        where: { id: { in: Array.from(ids) } },
        select: { id: true, fullName: true }
    });
    const byId = new Map(users.map((user) => [user.id, user.fullName || ""]));
    return list.map((campaign) => ({
        ...campaign,
        createdByName: campaign.createdById ? (byId.get(campaign.createdById) || "") : "",
        updatedByName: campaign.updatedById ? (byId.get(campaign.updatedById) || "") : ""
    }));
}

async function generateCampaignCode() {
    const prefix = "CMP";
    const year = new Date().getFullYear();
    for (let index = 1; index <= 9999; index += 1) {
        const code = `${prefix}-${year}-${String(index).padStart(4, "0")}`;
        // eslint-disable-next-line no-await-in-loop
        const existing = await prisma.campaign.findUnique({ where: { code } });
        if (!existing) return code;
    }
    return `${prefix}-${year}-${Date.now()}`;
}

router.get("/", requireAuth("builder:view"), async (req, res) => {
    try {
        const search = String(req.query?.search || "").trim().toLowerCase();
        const statusFilter = normalizeStatus(req.query?.status || "", "");
        const includeArchived = String(req.query?.includeArchived || "").toLowerCase() === "true";

        const where = {};
        if (!includeArchived) {
            where.deletedAt = null;
            where.isActive = true;
        }
        if (statusFilter) where.status = statusFilter;

        const campaigns = await prisma.campaign.findMany({
            where,
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true,
                _count: {
                    select: {
                        versions: true,
                        proofSends: true,
                        activities: true
                    }
                }
            },
            orderBy: [{ updatedAt: "desc" }],
            take: 300
        });

        const filtered = search
            ? campaigns.filter((campaign) => {
                const haystack = [
                    campaign.code,
                    campaign.name,
                    campaign.status,
                    campaign.templateMaster?.name,
                    campaign.areaMaster?.name,
                    campaign.marketMaster?.name
                ].join(" ").toLowerCase();
                return haystack.includes(search);
            })
            : campaigns;

        const enriched = await attachUserNames(filtered);
        res.json({
            campaigns: enriched.map(mapCampaign)
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to load campaigns.") });
    }
});

router.get("/:id", requireAuth("builder:view"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Campaign id is required." });

        const campaign = await prisma.campaign.findUnique({
            where: { id },
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true,
                _count: {
                    select: {
                        versions: true,
                        proofSends: true,
                        activities: true
                    }
                }
            }
        });
        if (!campaign) return res.status(404).json({ error: "Campaign not found." });

        const [versions, proofSends, activities] = await Promise.all([
            prisma.campaignVersion.findMany({
                where: { campaignId: id },
                orderBy: [{ versionNumber: "desc" }],
                take: 30
            }),
            prisma.campaignProofSend.findMany({
                where: { campaignId: id },
                include: {
                    campaignVersion: {
                        select: {
                            id: true,
                            versionNumber: true
                        }
                    }
                },
                orderBy: [{ createdAt: "desc" }],
                take: 50
            }),
            prisma.campaignActivity.findMany({
                where: { campaignId: id },
                orderBy: [{ createdAt: "desc" }],
                take: 80
            })
        ]);

        const [enrichedCampaign] = await attachUserNames([campaign]);

        res.json({
            campaign: mapCampaign(enrichedCampaign),
            versions,
            proofSends,
            activities: activities.map(mapCampaignActivity)
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to load campaign detail.") });
    }
});

router.post("/:id/versions", requireAuth("builder:edit"), async (req, res) => {
    try {
        const campaignId = String(req.params.id || "").trim();
        if (!campaignId) return res.status(400).json({ error: "Campaign id is required." });

        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) return res.status(404).json({ error: "Campaign not found." });

        const subject = String(req.body?.subject || "").trim();
        const preheader = String(req.body?.preheader || "").trim();
        const htmlContent = String(req.body?.htmlContent || "").trim();
        const layoutJson = req.body?.layoutJson ?? null;
        const changeNote = String(req.body?.changeNote || "").trim();

        if (!subject) return res.status(400).json({ error: "Subject is required." });
        if (!htmlContent) return res.status(400).json({ error: "HTML content is required." });

        const nextVersionNumber = await getNextCampaignVersionNumber(campaignId);

        const version = await prisma.campaignVersion.create({
            data: {
                campaignId,
                versionNumber: nextVersionNumber,
                subject,
                preheader: preheader || null,
                layoutJson,
                htmlContent,
                changeNote: changeNote || null,
                createdById: req.auth.user.id
            }
        });

        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                currentVersionNumber: nextVersionNumber,
                status: campaign.status === "DRAFT" ? "IN_PROGRESS" : campaign.status,
                updatedById: req.auth.user.id
            }
        });

        await createCampaignActivity({
            campaignId,
            type: "CAMPAIGN_VERSION_CREATED",
            message: `Campaign version ${nextVersionNumber} saved.`,
            metadata: {
                campaignVersionId: version.id,
                changeNote: changeNote || null
            },
            userId: req.auth.user.id
        });

        res.json({
            ok: true,
            version
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to create campaign version.") });
    }
});

router.post("/:id/versions/:versionId/restore", requireAuth("builder:edit"), async (req, res) => {
    try {
        const campaignId = String(req.params.id || "").trim();
        const versionId = String(req.params.versionId || "").trim();
        if (!campaignId) return res.status(400).json({ error: "Campaign id is required." });
        if (!versionId) return res.status(400).json({ error: "Version id is required." });

        const [campaign, sourceVersion] = await Promise.all([
            prisma.campaign.findUnique({ where: { id: campaignId } }),
            prisma.campaignVersion.findFirst({
                where: { id: versionId, campaignId }
            })
        ]);

        if (!campaign) return res.status(404).json({ error: "Campaign not found." });
        if (!sourceVersion) return res.status(404).json({ error: "Campaign version not found." });

        const nextVersionNumber = await getNextCampaignVersionNumber(campaignId);
        const changeNote = String(req.body?.changeNote || "").trim()
            || `Restored from version ${sourceVersion.versionNumber}`;

        const restoredVersion = await prisma.campaignVersion.create({
            data: {
                campaignId,
                versionNumber: nextVersionNumber,
                subject: sourceVersion.subject || null,
                preheader: sourceVersion.preheader || null,
                layoutJson: sourceVersion.layoutJson || null,
                htmlContent: sourceVersion.htmlContent || null,
                changeNote,
                createdById: req.auth.user.id
            }
        });

        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                currentVersionNumber: nextVersionNumber,
                status: campaign.status === "DRAFT" ? "IN_PROGRESS" : campaign.status,
                updatedById: req.auth.user.id
            }
        });

        await createCampaignActivity({
            campaignId,
            type: "CAMPAIGN_VERSION_RESTORED",
            message: `Version ${sourceVersion.versionNumber} restored into version ${nextVersionNumber}.`,
            metadata: {
                sourceVersionId: sourceVersion.id,
                sourceVersionNumber: sourceVersion.versionNumber,
                restoredVersionId: restoredVersion.id,
                restoredVersionNumber: restoredVersion.versionNumber
            },
            userId: req.auth.user.id
        });

        res.json({
            ok: true,
            version: restoredVersion,
            sourceVersion
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to restore campaign version.") });
    }
});

router.delete("/:id/versions/:versionId", requireAuth("builder:edit"), async (req, res) => {
    try {
        const campaignId = String(req.params.id || "").trim();
        const versionId = String(req.params.versionId || "").trim();
        if (!campaignId) return res.status(400).json({ error: "Campaign id is required." });
        if (!versionId) return res.status(400).json({ error: "Version id is required." });

        const [campaign, version] = await Promise.all([
            prisma.campaign.findUnique({ where: { id: campaignId } }),
            prisma.campaignVersion.findFirst({
                where: {
                    id: versionId,
                    campaignId
                }
            })
        ]);

        if (!campaign) return res.status(404).json({ error: "Campaign not found." });
        if (!version) return res.status(404).json({ error: "Campaign version not found." });

        await prisma.campaignVersion.delete({
            where: { id: versionId }
        });

        const latestRemaining = await prisma.campaignVersion.findFirst({
            where: { campaignId },
            orderBy: [{ versionNumber: "desc" }],
            select: { versionNumber: true }
        });
        const nextCurrentVersionNumber = Number(latestRemaining?.versionNumber || 0);

        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                currentVersionNumber: nextCurrentVersionNumber,
                updatedById: req.auth.user.id
            }
        });

        await createCampaignActivity({
            campaignId,
            type: "CAMPAIGN_VERSION_DELETED",
            message: `Campaign version ${version.versionNumber} deleted.`,
            metadata: {
                deletedVersionId: version.id,
                deletedVersionNumber: version.versionNumber
            },
            userId: req.auth.user.id
        });

        res.json({
            ok: true,
            deletedVersionId: version.id,
            deletedVersionNumber: version.versionNumber,
            currentVersionNumber: nextCurrentVersionNumber
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to delete campaign version.") });
    }
});

router.post("/:id/proof-sends", requireAuth("proof:send"), async (req, res) => {
    try {
        const campaignId = String(req.params.id || "").trim();
        if (!campaignId) return res.status(400).json({ error: "Campaign id is required." });

        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) return res.status(404).json({ error: "Campaign not found." });

        const campaignVersionId = String(req.body?.campaignVersionId || "").trim() || null;
        if (campaignVersionId) {
            const version = await prisma.campaignVersion.findFirst({
                where: { id: campaignVersionId, campaignId },
                select: { id: true }
            });
            if (!version) return res.status(400).json({ error: "Selected campaign version is invalid for this campaign." });
        }

        const recipients = normalizeArray(req.body?.recipients);
        const subject = String(req.body?.subject || "").trim();
        const providerMessageId = String(req.body?.providerMessageId || "").trim();
        const errorMessage = String(req.body?.errorMessage || "").trim();
        const status = normalizeProofStatus(req.body?.status, "QUEUED");
        const requestedIteration = Number(req.body?.iterationNo || 0);
        const iterationNo = requestedIteration > 0 ? requestedIteration : Number(campaign.currentProofRound || 0) + 1;
        const sentAt = req.body?.sentAt ? new Date(req.body.sentAt) : null;

        if (!subject) return res.status(400).json({ error: "Subject is required." });
        if (!recipients.length) return res.status(400).json({ error: "At least one recipient is required." });

        const proofSend = await prisma.campaignProofSend.create({
            data: {
                campaignId,
                campaignVersionId,
                iterationNo,
                recipients,
                subject,
                status,
                providerMessageId: providerMessageId || null,
                errorMessage: errorMessage || null,
                sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : null,
                createdById: req.auth.user.id
            },
            include: {
                campaignVersion: {
                    select: {
                        id: true,
                        versionNumber: true
                    }
                }
            }
        });

        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                currentProofRound: Math.max(Number(campaign.currentProofRound || 0), iterationNo),
                status: campaign.status === "DRAFT" ? "IN_PROGRESS" : campaign.status,
                updatedById: req.auth.user.id
            }
        });

        await createCampaignActivity({
            campaignId,
            type: status === "SENT" ? "PROOF_SENT" : "PROOF_SEND_FAILED",
            message: status === "SENT"
                ? `Proof iteration ${iterationNo} sent.`
                : `Proof iteration ${iterationNo} failed.`,
            metadata: {
                campaignVersionId: campaignVersionId || null,
                status,
                providerMessageId: providerMessageId || null,
                errorMessage: errorMessage || null
            },
            userId: req.auth.user.id
        });

        res.json({
            ok: true,
            proofSend
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to log campaign proof send.") });
    }
});

router.post("/", requireAuth("builder:edit"), async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        if (!name) return res.status(400).json({ error: "Campaign name is required." });

        const requestedCode = normalizeCode(req.body?.code || "");
        const code = requestedCode || await generateCampaignCode();
        const existingByCode = await prisma.campaign.findUnique({ where: { code } });
        if (existingByCode) return res.status(400).json({ error: "Campaign code already exists." });

        const status = normalizeStatus(req.body?.status, "DRAFT");
        const templateMasterId = String(req.body?.templateMasterId || "").trim() || null;
        const areaMasterId = String(req.body?.areaMasterId || "").trim() || null;
        const marketMasterId = String(req.body?.marketMasterId || "").trim() || null;
        const additionalMarkets = normalizeArray(req.body?.additionalMarkets);

        if (!templateMasterId) {
            return res.status(400).json({ error: "Template is required." });
        }
        const templateExists = await prisma.templateMaster.findUnique({
            where: { id: templateMasterId },
            select: { id: true }
        });
        if (!templateExists) {
            return res.status(400).json({ error: "Selected template is invalid." });
        }

        const campaign = await prisma.campaign.create({
            data: {
                code,
                name,
                status,
                templateMasterId,
                areaMasterId,
                marketMasterId,
                additionalMarkets,
                createdById: req.auth.user.id,
                updatedById: req.auth.user.id
            },
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true,
                _count: {
                    select: {
                        versions: true,
                        proofSends: true,
                        activities: true
                    }
                }
            }
        });

        await createCampaignActivity({
            campaignId: campaign.id,
            type: "CAMPAIGN_CREATED",
            message: `Campaign created (${campaign.code}).`,
            metadata: {
                status: campaign.status
            },
            userId: req.auth.user.id
        });

        const [enrichedCampaign] = await attachUserNames([campaign]);
        res.json({ campaign: mapCampaign(enrichedCampaign), ok: true });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to create campaign.") });
    }
});

router.patch("/:id", requireAuth("builder:edit"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Campaign id is required." });

        const current = await prisma.campaign.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: "Campaign not found." });

        const updates = {};
        if (req.body?.name !== undefined) {
            const name = String(req.body.name || "").trim();
            if (!name) return res.status(400).json({ error: "Campaign name is required." });
            updates.name = name;
        }
        if (req.body?.status !== undefined) {
            updates.status = normalizeStatus(req.body.status, current.status);
        }
        if (req.body?.code !== undefined) {
            const nextCode = normalizeCode(req.body.code || "");
            if (!nextCode) return res.status(400).json({ error: "Campaign code is required." });
            if (nextCode !== current.code) {
                const existingByCode = await prisma.campaign.findUnique({ where: { code: nextCode } });
                if (existingByCode) return res.status(400).json({ error: "Campaign code already exists." });
            }
            updates.code = nextCode;
        }
        if (req.body?.templateMasterId !== undefined) {
            const nextTemplateId = String(req.body.templateMasterId || "").trim() || null;
            if (!nextTemplateId) {
                return res.status(400).json({ error: "Template is required." });
            }
            const templateExists = await prisma.templateMaster.findUnique({
                where: { id: nextTemplateId },
                select: { id: true }
            });
            if (!templateExists) {
                return res.status(400).json({ error: "Selected template is invalid." });
            }
            updates.templateMasterId = nextTemplateId;
        }
        if (req.body?.areaMasterId !== undefined) {
            updates.areaMasterId = String(req.body.areaMasterId || "").trim() || null;
        }
        if (req.body?.marketMasterId !== undefined) {
            updates.marketMasterId = String(req.body.marketMasterId || "").trim() || null;
        }
        if (req.body?.additionalMarkets !== undefined) {
            updates.additionalMarkets = normalizeArray(req.body.additionalMarkets);
        }
        if (req.body?.isActive !== undefined) {
            updates.isActive = Boolean(req.body.isActive);
        }

        updates.updatedById = req.auth.user.id;

        const updated = await prisma.campaign.update({
            where: { id },
            data: updates,
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true,
                _count: {
                    select: {
                        versions: true,
                        proofSends: true,
                        activities: true
                    }
                }
            }
        });

        await createCampaignActivity({
            campaignId: id,
            type: "CAMPAIGN_UPDATED",
            message: "Campaign settings updated.",
            metadata: updates,
            userId: req.auth.user.id
        });

        const [enrichedCampaign] = await attachUserNames([updated]);
        res.json({ campaign: mapCampaign(enrichedCampaign), ok: true });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to update campaign.") });
    }
});

router.delete("/:id", requireAuth("builder:edit"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Campaign id is required." });

        const current = await prisma.campaign.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: "Campaign not found." });

        const archived = await prisma.campaign.update({
            where: { id },
            data: {
                status: "ARCHIVED",
                isActive: false,
                deletedAt: new Date(),
                updatedById: req.auth.user.id
            },
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true,
                _count: {
                    select: {
                        versions: true,
                        proofSends: true,
                        activities: true
                    }
                }
            }
        });

        await createCampaignActivity({
            campaignId: id,
            type: "CAMPAIGN_ARCHIVED",
            message: "Campaign archived (soft delete).",
            metadata: null,
            userId: req.auth.user.id
        });

        const [enrichedCampaign] = await attachUserNames([archived]);
        res.json({ campaign: mapCampaign(enrichedCampaign), ok: true });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to archive campaign.") });
    }
});

module.exports = router;
