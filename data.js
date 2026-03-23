/*
 * SMARTSHEET DATA FETCHER WITH LOCAL CACHE
 * =========================================
 * Caches data in localStorage for instant loads.
 * Checks for new data in the background and refreshes if needed.
 */

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const FIELD_MAP = {
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

const CACHE_KEY = "edm_email_data";
const CACHE_META_KEY = "edm_cache_meta";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours max before forced refresh

let EMAIL_DATA = {};
let DATA_LOADED = false;

function parseRow(row) {
    const obj = {};
    for (const cell of row.cells) {
        const field = FIELD_MAP[cell.columnId];
        if (field) obj[field] = cell.displayValue || cell.value || "";
    }
    return obj;
}

function deriveDateInfo(record) {
    const dateStr = record.earliestDeploymentDate
        || record.latestDeploymentDate
        || record.requestDate
        || "";
    if (!dateStr) return { year: null, month: "" };
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return { year: null, month: "" };
    return {
        year: parsed.getFullYear(),
        month: MONTH_NAMES[parsed.getMonth()]
    };
}

async function fetchPage(page, pageSize) {
    const resp = await fetch(`/.netlify/functions/smartsheet?pageSize=${pageSize}&page=${page}`);
    if (!resp.ok) throw new Error("API error: " + resp.status);
    return resp.json();
}

// ---- Cache helpers ----

function loadFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const meta = localStorage.getItem(CACHE_META_KEY);
        if (!cached || !meta) return null;

        const metaData = JSON.parse(meta);
        return {
            data: JSON.parse(cached),
            rowCount: metaData.rowCount,
            timestamp: metaData.timestamp
        };
    } catch (e) {
        return null;
    }
}

function saveToCache(data, rowCount) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_META_KEY, JSON.stringify({
            rowCount: rowCount,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn("Could not save to cache:", e);
    }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_META_KEY);
}

// ---- Process raw rows into EMAIL_DATA ----

function processRows(pages) {
    const data = {};

    for (const page of pages) {
        for (const row of (page.rows || [])) {
            const record = parseRow(row);
            if (record.status !== "Deployed") continue;

            const { year, month } = deriveDateInfo(record);
            if (!year || year < 2026) continue;

            record.month = month;
            if (!data[year]) data[year] = [];
            data[year].push(record);
        }
    }

    // Sort by month order
    Object.keys(data).forEach(year => {
        data[year].sort((a, b) =>
            MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month)
        );
    });

    return data;
}

// ---- Full fetch from Smartsheet ----

async function fetchAllFromSmartsheet() {
    const PAGE_SIZE = 500;

    const meta = await fetchPage(1, 1);
    const totalRows = meta.totalRowCount || 0;
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);

    const promises = [];
    for (let p = 1; p <= totalPages; p++) {
        promises.push(fetchPage(p, PAGE_SIZE));
    }
    const pages = await Promise.all(promises);

    return { pages, totalRows };
}

// ---- Main loader ----

async function loadSmartsheetData() {
    try {
        const cache = loadFromCache();
        const cacheAge = cache ? Date.now() - cache.timestamp : Infinity;
        const cacheExpired = cacheAge > CACHE_MAX_AGE;

        // Step 1: If we have a valid cache, use it immediately
        if (cache && !cacheExpired) {
            EMAIL_DATA = cache.data;
            DATA_LOADED = true;
            console.log("Loaded from cache:", Object.keys(EMAIL_DATA).map(y => `${y}: ${EMAIL_DATA[y].length} emails`).join(", "));

            // Step 2: Check in background if data changed
            checkForUpdates(cache.rowCount);
            return;
        }

        // No cache or expired — fetch everything
        console.log(cacheExpired ? "Cache expired, fetching fresh data..." : "No cache found, fetching from Smartsheet...");
        const { pages, totalRows } = await fetchAllFromSmartsheet();
        EMAIL_DATA = processRows(pages);

        // Check preview URLs
        await checkPreviewUrls();

        // Save to cache
        saveToCache(EMAIL_DATA, totalRows);

        DATA_LOADED = true;
        console.log("Smartsheet data loaded:", Object.keys(EMAIL_DATA).map(y => `${y}: ${EMAIL_DATA[y].length} emails`).join(", "));

    } catch (err) {
        console.error("Failed to load Smartsheet data:", err);

        // If fetch fails but we have a stale cache, use it
        const cache = loadFromCache();
        if (cache) {
            EMAIL_DATA = cache.data;
            DATA_LOADED = true;
            console.log("Using stale cache as fallback");
        } else {
            DATA_LOADED = false;
        }
    }
}

// ---- Background update check ----

async function checkForUpdates(cachedRowCount) {
    try {
        const meta = await fetchPage(1, 1);
        const currentRows = meta.totalRowCount || 0;

        if (currentRows !== cachedRowCount) {
            console.log(`Data changed (${cachedRowCount} → ${currentRows} rows). Refreshing...`);

            const { pages, totalRows } = await fetchAllFromSmartsheet();
            EMAIL_DATA = processRows(pages);

            await checkPreviewUrls();
            saveToCache(EMAIL_DATA, totalRows);

            console.log("Data refreshed:", Object.keys(EMAIL_DATA).map(y => `${y}: ${EMAIL_DATA[y].length} emails`).join(", "));

            // Update year dropdown with any new years
            if (typeof populateYearFilter === "function") populateYearFilter();

            // If user is viewing a year, re-render
            if (typeof currentYear !== "undefined" && currentYear !== null) {
                applyFilters();
            }
        } else {
            console.log("Data unchanged, using cache");
            // Still check preview URLs in background (they can change)
            checkPreviewUrls().then(() => {
                if (typeof currentYear !== "undefined" && currentYear !== null) {
                    applyFilters();
                }
            });
        }
    } catch (e) {
        console.warn("Background update check failed:", e);
    }
}

/**
 * Check each preview URL via the check-url function.
 * Marks broken ones with _brokenPreview = true.
 */
async function checkPreviewUrls() {
    const allEmails = Object.values(EMAIL_DATA).flat();
    const toCheck = allEmails.filter(e => e.previewLink && e.previewLink.trim());

    const checks = toCheck.map(email =>
        fetch(`/.netlify/functions/check-url?url=${encodeURIComponent(email.previewLink)}`)
            .then(r => r.json())
            .then(data => {
                if (!data.status || data.status >= 400) {
                    email._brokenPreview = true;
                }
            })
            .catch(() => { email._brokenPreview = true; })
    );

    await Promise.all(checks);

    const broken = allEmails.filter(e => e._brokenPreview).length;
    if (broken > 0) console.log(`Marked ${broken} broken preview link(s)`);
}

/**
 * Force refresh — clears cache and reloads from Smartsheet.
 * Can be called from the UI or console.
 */
async function forceRefreshData() {
    showLoading("Syncing data from Smartsheet...");
    clearCache();
    EMAIL_DATA = {};
    DATA_LOADED = false;
    await loadSmartsheetData();
    hideLoading();
    if (typeof populateYearFilter === "function") populateYearFilter();
    if (typeof currentYear !== "undefined" && currentYear !== null) {
        populateFilters();
        updateMonthPills();
        applyFilters();
    }
}

loadSmartsheetData();
