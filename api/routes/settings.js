const express = require("express");
const https = require("https");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");
const { fetchPreviewHtml } = require("../lib/preview-fetch");

const router = express.Router();
const TEMPLATE_CODES = [1, 2, 3, 4, 5, 6];
const MARKET_TYPES = new Set(["MARKET", "ADDITIONAL_MARKET"]);
const SMARTSHEET_SHEET_ID = process.env.SMARTSHEET_SHEET_ID || "36354399725444";
const SMARTSHEET_API_TOKEN = process.env.SMARTSHEET_API_TOKEN;
let templateHtmlTableReadyPromise = null;
let templateSectionRulesTableReadyPromise = null;

const TEMPLATE_SECTION_RULE_DEFAULT = {
    detectSearch: true,
    splitOnDivider: true,
    forceFirstAsHeader: false,
    forceLastAsFooter: false,
    forcedSectionBreakIndexes: []
};

const FIELD_MAP = {
    1156879576524676: "requestId",
    6252542022707076: "status",
    2300228855457668: "earliestDeploymentDate",
    6803828482828164: "latestDeploymentDate",
    5420736035743620: "emailTemplate",
    2122264081551236: "targetLanguage",
    7623657374568324: "campaignName",
    3187176543309700: "campaignDescription",
    3371405229746052: "campaignType",
    3395746991918980: "campaignGoal",
    3496432308014980: "area",
    5596505414258564: "targetMarket",
    2831053281775492: "additionalTargetMarkets",
    5195369913995140: "previewLink",
    4126278054793092: "requestDate"
};

const SMARTSHEET_COLUMN_IDS = Object.keys(FIELD_MAP).join(",");

function normalizeCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
}

function parseTemplateCodeFromRuleKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const direct = Number(raw);
    if (Number.isInteger(direct) && direct > 0) return direct;
    const match = raw.match(/(\d+)/);
    if (!match?.[1]) return 0;
    const extracted = Number(match[1]);
    return Number.isInteger(extracted) && extracted > 0 ? extracted : 0;
}

function normalizeStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry || "").trim()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,\n;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function toBoolean(value, fallback = true) {
    if (typeof value === "boolean") return value;
    return fallback;
}

function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function splitAdditionalMarkets(value) {
    return normalizeStringArray(value);
}

