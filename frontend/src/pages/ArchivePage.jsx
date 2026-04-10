import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import { forceRefreshArchiveDataset, loadArchiveDataset } from "../archive-utils";
import SearchSelect from "../components/SearchSelect";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const DEVICES = {
    mobile: { width: 375, label: "MOBILE" },
    tablet: { width: 768, label: "TABLET" },
    desktop: { width: 1200, label: "DESKTOP" }
};

function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getAreaClass(area) {
    const code = String(area || "").split(" ")[0].toLowerCase();
    const map = {
        anzp: "area-anzp",
        apec: "area-apec",
        gc: "area-gc",
        im: "area-im",
        jpg: "area-jpg",
        sa: "area-sa",
        skpv: "area-skpv",
        sm: "area-sm"
    };
    return map[code] || "area-other";
}

function highlightText(text, query) {
    const value = String(text || "");
    if (!query) return value;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "ig");
    const parts = value.split(regex);
    return parts.map((part, index) => (
        index % 2 === 1
            ? <mark key={`${part}-${index}`} className="search-highlight">{part}</mark>
            : <span key={`${part}-${index}`}>{part}</span>
    ));
}

function parseAdditionalMarkets(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

export default function ArchivePage() {
    const [emails, setEmails] = useState([]);
    const [years, setYears] = useState([]);
    const [year, setYear] = useState("");
    const [month, setMonth] = useState("all");
    const [selectedAreas, setSelectedAreas] = useState([]);
    const [selectedMarkets, setSelectedMarkets] = useState([]);
    const [previewFilter, setPreviewFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [previewDevice, setPreviewDevice] = useState("desktop");
    const [previewHtml, setPreviewHtml] = useState("");
    const [previewBlocked, setPreviewBlocked] = useState(false);
    const [previewChecking, setPreviewChecking] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewCopyState, setPreviewCopyState] = useState("");
    const [previewError, setPreviewError] = useState("");
    const [previewModal, setPreviewModal] = useState({
        open: false,
        url: "",
        id: "",
        name: ""
    });

    useEffect(() => {
        const savedYear = sessionStorage.getItem("edm_archive_year");
        if (savedYear) setYear(savedYear);
    }, []);

    useEffect(() => {
        async function run() {
            try {
                setLoading(true);
                setError("");
                const dataset = await loadArchiveDataset({
                    validatePreviews: true,
                    onBackgroundUpdate: (nextData) => {
                        setEmails(nextData.emails || []);
                        setYears(nextData.years || []);
                        setMeta(nextData.meta || null);
                        const broken = nextData?.meta?.brokenPreviewCount || 0;
                        setStatus(
                            broken > 0
                                ? `Archive synced. ${broken} preview links are unavailable.`
                                : "Archive synced with latest Smartsheet updates."
                        );
                    }
                });
                setEmails(dataset.emails || []);
                setYears(dataset.years || []);
                setMeta(dataset.meta || null);
                if ((dataset.meta?.brokenPreviewCount || 0) > 0) {
                    setStatus(`Archive synced. ${dataset.meta.brokenPreviewCount} preview links are unavailable.`);
                } else {
                    setStatus("Archive synced with latest Smartsheet updates.");
                }
            } catch (apiError) {
                setError(apiError.message);
            } finally {
                setLoading(false);
            }
        }
        run();
    }, []);

    useEffect(() => {
        if (!years.length) return;
        if (year && years.includes(Number(year))) return;
        setYear(String(years[0]));
    }, [years, year]);

    useEffect(() => {
        if (year) sessionStorage.setItem("edm_archive_year", String(year));
    }, [year]);

    useEffect(() => {
        function onKeyDown(event) {
            const activeTag = document.activeElement?.tagName || "";
            const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";

            if (event.key === "/" && !isTyping) {
                event.preventDefault();
                document.getElementById("archive-search")?.focus();
            }

            if (event.key === "Escape" && document.activeElement?.id === "archive-search") {
                setSearch("");
                document.getElementById("archive-search")?.blur();
            }
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        if (!previewModal.open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [previewModal.open]);

    useEffect(() => {
        function onEscape(event) {
            if (event.key === "Escape" && previewModal.open) {
                closePreview();
            }
        }
        document.addEventListener("keydown", onEscape);
        return () => document.removeEventListener("keydown", onEscape);
    }, [previewModal.open]);

    useEffect(() => {
        let active = true;

        async function loadPreviewHtml() {
            if (!previewModal.open || !previewModal.url) return;
            setPreviewLoading(true);
            setPreviewHtml("");
            setPreviewError("");

            try {
                const payload = await apiRequest(`/api/fetch-html?url=${encodeURIComponent(previewModal.url)}`);
                if (!active) return;
                if (payload?.broken) {
                    setPreviewBlocked(true);
                    setPreviewHtml("");
                    setPreviewError(payload?.error || "Preview unavailable for this link.");
                    return;
                }
                setPreviewHtml(String(payload?.html || ""));
            } catch (_apiError) {
                if (!active) return;
                setPreviewHtml("");
                setPreviewBlocked(false);
                setPreviewError("Unable to fetch HTML. Showing live URL preview.");
            } finally {
                if (!active) return;
                setPreviewLoading(false);
            }
        }

        loadPreviewHtml();
        return () => {
            active = false;
        };
    }, [previewModal.open, previewModal.url]);

    const yearEmails = useMemo(() => {
        if (!year) return [];
        return emails.filter((email) => String(email.year) === String(year));
    }, [emails, year]);

    const areaOptions = useMemo(
        () => [...new Set(yearEmails.map((email) => email.area).filter(Boolean))].sort(),
        [yearEmails]
    );

    const marketOptions = useMemo(() => {
        const values = [];
        for (const email of yearEmails) {
            if (email.targetMarket) values.push(String(email.targetMarket).trim());
            values.push(...parseAdditionalMarkets(email.additionalTargetMarkets));
        }
        return [...new Set(values.filter(Boolean))].sort();
    }, [yearEmails]);

    const monthsWithData = useMemo(() => {
        const set = new Set(yearEmails.map((email) => email.month).filter(Boolean));
        return set;
    }, [yearEmails]);

    useEffect(() => {
        setSelectedAreas((current) => current.filter((value) => areaOptions.includes(value)));
    }, [areaOptions]);

    useEffect(() => {
        setSelectedMarkets((current) => current.filter((value) => marketOptions.includes(value)));
    }, [marketOptions]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return yearEmails.filter((email) => {
            if (selectedAreas.length && !selectedAreas.includes(email.area)) return false;
            if (selectedMarkets.length) {
                const emailMarkets = [
                    String(email.targetMarket || "").trim(),
                    ...parseAdditionalMarkets(email.additionalTargetMarkets)
                ].filter(Boolean);
                const hasSelectedMarket = selectedMarkets.some((market) => emailMarkets.includes(market));
                if (!hasSelectedMarket) return false;
            }
            const hasPreviewLink = Boolean(email.previewLink && String(email.previewLink).trim());
            const hasPreview = hasPreviewLink && !Boolean(email._brokenPreview);
            if (previewFilter === "preview" && !hasPreview) return false;
            if (previewFilter === "no-preview" && hasPreview) return false;
            if (month !== "all" && email.month !== month) return false;
            if (!q) return true;
            const haystack = [
                email.requestId,
                email.campaignName,
                email.campaignDescription,
                email.campaignType,
                email.campaignGoal,
                email.emailTemplate,
                email.targetLanguage,
                email.targetMarket,
                email.additionalTargetMarkets,
                email.area
            ].join(" ").toLowerCase();
            return haystack.includes(q);
        });
    }, [yearEmails, selectedAreas, selectedMarkets, previewFilter, month, search]);

    const groupedByMonth = useMemo(() => {
        const grouped = new Map();
        for (const email of filtered) {
            const key = email.month || "Unknown";
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(email);
        }
        return MONTHS
            .filter((monthName) => grouped.has(monthName))
            .map((monthName) => [monthName, grouped.get(monthName)]);
    }, [filtered]);

    async function syncNow() {
        try {
            setSyncing(true);
            setError("");
            setStatus("");
            const dataset = await forceRefreshArchiveDataset();
            setEmails(dataset.emails || []);
            setYears(dataset.years || []);
            setMeta(dataset.meta || null);
            const broken = dataset.meta?.brokenPreviewCount || 0;
            setStatus(
                broken > 0
                    ? `Archive synced. ${broken} preview links are unavailable.`
                    : "Archive synced from Smartsheet successfully."
            );
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSyncing(false);
        }
    }

    function resetFilters() {
        setMonth("all");
        setSelectedAreas([]);
        setSelectedMarkets([]);
        setPreviewFilter("all");
        setSearch("");
    }

    async function openPreview(email) {
        if (!email?.previewLink) return;
        const targetUrl = String(email.previewLink);

        try {
            setPreviewChecking(true);
            const health = await apiRequest(`/api/check-url?url=${encodeURIComponent(targetUrl)}`);
            if (health?.broken || !health?.status || Number(health.status) >= 400) {
                setStatus("Preview link is unavailable and has been marked as No Preview.");
                setEmails((current) => current.map((item) => {
                    if (item.requestId === email.requestId && item.previewLink === email.previewLink) {
                        return { ...item, _brokenPreview: true };
                    }
                    return item;
                }));
                return;
            }

            setPreviewDevice("desktop");
            setPreviewHtml("");
            setPreviewBlocked(false);
            setPreviewCopyState("");
            setPreviewError("");
            setPreviewModal({
                open: true,
                url: targetUrl,
                id: String(email.requestId || ""),
                name: String(email.campaignName || "Email Preview")
            });
        } catch (_error) {
            setStatus("Could not validate preview link right now. Please try again.");
        } finally {
            setPreviewChecking(false);
        }
    }

    function closePreview() {
        setPreviewModal((current) => ({ ...current, open: false }));
        setPreviewCopyState("");
    }

    async function copyPreviewHtml() {
        if (!previewHtml) return;
        try {
            await navigator.clipboard.writeText(previewHtml);
            setPreviewCopyState("Copied!");
            setTimeout(() => setPreviewCopyState(""), 1500);
        } catch (_error) {
            setPreviewCopyState("Copy failed");
            setTimeout(() => setPreviewCopyState(""), 1500);
        }
    }

    const activeFilters = [
        month !== "all" ? { key: "month", label: `Month: ${month}` } : null,
        ...selectedAreas.map((value, index) => ({ key: `area-${index}`, label: `Area: ${value}` })),
        ...selectedMarkets.map((value, index) => ({ key: `market-${index}`, label: `Market: ${value}` })),
        previewFilter === "preview" ? { key: "preview", label: "Preview: Yes" } : null,
        previewFilter === "no-preview" ? { key: "preview", label: "Preview: No" } : null,
        search.trim() ? { key: "search", label: `Search: "${search.trim()}"` } : null
    ].filter(Boolean);

    function removeFilter(filterKey) {
        if (filterKey === "month") setMonth("all");
        if (filterKey.startsWith("area-")) setSelectedAreas([]);
        if (filterKey.startsWith("market-")) setSelectedMarkets([]);
        if (filterKey === "preview") setPreviewFilter("all");
        if (filterKey === "search") setSearch("");
    }

    const previewWrapperWidth = DEVICES[previewDevice]?.width || DEVICES.desktop.width;

    return (
        <div className="page">
            <div className="page-head">
                <h2>Archive</h2>
                <p>
                    Last sync: {formatDateTime(meta?.lastSyncedAt)} ({meta?.source || "unknown"})
                </p>
            </div>

            <div className="card">
                <div className="archive-controls">
                    <div className="archive-search-wrap">
                        <label htmlFor="archive-search">Search</label>
                        <input
                            id="archive-search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Campaign name, request ID, market, template..."
                        />
                    </div>
                    <div>
                        <label htmlFor="archive-year">Year</label>
                        <SearchSelect
                            id="archive-year"
                            value={year}
                            onChange={setYear}
                            options={years.map((value) => ({ value: String(value), label: String(value) }))}
                            placeholder="Select year"
                            clearable={false}
                            searchable={false}
                        />
                    </div>
                    <div>
                        <label htmlFor="archive-area">Area</label>
                        <SearchSelect
                            id="archive-area"
                            options={areaOptions.map((option) => ({ value: option, label: option }))}
                            value={selectedAreas}
                            onChange={setSelectedAreas}
                            placeholder="All Areas"
                            isMulti
                        />
                    </div>
                    <div>
                        <label htmlFor="archive-market">Market</label>
                        <SearchSelect
                            id="archive-market"
                            options={marketOptions.map((option) => ({ value: option, label: option }))}
                            value={selectedMarkets}
                            onChange={setSelectedMarkets}
                            placeholder="All Markets"
                            isMulti
                        />
                    </div>
                    <div>
                        <label htmlFor="archive-preview-filter">Preview</label>
                        <SearchSelect
                            id="archive-preview-filter"
                            value={previewFilter}
                            onChange={setPreviewFilter}
                            options={[
                                { value: "all", label: "All" },
                                { value: "preview", label: "Preview" },
                                { value: "no-preview", label: "No Preview" }
                            ]}
                            placeholder="All"
                            clearable={false}
                            searchable={false}
                        />
                    </div>
                </div>

                <div className="archive-controls-actions">
                    <button type="button" className="button-primary" onClick={syncNow} disabled={syncing}>
                        {syncing ? "Syncing..." : "Sync with Smartsheet"}
                    </button>
                    <button type="button" className="button-secondary" onClick={resetFilters}>
                        Reset Filters
                    </button>
                    <span className="muted">{filtered.length} of {yearEmails.length} emails</span>
                    {previewChecking && <span className="muted">Checking preview link...</span>}
                </div>

                <div className="month-pills-row">
                    <button
                        type="button"
                        className={`month-pill ${month === "all" ? "active" : ""}`}
                        onClick={() => setMonth("all")}
                    >
                        All
                    </button>
                    {MONTHS.map((monthName) => (
                        <button
                            key={monthName}
                            type="button"
                            className={`month-pill ${month === monthName ? "active" : ""} ${monthsWithData.has(monthName) ? "" : "empty"}`}
                            onClick={() => setMonth(monthName)}
                        >
                            {monthName.slice(0, 3)}
                        </button>
                    ))}
                </div>

                {!!activeFilters.length && (
                    <div className="filter-pill-row">
                        {activeFilters.map((filter) => (
                            <button key={filter.key} type="button" className="filter-pill" onClick={() => removeFilter(filter.key)}>
                                {filter.label} x
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {loading && <div className="card">Loading archive data...</div>}
            {error && <div className="card"><p className="msg error">{error}</p></div>}
            {syncing && (
                <div className="card">
                    <div className="archive-sync-loading">
                        <span className="archive-sync-spinner" aria-hidden="true" />
                        <div>
                            <p className="archive-sync-title">Sync in progress...</p>
                            <p className="muted">Refreshing archive data and validating preview links.</p>
                        </div>
                    </div>
                </div>
            )}
            {status && <div className="card"><p className="msg ok">{status}</p></div>}

            {!loading && !error && groupedByMonth.length === 0 && (
                <div className="card">
                    <h3>No results found</h3>
                    <p className="muted">Try resetting filters or syncing latest data.</p>
                </div>
            )}

            {!loading && !error && groupedByMonth.map(([monthName, monthEmails]) => (
                <section key={monthName} className="card">
                    <div className="row-between">
                        <h3>{monthName} - {year || "N/A"}</h3>
                        <p className="muted">{monthEmails.length} email{monthEmails.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="archive-grid">
                        {monthEmails.map((email) => {
                            const hasPreviewLink = email.previewLink && String(email.previewLink).trim();
                            const hasPreview = Boolean(hasPreviewLink) && !Boolean(email._brokenPreview);
                            const previewTitle = email.requestId || email.campaignName || "email";
                            const additionalMarkets = parseAdditionalMarkets(email.additionalTargetMarkets);

                            return (
                                <article className="archive-item archive-item-full" key={`${email.requestId || "unknown"}-${email.previewLink || "nopreview"}`}>
                                    <div className="archive-preview-grid">
                                        {hasPreview ? (
                                            <button
                                                type="button"
                                                className="archive-preview-link"
                                                onClick={() => openPreview(email)}
                                                aria-label={`Open preview for ${previewTitle}`}
                                            >
                                                <div className="archive-preview-mobile">
                                                    <iframe
                                                        title={`Mobile preview ${previewTitle}`}
                                                        src={email.previewLink}
                                                        loading="lazy"
                                                        sandbox="allow-same-origin"
                                                    />
                                                </div>
                                                <div className="archive-preview-tablet">
                                                    <iframe
                                                        title={`Tablet preview ${previewTitle}`}
                                                        src={email.previewLink}
                                                        loading="lazy"
                                                        sandbox="allow-same-origin"
                                                    />
                                                </div>
                                                <div className="archive-preview-overlay">VIEW EMAIL</div>
                                            </button>
                                        ) : (
                                            <>
                                                <div className="archive-preview-mobile">
                                                    <div className="archive-preview-placeholder">NO PREVIEW</div>
                                                </div>
                                                <div className="archive-preview-tablet">
                                                    <div className="archive-preview-placeholder">NO PREVIEW AVAILABLE</div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="archive-content">
                                        <h3>{highlightText(email.campaignName || "Untitled", search)}</h3>
                                        <p><strong>ID:</strong> {highlightText(email.requestId || "N/A", search)}</p>
                                        {!!email.campaignDescription && <p><strong>Description:</strong> {highlightText(email.campaignDescription, search)}</p>}
                                        <p><strong>Deployment:</strong> {highlightText(formatDate(email.earliestDeploymentDate || email.latestDeploymentDate || email.requestDate), search)}</p>
                                        {!!email.campaignType && <p><strong>Type:</strong> {highlightText(email.campaignType, search)}</p>}
                                        {!!email.campaignGoal && <p><strong>Goal:</strong> {highlightText(email.campaignGoal, search)}</p>}
                                        {!!email.emailTemplate && <p><strong>Template:</strong> {highlightText(email.emailTemplate, search)}</p>}
                                        {!!email.targetLanguage && <p><strong>Language:</strong> {highlightText(email.targetLanguage, search)}</p>}
                                        <div className="archive-tag-row">
                                            {!!email.area && <span className={`archive-tag ${getAreaClass(email.area)}`}>{highlightText(email.area, search)}</span>}
                                            {!!email.targetMarket && <span className="archive-tag market">{highlightText(email.targetMarket, search)}</span>}
                                            {additionalMarkets.map((market, index) => (
                                                <span key={`${email.requestId || "unknown"}-additional-market-${index}`} className="archive-tag market">
                                                    {highlightText(market, search)}
                                                </span>
                                            ))}
                                        </div>
                                        {!!email.additionalTargetMarkets && (
                                            <p><strong>Additional Markets:</strong> {highlightText(email.additionalTargetMarkets, search)}</p>
                                        )}
                                        <div className="archive-actions">
                                            {hasPreview ? (
                                                <button
                                                    type="button"
                                                    className="archive-action-link"
                                                    onClick={() => openPreview(email)}
                                                >
                                                    VIEW EMAIL
                                                </button>
                                            ) : (
                                                <span className="muted">NO PREVIEW</span>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}

            {previewModal.open && (
                <div className="archive-preview-modal-backdrop" role="dialog" aria-modal="true" aria-label="Email preview">
                    <button
                        type="button"
                        className="archive-preview-modal-overlay"
                        onClick={closePreview}
                        aria-label="Close preview"
                    />

                    <div className="archive-preview-modal-panel">
                        <div className="archive-preview-modal-toolbar">
                            <div className="archive-preview-modal-meta">
                                <p>{previewModal.id}</p>
                                <h3>{previewModal.name}</h3>
                            </div>

                            <div className="archive-preview-modal-actions">
                                <div className="archive-device-switch">
                                    {Object.keys(DEVICES).map((key) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={previewDevice === key ? "active" : ""}
                                            onClick={() => setPreviewDevice(key)}
                                        >
                                            {DEVICES[key].label}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    className="archive-preview-toolbar-button"
                                    onClick={copyPreviewHtml}
                                    disabled={!previewHtml}
                                >
                                    {previewCopyState || "COPY HTML"}
                                </button>

                                <button
                                    type="button"
                                    className="archive-preview-toolbar-close"
                                    onClick={closePreview}
                                    aria-label="Close preview"
                                >
                                    x
                                </button>
                            </div>
                        </div>

                        <div className="archive-preview-modal-body">
                            <div
                                className="archive-preview-modal-canvas"
                                style={{ width: `${previewWrapperWidth}px` }}
                            >
                                <div className="archive-preview-modal-url">{previewModal.url}</div>
                                {previewLoading ? (
                                    <div className="archive-preview-loading">Loading preview...</div>
                                ) : previewBlocked ? (
                                    <div className="archive-preview-loading">No preview available for this link.</div>
                                ) : (
                                    <iframe
                                        title={`modal-preview-${previewModal.id || "email"}`}
                                        className="archive-preview-modal-iframe"
                                        sandbox="allow-same-origin"
                                        srcDoc={previewHtml || undefined}
                                        src={previewHtml ? undefined : previewModal.url}
                                    />
                                )}
                            </div>
                        </div>

                        {!!previewError && <p className="archive-preview-error">{previewError}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}





