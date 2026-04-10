import { apiRequest } from "./api";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const CACHE_KEY = "edm_archive_data_v4";
const CACHE_META_KEY = "edm_archive_meta_v4";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export const FIELD_MAP = {
    1156879576524676: "requestId",
    6252542022707076: "status",
    4347810907639684: "approval",
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

export function parseRow(row) {
    const out = {};
    for (const cell of row.cells || []) {
        const field = FIELD_MAP[cell.columnId];
        if (field) out[field] = cell.displayValue || cell.value || "";
    }
    return out;
}

function parseDateValue(email) {
    const raw = email.earliestDeploymentDate || email.latestDeploymentDate || email.requestDate || "";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function getMonthName(monthIndex) {
    return MONTH_NAMES[Math.min(11, Math.max(0, monthIndex))] || "";
}

function withDateFields(email) {
    const date = parseDateValue(email);
    if (date.getTime() <= 0) {
        return {
            ...email,
            year: null,
            month: ""
        };
    }

    return {
        ...email,
        year: date.getFullYear(),
        month: getMonthName(date.getMonth())
    };
}

async function fetchPage(page, pageSize) {
    return apiRequest(`/api/smartsheet?page=${page}&pageSize=${pageSize}`);
}

function loadFromCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        const rawMeta = localStorage.getItem(CACHE_META_KEY);
        if (!raw || !rawMeta) return null;
        const emails = JSON.parse(raw);
        const meta = JSON.parse(rawMeta);
        if (!Array.isArray(emails)) return null;
        return { emails, meta };
    } catch (_error) {
        return null;
    }
}

function saveToCache(emails, rowCount) {
    const timestamp = Date.now();
    const meta = { timestamp, rowCount };
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(emails));
        localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
    } catch (_error) {
        // Ignore quota/cache errors to keep UI resilient
    }
    return meta;
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_META_KEY);
}

function buildDatasetResponse(emails, meta, source) {
    const brokenPreviewCount = emails.filter((email) => email._brokenPreview).length;
    const years = [...new Set(emails.map((email) => email.year).filter(Boolean))].sort((a, b) => b - a);
    return {
        emails,
        years,
        meta: {
            source,
            rowCount: meta?.rowCount || emails.length,
            lastSyncedAt: meta?.timestamp || Date.now(),
            cacheAgeMs: meta?.timestamp ? Date.now() - meta.timestamp : 0,
            brokenPreviewCount
        }
    };
}

async function fetchAllFromSmartsheet() {
    const meta = await fetchPage(1, 1);
    const totalRows = meta.totalRowCount || 0;
    const pageSize = 500;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

    const pages = await Promise.all(
        Array.from({ length: totalPages }, (_, index) => fetchPage(index + 1, pageSize))
    );

    const emails = [];
    for (const page of pages) {
        for (const row of page.rows || []) {
            const email = withDateFields(parseRow(row));
            if (email.status !== "Deployed") continue;
            if (!email.year || email.year < 2026) continue;
            emails.push(email);
        }
    }

    emails.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        const aMonth = MONTH_NAMES.indexOf(a.month);
        const bMonth = MONTH_NAMES.indexOf(b.month);
        if (aMonth !== bMonth) return aMonth - bMonth;
        return String(a.requestId || "").localeCompare(String(b.requestId || ""));
    });

    return { emails, rowCount: totalRows };
}

async function checkPreviewUrls(emails, options = {}) {
    const { batchSize = 20, maxChecks = Number.POSITIVE_INFINITY } = options;
    const candidates = emails
        .filter((email) => email.previewLink && String(email.previewLink).trim())
        .slice(0, maxChecks);

    for (const email of emails) {
        delete email._brokenPreview;
    }

    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        await Promise.all(batch.map(async (email) => {
            try {
                const payload = await apiRequest(`/api/check-url?url=${encodeURIComponent(email.previewLink)}`);
                if (payload?.broken || !payload?.status || payload.status >= 400) {
                    email._brokenPreview = true;
                }
            } catch (_error) {
                email._brokenPreview = true;
            }
        }));
    }
}

async function checkForUpdates(cachedRowCount, onUpdate, options = {}) {
    const { validatePreviews = false } = options;
    try {
        const meta = await fetchPage(1, 1);
        const currentRows = meta.totalRowCount || 0;
        if (currentRows === cachedRowCount) return;

        const fresh = await fetchAllFromSmartsheet();
        if (validatePreviews) {
            await checkPreviewUrls(fresh.emails);
        }
        const freshMeta = saveToCache(fresh.emails, fresh.rowCount);
        onUpdate?.(buildDatasetResponse(fresh.emails, freshMeta, "background-refresh"));
    } catch (_error) {
        // Do not block UI on background refresh failures
    }
}

async function refreshPreviewStatuses(cached, onUpdate) {
    try {
        const nextEmails = (cached.emails || []).map((email) => ({ ...email }));
        await checkPreviewUrls(nextEmails);

        let changed = false;
        for (let i = 0; i < nextEmails.length; i += 1) {
            const before = Boolean(cached.emails?.[i]?._brokenPreview);
            const after = Boolean(nextEmails[i]?._brokenPreview);
            if (before !== after) {
                changed = true;
                break;
            }
        }

        if (!changed) return;
        const nextMeta = saveToCache(nextEmails, cached.meta?.rowCount || nextEmails.length);
        onUpdate?.(buildDatasetResponse(nextEmails, nextMeta, "preview-refresh"));
    } catch (_error) {
        // Preview validation is best effort only.
    }
}

export async function loadArchiveDataset(options = {}) {
    const { forceRefresh = false, onBackgroundUpdate, validatePreviews = false } = options;

    if (forceRefresh) clearCache();

    const cached = forceRefresh ? null : loadFromCache();
    if (cached && (Date.now() - (cached.meta?.timestamp || 0)) <= CACHE_MAX_AGE) {
        if (typeof onBackgroundUpdate === "function") {
            void checkForUpdates(cached.meta?.rowCount || 0, onBackgroundUpdate, { validatePreviews });
            void refreshPreviewStatuses(cached, onBackgroundUpdate);
        }
        return buildDatasetResponse(cached.emails, cached.meta, "cache");
    }

    try {
        const fresh = await fetchAllFromSmartsheet();
        if (validatePreviews) {
            await checkPreviewUrls(fresh.emails);
        }
        const freshMeta = saveToCache(fresh.emails, fresh.rowCount);
        return buildDatasetResponse(fresh.emails, freshMeta, "network");
    } catch (error) {
        if (cached) {
            return buildDatasetResponse(cached.emails, cached.meta, "stale-cache");
        }
        throw error;
    }
}

export async function forceRefreshArchiveDataset(options = {}) {
    return loadArchiveDataset({ forceRefresh: true, validatePreviews: true, ...options });
}

export async function loadArchiveEmails() {
    const dataset = await loadArchiveDataset();
    const emails = (dataset?.emails || []).filter(
        (email) => email.previewLink && String(email.previewLink).trim()
    );
    return emails;
}

export function deriveStarterGroups(emails) {
    const grouped = new Map();

    for (const email of emails) {
        const key = [
            email.emailTemplate || "Template Unknown",
            email.campaignType || "General",
            email.targetLanguage || "Any Language"
        ].join(" | ");
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(email);
    }

    const groups = Array.from(grouped.entries()).map(([key, groupEmails]) => ({
        key,
        count: groupEmails.length,
        emails: groupEmails
    }));

    groups.sort((a, b) => b.count - a.count);
    return groups;
}