function parseDateValue(email) {
    const raw = email.earliestDeploymentDate || email.latestDeploymentDate || email.requestDate || "";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseTemplateCode(templateName) {
    const match = String(templateName || "").match(/template\s*(\d+)/i);
    if (!match) return null;
    const code = Number(match[1]);
    return Number.isFinite(code) ? code : null;
}

function parseAreaValue(rawArea) {
    const value = normalizeName(rawArea);
    if (!value) return { code: "", name: "" };

    const match = value.match(/^([A-Za-z0-9]+)\s*\((.+)\)$/);
    if (match) {
        return {
            code: normalizeCode(match[1]),
            name: normalizeName(match[2])
        };
    }

    const firstToken = value.split(/\s+/)[0] || value;
    return {
        code: normalizeCode(firstToken),
        name: value
    };
}

function parseSmartsheetRow(row) {
    const output = {};
    for (const cell of row.cells || []) {
        const field = FIELD_MAP[cell.columnId];
        if (field) output[field] = cell.displayValue || cell.value || "";
    }
    return output;
}

function smartsheetRequest(pathname) {
    return new Promise((resolve, reject) => {
        const request = https.request({
            hostname: "api.smartsheet.com",
            path: pathname,
            method: "GET",
            headers: { Authorization: `Bearer ${SMARTSHEET_API_TOKEN}` }
        }, (response) => {
            let body = "";
            response.on("data", (chunk) => { body += chunk; });
            response.on("end", () => {
                try {
                    const payload = JSON.parse(body || "{}");
                    if ((response.statusCode || 500) >= 400) {
                        return reject(new Error(payload?.message || `Smartsheet API ${response.statusCode || 500}`));
                    }
                    resolve(payload);
                } catch (_error) {
                    reject(new Error("Invalid Smartsheet response."));
                }
            });
        });

        request.on("error", (error) => reject(error));
        request.end();
    });
}

async function fetchAllArchiveRows() {
    if (!SMARTSHEET_API_TOKEN) {
        throw new Error("Missing SMARTSHEET_API_TOKEN");
    }

    const pageSize = 500;
    const metaPath = `/2.0/sheets/${SMARTSHEET_SHEET_ID}?page=1&pageSize=1&columnIds=${SMARTSHEET_COLUMN_IDS}`;
    const meta = await smartsheetRequest(metaPath);
    const totalRows = Number(meta.totalRowCount || 0);
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

    const pages = await Promise.all(
        Array.from({ length: totalPages }, (_, index) => {
            const page = index + 1;
            const path = `/2.0/sheets/${SMARTSHEET_SHEET_ID}?page=${page}&pageSize=${pageSize}&columnIds=${SMARTSHEET_COLUMN_IDS}`;
            return smartsheetRequest(path);
        })
    );

    const allRows = pages.flatMap((page) => page.rows || []);
    return { totalRows, allRows };
}

async function ensureDefaultTemplates() {
    for (const code of TEMPLATE_CODES) {
        await prisma.templateMaster.upsert({
            where: { code },
            create: {
                code,
                name: `Template ${code}`,
                isMain: code === 1,
                isActive: true,
                sortOrder: code
            },
            update: {}
        });
    }

    await prisma.templateMaster.updateMany({
        where: { code: 1 },
        data: { isMain: true }
    });

    await prisma.templateMaster.updateMany({
        where: {
            code: { not: 1 },
            isMain: true
        },
        data: { isMain: false }
    });
}

async function ensureTemplateHtmlStoreTable() {
    if (templateHtmlTableReadyPromise) return templateHtmlTableReadyPromise;

    templateHtmlTableReadyPromise = prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS template_html_store (
            template_id TEXT PRIMARY KEY,
            html_content TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `).then(() => true);

    return templateHtmlTableReadyPromise;
}

function normalizeSectionRuleInput(rawRule = {}) {
    const toBool = (value, fallback) => (value === undefined ? fallback : Boolean(value));
    const rawBreaks = Array.isArray(rawRule?.forcedSectionBreakIndexes)
        ? rawRule.forcedSectionBreakIndexes
        : [];
    const forcedSectionBreakIndexes = Array.from(new Set(
        rawBreaks
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0)
    )).sort((a, b) => a - b);

    return {
        detectSearch: toBool(rawRule?.detectSearch, TEMPLATE_SECTION_RULE_DEFAULT.detectSearch),
        splitOnDivider: toBool(rawRule?.splitOnDivider, TEMPLATE_SECTION_RULE_DEFAULT.splitOnDivider),
        forceFirstAsHeader: toBool(rawRule?.forceFirstAsHeader, TEMPLATE_SECTION_RULE_DEFAULT.forceFirstAsHeader),
        forceLastAsFooter: toBool(rawRule?.forceLastAsFooter, TEMPLATE_SECTION_RULE_DEFAULT.forceLastAsFooter),
        forcedSectionBreakIndexes
    };
}

async function ensureTemplateSectionRulesTable() {
    if (templateSectionRulesTableReadyPromise) return templateSectionRulesTableReadyPromise;

    templateSectionRulesTableReadyPromise = prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS template_section_rule_store (
            template_code INTEGER PRIMARY KEY,
            rules_json JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `).then(() => true);

    return templateSectionRulesTableReadyPromise;
}

async function loadTemplateSectionRulesByCodeMap() {
    await ensureTemplateSectionRulesTable();
    const rows = await prisma.$queryRawUnsafe(`
        SELECT template_code AS "templateCode", rules_json AS "rulesJson", updated_at AS "updatedAt"
        FROM template_section_rule_store
    `);

    const map = new Map();
    for (const row of rows || []) {
        const codeKey = String(Number(row?.templateCode || 0));
        if (!codeKey || codeKey === "0") continue;
        map.set(codeKey, {
            rules: normalizeSectionRuleInput(row?.rulesJson || {}),
            updatedAt: row?.updatedAt || null
        });
    }

    return map;
}

async function saveTemplateSectionRule(templateCode, rule) {
    await ensureTemplateSectionRulesTable();
    const code = Number(templateCode || 0);
    if (!Number.isInteger(code) || code <= 0) return;
    const normalized = normalizeSectionRuleInput(rule || {});
    const jsonValue = JSON.stringify(normalized);

    await prisma.$executeRaw`
        INSERT INTO template_section_rule_store (template_code, rules_json, updated_at, created_at)
        VALUES (${code}, ${jsonValue}::jsonb, NOW(), NOW())
        ON CONFLICT (template_code)
        DO UPDATE SET rules_json = EXCLUDED.rules_json, updated_at = NOW()
    `;
}

async function replaceTemplateSectionRules(byCode = {}) {
    await ensureTemplateSectionRulesTable();

    const entries = Object.entries(byCode || {})
        .map(([code, rule]) => [parseTemplateCodeFromRuleKey(code), normalizeSectionRuleInput(rule || {})])
        .filter(([code]) => Number.isInteger(code) && code > 0);

    await prisma.$executeRawUnsafe(`DELETE FROM template_section_rule_store`);

    for (const [code, rule] of entries) {
        // eslint-disable-next-line no-await-in-loop
        await saveTemplateSectionRule(code, rule);
    }
}

async function loadTemplateHtmlMap() {
    await ensureTemplateHtmlStoreTable();
    const rows = await prisma.$queryRawUnsafe(`
        SELECT template_id AS "templateId", html_content AS "htmlContent", updated_at AS "htmlUpdatedAt"
        FROM template_html_store
    `);
    const map = new Map();
    for (const row of rows || []) {
        map.set(String(row.templateId || ""), {
            htmlContent: String(row.htmlContent || ""),
            htmlUpdatedAt: row.htmlUpdatedAt || null
        });
    }
    return map;
}

function mapTemplate(template, htmlMap = null, sectionRulesByCodeMap = null) {
    const htmlRecord = htmlMap?.get(String(template.id || "")) || null;
    const htmlContent = String(htmlRecord?.htmlContent || "");
    const sectionRuleRecord = sectionRulesByCodeMap?.get(String(template.code || "")) || null;
    return {
        id: template.id,
        code: template.code,
        name: template.name,
        isMain: template.isMain,
        isActive: template.isActive,
        htmlContent,
        hasHtmlContent: Boolean(htmlContent.trim()),
        htmlUpdatedAt: htmlRecord?.htmlUpdatedAt || null,
        sectionRule: sectionRuleRecord?.rules || null,
        sectionRuleUpdatedAt: sectionRuleRecord?.updatedAt || null,
        sortOrder: template.sortOrder,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt
    };
}

function mapArea(area) {
    return {
        id: area.id,
        code: area.code,
        name: area.name,
        isActive: area.isActive,
        createdAt: area.createdAt,
        updatedAt: area.updatedAt
    };
}

function mapMarket(market) {
    return {
        id: market.id,
        code: market.code,
        name: market.name,
        type: market.type,
        areaId: market.areaId,
        areaCode: market.area?.code || "",
        areaName: market.area?.name || "",
        isActive: market.isActive,
        createdAt: market.createdAt,
        updatedAt: market.updatedAt
    };
}

function mapSourceCampaign(source) {
    return {
        id: source.id,
        name: source.name,
        requestId: source.requestId,
        previewLink: source.previewLink,
        templateMasterId: source.templateMasterId,
        templateName: source.templateMaster?.name || "",
        areaMasterId: source.areaMasterId,
        areaName: source.areaMaster?.name || "",
        marketMasterId: source.marketMasterId,
        marketName: source.marketMaster?.name || "",
        additionalMarkets: Array.isArray(source.additionalMarkets) ? source.additionalMarkets : [],
        isActive: source.isActive,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt
    };
}

function normalizeRequestKey(value) {
    return String(value || "").trim().toLowerCase();
}

function sourceFingerprint(source) {
    if (!source) return "";
    const additionalMarkets = Array.isArray(source.additionalMarkets)
        ? [...source.additionalMarkets].map((entry) => normalizeName(entry).toLowerCase()).filter(Boolean).sort()
        : [];

    return [
        normalizeName(source.name).toLowerCase(),
        String(source.templateMasterId || "").trim(),
        String(source.areaMasterId || "").trim(),
        String(source.marketMasterId || "").trim(),
        additionalMarkets.join("|")
    ].join("::");
}

async function saveTemplateHtml(templateId, htmlContent) {
    await ensureTemplateHtmlStoreTable();
    const normalizedHtml = String(htmlContent || "");

    if (!normalizedHtml.trim()) {
        await prisma.$executeRaw`
            DELETE FROM template_html_store
            WHERE template_id = ${templateId}
        `;
        return;
    }

    await prisma.$executeRaw`
        INSERT INTO template_html_store (template_id, html_content, updated_at, created_at)
        VALUES (${templateId}, ${normalizedHtml}, NOW(), NOW())
        ON CONFLICT (template_id)
        DO UPDATE SET html_content = EXCLUDED.html_content, updated_at = NOW()
    `;
}

async function resolveTemplateHtmlFromArchive(templateId) {
    const candidates = await prisma.sourceCampaignMaster.findMany({
        where: {
            templateMasterId: templateId,
            isActive: true,
            previewLink: { not: null }
        },
        select: {
            id: true,
            name: true,
            requestId: true,
            previewLink: true,
            updatedAt: true,
            createdAt: true
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    for (const candidate of candidates) {
        const previewLink = String(candidate.previewLink || "").trim();
        if (!previewLink) continue;

        // Find first working archive preview and use it as canonical HTML snapshot.
        // eslint-disable-next-line no-await-in-loop
        const payload = await fetchPreviewHtml(previewLink);
        if (payload?.broken || !payload?.html) continue;

        return {
            htmlContent: String(payload.html),
            sourceCampaignId: candidate.id,
            sourceCampaignName: candidate.name || "",
            requestId: candidate.requestId || "",
            previewLink
        };
    }

    return null;
}

router.get("/templates", requireAuth("settings:view"), async (_req, res) => {
    try {
        await ensureDefaultTemplates();
        const [templates, htmlMap, sectionRulesByCodeMap] = await Promise.all([
            prisma.templateMaster.findMany({
                orderBy: [{ code: "asc" }]
            }),
            loadTemplateHtmlMap(),
            loadTemplateSectionRulesByCodeMap()
        ]);
        res.json({ templates: templates.map((template) => mapTemplate(template, htmlMap, sectionRulesByCodeMap)) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Template settings API failed." });
    }
});

async function readTemplateSectionRulesResponse(res) {
    const rulesMap = await loadTemplateSectionRulesByCodeMap();
    const byCode = {};
    const updatedAtByCode = {};
    for (const [code, record] of rulesMap.entries()) {
        byCode[code] = record?.rules || null;
        if (record?.updatedAt) {
            updatedAtByCode[code] = record.updatedAt;
        }
    }
    res.json({
        defaultRules: TEMPLATE_SECTION_RULE_DEFAULT,
        byCode,
        updatedAtByCode
    });
}

async function saveTemplateSectionRulesResponse(req, res) {
    const byCodePayload = (req.body && typeof req.body.byCode === "object" && req.body.byCode !== null)
        ? req.body.byCode
        : null;
    if (!byCodePayload) {
        return res.status(400).json({ error: "byCode object is required." });
    }

    await replaceTemplateSectionRules(byCodePayload);
    await readTemplateSectionRulesResponse(res);
}

router.get("/templates/section-rules", requireAuth("settings:view"), async (_req, res) => {
    try {
        await readTemplateSectionRulesResponse(res);
    } catch (error) {
        res.status(500).json({ error: error.message || "Template section rules API failed." });
    }
});

router.patch("/templates/section-rules", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        await saveTemplateSectionRulesResponse(req, res);
    } catch (error) {
        res.status(500).json({ error: error.message || "Template section rules save failed." });
    }
});

// Alias endpoint to avoid any ambiguity with /templates/:id matching.
router.get("/template-section-rules", requireAuth("settings:view"), async (_req, res) => {
    try {
        await readTemplateSectionRulesResponse(res);
    } catch (error) {
        res.status(500).json({ error: error.message || "Template section rules API failed." });
    }
});

router.patch("/template-section-rules", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        await saveTemplateSectionRulesResponse(req, res);
    } catch (error) {
        res.status(500).json({ error: error.message || "Template section rules save failed." });
    }
});

router.post("/templates/import-from-archive", requireAuth("settings:manage_users"), async (_req, res) => {
    try {
        await ensureDefaultTemplates();
        const templates = await prisma.templateMaster.findMany({
            orderBy: [{ code: "asc" }]
        });

        const summary = [];

        for (const template of templates) {
            // eslint-disable-next-line no-await-in-loop
            const resolved = await resolveTemplateHtmlFromArchive(template.id);
            if (!resolved?.htmlContent) {
                summary.push({
                    templateId: template.id,
                    templateCode: template.code,
                    status: "skipped",
                    reason: "No working archive preview found."
                });
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            await saveTemplateHtml(template.id, resolved.htmlContent);
            summary.push({
                templateId: template.id,
                templateCode: template.code,
                status: "imported",
                sourceCampaignId: resolved.sourceCampaignId,
                sourceCampaignName: resolved.sourceCampaignName,
                requestId: resolved.requestId,
                previewLink: resolved.previewLink
            });
        }

        const [htmlMap, sectionRulesByCodeMap] = await Promise.all([
            loadTemplateHtmlMap(),
            loadTemplateSectionRulesByCodeMap()
        ]);
        const refreshedTemplates = await prisma.templateMaster.findMany({
            orderBy: [{ code: "asc" }]
        });

        res.json({
            ok: true,
            summary,
            templates: refreshedTemplates.map((template) => mapTemplate(template, htmlMap, sectionRulesByCodeMap))
        });
    } catch (error) {
        res.status(500).json({ error: error.message || "Template archive import failed." });
    }
});

router.post("/templates/:id/import-from-archive", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Template id is required." });

        const template = await prisma.templateMaster.findUnique({ where: { id } });
        if (!template) return res.status(404).json({ error: "Template not found." });

        const resolved = await resolveTemplateHtmlFromArchive(template.id);
        if (!resolved?.htmlContent) {
            return res.status(404).json({ error: "No working archive preview found for this template." });
        }

        await saveTemplateHtml(template.id, resolved.htmlContent);
        const [htmlMap, sectionRulesByCodeMap] = await Promise.all([
            loadTemplateHtmlMap(),
            loadTemplateSectionRulesByCodeMap()
        ]);

        res.json({
            ok: true,
            template: mapTemplate(template, htmlMap, sectionRulesByCodeMap),
            importedFrom: {
                sourceCampaignId: resolved.sourceCampaignId,
                sourceCampaignName: resolved.sourceCampaignName,
                requestId: resolved.requestId,
                previewLink: resolved.previewLink
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message || "Template archive import failed." });
    }
});

router.patch("/templates/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Template id is required." });

        const current = await prisma.templateMaster.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: "Template not found." });

        const updates = {};
        if (req.body?.name !== undefined) {
            const expectedName = `Template ${current.code}`;
            const requestedName = String(req.body.name || "").trim();
            if (requestedName && requestedName !== expectedName) {
                return res.status(400).json({ error: "Template names are fixed to Template 1 through Template 6." });
            }
            updates.name = expectedName;
        }
        if (typeof req.body?.isActive === "boolean") {
            updates.isActive = req.body.isActive;
        }
        const htmlContentProvided = req.body?.htmlContent !== undefined;
        const nextHtmlContent = htmlContentProvided ? String(req.body.htmlContent || "") : null;
        if (typeof req.body?.sortOrder === "number") {
            updates.sortOrder = req.body.sortOrder;
        }

        const nextCode = current.code;
        if (typeof req.body?.isMain === "boolean" && req.body.isMain) {
            if (nextCode !== 1) {
                return res.status(400).json({ error: "Only Template 1 can be main template." });
            }
            updates.isMain = true;
        }

        const updated = await prisma.templateMaster.update({
            where: { id },
            data: updates
        });

        if (htmlContentProvided) {
            await saveTemplateHtml(id, nextHtmlContent || "");
        }

        await prisma.templateMaster.updateMany({
            where: { code: { not: 1 }, isMain: true },
            data: { isMain: false }
        });
        await prisma.templateMaster.updateMany({
            where: { code: 1 },
            data: { isMain: true }
        });

        const [htmlMap, sectionRulesByCodeMap] = await Promise.all([
            loadTemplateHtmlMap(),
            loadTemplateSectionRulesByCodeMap()
        ]);
        res.json({ template: mapTemplate(updated, htmlMap, sectionRulesByCodeMap) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Template settings API failed." });
    }
});

router.delete("/templates/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Template id is required." });

        const current = await prisma.templateMaster.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: "Template not found." });
        if (current.code === 1) {
            return res.status(400).json({ error: "Template 1 is locked and cannot be deleted." });
        }

        const archived = await prisma.templateMaster.update({
            where: { id },
            data: { isActive: false }
        });

        await ensureTemplateHtmlStoreTable();
        await prisma.$executeRaw`
            DELETE FROM template_html_store
            WHERE template_id = ${id}
        `;

        const [htmlMap, sectionRulesByCodeMap] = await Promise.all([
            loadTemplateHtmlMap(),
            loadTemplateSectionRulesByCodeMap()
        ]);
        res.json({ template: mapTemplate(archived, htmlMap, sectionRulesByCodeMap), ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message || "Template delete failed." });
    }
});

router.get("/source-campaigns", requireAuth("settings:view"), async (_req, res) => {
    try {
        const sourceCampaigns = await prisma.sourceCampaignMaster.findMany({
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true
            },
            orderBy: [{ createdAt: "desc" }]
        });
        res.json({ sourceCampaigns: sourceCampaigns.map(mapSourceCampaign) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Source campaign API failed." });
    }
});

router.post("/source-campaigns", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        if (!name) return res.status(400).json({ error: "Source campaign name is required." });

        const requestId = String(req.body?.requestId || "").trim();
        const previewLink = String(req.body?.previewLink || "").trim();
        const templateMasterId = String(req.body?.templateMasterId || "").trim() || null;
        const areaMasterId = String(req.body?.areaMasterId || "").trim() || null;
        const marketMasterId = String(req.body?.marketMasterId || "").trim() || null;
        const additionalMarkets = normalizeStringArray(req.body?.additionalMarkets);
        const isActive = toBoolean(req.body?.isActive, true);

        const created = await prisma.sourceCampaignMaster.create({
            data: {
                name,
                requestId: requestId || null,
                previewLink: previewLink || null,
                templateMasterId,
                areaMasterId,
                marketMasterId,
                additionalMarkets,
                isActive
            },
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true
            }
        });

        res.json({ sourceCampaign: mapSourceCampaign(created) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Source campaign API failed." });
    }
});

router.patch("/source-campaigns/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Source campaign id is required." });

        const current = await prisma.sourceCampaignMaster.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: "Source campaign not found." });

        const updates = {};
        if (typeof req.body?.name === "string") {
            const name = req.body.name.trim();
            if (!name) return res.status(400).json({ error: "Source campaign name is required." });
            updates.name = name;
        }
        if (req.body?.requestId !== undefined) updates.requestId = String(req.body.requestId || "").trim() || null;
        if (req.body?.previewLink !== undefined) updates.previewLink = String(req.body.previewLink || "").trim() || null;
        if (req.body?.templateMasterId !== undefined) updates.templateMasterId = String(req.body.templateMasterId || "").trim() || null;
        if (req.body?.areaMasterId !== undefined) updates.areaMasterId = String(req.body.areaMasterId || "").trim() || null;
        if (req.body?.marketMasterId !== undefined) updates.marketMasterId = String(req.body.marketMasterId || "").trim() || null;
        if (req.body?.additionalMarkets !== undefined) updates.additionalMarkets = normalizeStringArray(req.body.additionalMarkets);
        if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;

        const updated = await prisma.sourceCampaignMaster.update({
            where: { id },
            data: updates,
            include: {
                templateMaster: true,
                areaMaster: true,
                marketMaster: true
            }
        });

        res.json({ sourceCampaign: mapSourceCampaign(updated) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Source campaign API failed." });
    }
});

router.delete("/source-campaigns/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Source campaign id is required." });

        await prisma.sourceCampaignMaster.delete({ where: { id } });
        res.json({ ok: true });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Source campaign not found." });
        res.status(500).json({ error: error.message || "Source campaign delete failed." });
    }
});

router.get("/areas", requireAuth("settings:view"), async (_req, res) => {
    try {
        const areas = await prisma.areaMaster.findMany({
            orderBy: [{ code: "asc" }, { name: "asc" }]
        });
        res.json({ areas: areas.map(mapArea) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Area settings API failed." });
    }
});

router.post("/areas", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const code = normalizeCode(req.body?.code);
        const name = String(req.body?.name || "").trim();
        const isActive = toBoolean(req.body?.isActive, true);

        if (!code || !name) return res.status(400).json({ error: "code and name are required." });

        const area = await prisma.areaMaster.create({
            data: { code, name, isActive }
        });

        res.json({ area: mapArea(area) });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Area code already exists." });
        res.status(500).json({ error: error.message || "Area settings API failed." });
    }
});

router.patch("/areas/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Area id is required." });

        const updates = {};
        if (req.body?.code !== undefined) updates.code = normalizeCode(req.body.code);
        if (req.body?.name !== undefined) updates.name = String(req.body.name || "").trim();
        if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;

        const updated = await prisma.areaMaster.update({
            where: { id },
            data: updates
        });

        res.json({ area: mapArea(updated) });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Area code already exists." });
        res.status(500).json({ error: error.message || "Area settings API failed." });
    }
});

router.delete("/areas/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Area id is required." });

        await prisma.areaMaster.delete({ where: { id } });
        res.json({ ok: true });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Area not found." });
        if (error.code === "P2003") return res.status(409).json({ error: "Area is still referenced and cannot be deleted." });
        res.status(500).json({ error: error.message || "Area delete failed." });
    }
});

router.get("/markets", requireAuth("settings:view"), async (_req, res) => {
    try {
        const markets = await prisma.marketMaster.findMany({
            include: { area: true },
            orderBy: [{ code: "asc" }, { name: "asc" }]
        });
        res.json({ markets: markets.map(mapMarket) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Market settings API failed." });
    }
});

router.post("/markets", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const code = normalizeCode(req.body?.code);
        const name = String(req.body?.name || "").trim();
        const type = String(req.body?.type || "MARKET").trim().toUpperCase();
        const areaId = String(req.body?.areaId || "").trim() || null;
        const isActive = toBoolean(req.body?.isActive, true);

        if (!code || !name) return res.status(400).json({ error: "code and name are required." });
        if (!MARKET_TYPES.has(type)) return res.status(400).json({ error: "Invalid market type." });

        const market = await prisma.marketMaster.create({
            data: {
                code,
                name,
                type,
                areaId,
                isActive
            },
            include: { area: true }
        });

        res.json({ market: mapMarket(market) });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Market code already exists." });
        res.status(500).json({ error: error.message || "Market settings API failed." });
    }
});

router.patch("/markets/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Market id is required." });

        const updates = {};
        if (req.body?.code !== undefined) updates.code = normalizeCode(req.body.code);
        if (req.body?.name !== undefined) updates.name = String(req.body.name || "").trim();
        if (req.body?.type !== undefined) {
            const type = String(req.body.type || "").trim().toUpperCase();
            if (!MARKET_TYPES.has(type)) return res.status(400).json({ error: "Invalid market type." });
            updates.type = type;
        }
        if (req.body?.areaId !== undefined) updates.areaId = String(req.body.areaId || "").trim() || null;
        if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;

        const updated = await prisma.marketMaster.update({
            where: { id },
            data: updates,
            include: { area: true }
        });

        res.json({ market: mapMarket(updated) });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Market code already exists." });
        res.status(500).json({ error: error.message || "Market settings API failed." });
    }
});

router.delete("/markets/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Market id is required." });

        await prisma.marketMaster.delete({ where: { id } });
        res.json({ ok: true });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Market not found." });
        if (error.code === "P2003") return res.status(409).json({ error: "Market is still referenced and cannot be deleted." });
        res.status(500).json({ error: error.message || "Market delete failed." });
    }
});

router.post("/seed-from-archive", requireAuth("settings:manage_users"), async (_req, res) => {
    try {
        await ensureDefaultTemplates();

        const [{ allRows }, templates, existingAreas, existingMarkets, existingSources] = await Promise.all([
            fetchAllArchiveRows(),
            prisma.templateMaster.findMany(),
            prisma.areaMaster.findMany(),
            prisma.marketMaster.findMany(),
            prisma.sourceCampaignMaster.findMany()
        ]);

        const templateByCode = new Map(templates.map((template) => [template.code, template]));
        const areaByCode = new Map(existingAreas.map((area) => [area.code, area]));
        const marketByKey = new Map(existingMarkets.map((market) => [`${market.type}:${normalizeName(market.name).toLowerCase()}`, market]));
        const sourceByRequestId = new Map(existingSources
            .filter((source) => source.requestId)
            .map((source) => [normalizeRequestKey(source.requestId), source]));
        const sourceByFingerprint = new Map(
            existingSources
                .map((source) => [sourceFingerprint(source), source])
                .filter(([fingerprint]) => Boolean(fingerprint))
        );
        const usedMarketCodes = new Set(existingMarkets.map((market) => market.code));

        const counters = {
            rowsRead: allRows.length,
            campaignsProcessed: 0,
            areasCreated: 0,
            marketsCreated: 0,
            additionalMarketsCreated: 0,
            sourceCampaignsCreated: 0,
            sourceCampaignsUpdated: 0
        };

        function generateMarketCode(baseName, type) {
            const prefix = type === "ADDITIONAL_MARKET" ? "AM_" : "M_";
            const base = normalizeCode(baseName).replace(/^_+|_+$/g, "").slice(0, 40);
            const stem = `${prefix}${base || "ITEM"}`;
            let candidate = stem;
            let index = 2;
            while (usedMarketCodes.has(candidate)) {
                candidate = `${stem}_${index}`;
                index += 1;
            }
            usedMarketCodes.add(candidate);
            return candidate;
        }

        async function ensureArea(areaRaw) {
            const parsed = parseAreaValue(areaRaw);
            if (!parsed.code) return null;

            const existing = areaByCode.get(parsed.code);
            if (existing) return existing;

            const created = await prisma.areaMaster.create({
                data: {
                    code: parsed.code,
                    name: parsed.name || parsed.code,
                    isActive: true
                }
            });
            counters.areasCreated += 1;
            areaByCode.set(created.code, created);
            return created;
        }

        async function ensureMarket(nameRaw, type, areaId) {
            const name = normalizeName(nameRaw);
            if (!name) return null;

            const key = `${type}:${name.toLowerCase()}`;
            const existing = marketByKey.get(key);
            if (existing) {
                if (areaId && !existing.areaId) {
                    const updated = await prisma.marketMaster.update({
                        where: { id: existing.id },
                        data: { areaId }
                    });
                    marketByKey.set(key, updated);
                    return updated;
                }
                return existing;
            }

            const created = await prisma.marketMaster.create({
                data: {
                    code: generateMarketCode(name, type),
                    name,
                    type,
                    areaId: areaId || null,
                    isActive: true
                }
            });

            if (type === "ADDITIONAL_MARKET") {
                counters.additionalMarketsCreated += 1;
            } else {
                counters.marketsCreated += 1;
            }

            marketByKey.set(key, created);
            return created;
        }

        for (const row of allRows) {
            const email = parseSmartsheetRow(row);
            if (String(email.status || "").trim().toLowerCase() !== "deployed") continue;
            const date = parseDateValue(email);
            if (!date || date.getFullYear() < 2026) continue;

            const campaignName = normalizeName(email.campaignName);
            if (!campaignName) continue;

            counters.campaignsProcessed += 1;

            const area = await ensureArea(email.area);
            const primaryMarket = await ensureMarket(email.targetMarket, "MARKET", area?.id || null);
            const additionalMarkets = splitAdditionalMarkets(email.additionalTargetMarkets);

            for (const additionalMarketName of additionalMarkets) {
                await ensureMarket(additionalMarketName, "ADDITIONAL_MARKET", area?.id || null);
            }

            const templateCode = parseTemplateCode(email.emailTemplate);
            const template = templateCode ? templateByCode.get(templateCode) : null;
            const requestId = normalizeName(email.requestId);
            const sourceData = {
                name: campaignName,
                requestId: requestId || null,
                previewLink: normalizeName(email.previewLink) || null,
                templateMasterId: template?.id || null,
                areaMasterId: area?.id || null,
                marketMasterId: primaryMarket?.id || null,
                additionalMarkets,
                isActive: true
            };

            const fingerprint = sourceFingerprint(sourceData);

            if (requestId) {
                const requestKey = normalizeRequestKey(requestId);
                const existingSource = sourceByRequestId.get(requestKey);
                if (existingSource) {
                    const updated = await prisma.sourceCampaignMaster.update({
                        where: { id: existingSource.id },
                        data: sourceData
                    });
                    sourceByRequestId.set(requestKey, updated);
                    sourceByFingerprint.set(sourceFingerprint(updated), updated);
                    counters.sourceCampaignsUpdated += 1;
                    continue;
                }
            }

            const existingByFingerprint = fingerprint ? sourceByFingerprint.get(fingerprint) : null;
            if (existingByFingerprint) {
                const updated = await prisma.sourceCampaignMaster.update({
                    where: { id: existingByFingerprint.id },
                    data: sourceData
                });
                if (requestId) {
                    sourceByRequestId.set(normalizeRequestKey(requestId), updated);
                }
                sourceByFingerprint.set(sourceFingerprint(updated), updated);
                counters.sourceCampaignsUpdated += 1;
                continue;
            }

            const created = await prisma.sourceCampaignMaster.create({ data: sourceData });
            if (requestId) {
                sourceByRequestId.set(normalizeRequestKey(requestId), created);
            }
            sourceByFingerprint.set(sourceFingerprint(created), created);
            counters.sourceCampaignsCreated += 1;
        }

        res.json({
            ok: true,
            summary: counters
        });
    } catch (error) {
        res.status(500).json({ error: error.message || "Seed from archive failed." });
    }
});

router.get("/seed-audit", requireAuth("settings:manage_users"), async (_req, res) => {
    try {
        const [templates, areas, markets, sources] = await Promise.all([
            prisma.templateMaster.findMany(),
            prisma.areaMaster.findMany(),
            prisma.marketMaster.findMany(),
            prisma.sourceCampaignMaster.findMany()
        ]);

        const additionalMarketSet = new Set(
            markets
                .filter((market) => market.type === "ADDITIONAL_MARKET")
                .map((market) => normalizeName(market.name).toLowerCase())
                .filter(Boolean)
        );

        const requestCounter = new Map();
        const fingerprintCounter = new Map();

        for (const source of sources) {
            const requestKey = normalizeRequestKey(source.requestId);
            if (requestKey) {
                requestCounter.set(requestKey, (requestCounter.get(requestKey) || 0) + 1);
            }

            const fingerprint = sourceFingerprint(source);
            if (fingerprint) {
                fingerprintCounter.set(fingerprint, (fingerprintCounter.get(fingerprint) || 0) + 1);
            }
        }

        const duplicateRequestIds = Array.from(requestCounter.entries())
            .filter(([, count]) => count > 1)
            .map(([requestId, count]) => ({ requestId, count }))
            .sort((a, b) => b.count - a.count);

        const duplicateFingerprints = Array.from(fingerprintCounter.entries())
            .filter(([, count]) => count > 1)
            .map(([fingerprint, count]) => ({ fingerprint, count }))
            .sort((a, b) => b.count - a.count);

        let sourcesMissingTemplate = 0;
        let sourcesMissingArea = 0;
        let sourcesMissingMarket = 0;
        let sourcesMissingPreview = 0;
        let invalidAdditionalMarketRefs = 0;
        const invalidAdditionalMarketNames = new Set();

        for (const source of sources) {
            if (!source.templateMasterId) sourcesMissingTemplate += 1;
            if (!source.areaMasterId) sourcesMissingArea += 1;
            if (!source.marketMasterId) sourcesMissingMarket += 1;
            if (!normalizeName(source.previewLink)) sourcesMissingPreview += 1;

            const additionalMarkets = normalizeStringArray(source.additionalMarkets);
            for (const marketName of additionalMarkets) {
                const key = normalizeName(marketName).toLowerCase();
                if (!key) continue;
                if (!additionalMarketSet.has(key)) {
                    invalidAdditionalMarketRefs += 1;
                    invalidAdditionalMarketNames.add(normalizeName(marketName));
                }
            }
        }

        const checks = [
            {
                key: "duplicate-request-id",
                title: "Duplicate request IDs",
                status: duplicateRequestIds.length === 0 ? "pass" : "warn",
                count: duplicateRequestIds.length
            },
            {
                key: "duplicate-source-fingerprint",
                title: "Duplicate source fingerprints",
                status: duplicateFingerprints.length === 0 ? "pass" : "warn",
                count: duplicateFingerprints.length
            },
            {
                key: "missing-template-link",
                title: "Sources missing template mapping",
                status: sourcesMissingTemplate === 0 ? "pass" : "warn",
                count: sourcesMissingTemplate
            },
            {
                key: "missing-area-link",
                title: "Sources missing area mapping",
                status: sourcesMissingArea === 0 ? "pass" : "warn",
                count: sourcesMissingArea
            },
            {
                key: "missing-market-link",
                title: "Sources missing market mapping",
                status: sourcesMissingMarket === 0 ? "pass" : "warn",
                count: sourcesMissingMarket
            },
            {
                key: "invalid-additional-market",
                title: "Invalid additional market references",
                status: invalidAdditionalMarketRefs === 0 ? "pass" : "warn",
                count: invalidAdditionalMarketRefs
            }
        ];

        const hasFailures = checks.some((check) => check.status !== "pass");

        res.json({
            ok: true,
            healthy: !hasFailures,
            checkedAt: new Date().toISOString(),
            summary: {
                templates: templates.length,
                activeTemplates: templates.filter((item) => item.isActive).length,
                areas: areas.length,
                activeAreas: areas.filter((item) => item.isActive).length,
                markets: markets.filter((item) => item.type === "MARKET").length,
                additionalMarkets: markets.filter((item) => item.type === "ADDITIONAL_MARKET").length,
                sources: sources.length,
                activeSources: sources.filter((item) => item.isActive).length,
                sourcesMissingPreview
            },
            checks,
            issues: {
                duplicateRequestIds: duplicateRequestIds.slice(0, 20),
                duplicateFingerprints: duplicateFingerprints.slice(0, 20),
                invalidAdditionalMarketNames: Array.from(invalidAdditionalMarketNames).sort().slice(0, 50)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message || "Seed audit failed." });
    }
});

module.exports = router;
