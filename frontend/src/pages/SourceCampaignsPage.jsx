import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import { useAuth } from "../auth";
import SettingsModal from "../components/SettingsModal";
import DataTableControls, { DataTablePagination } from "../components/DataTableControls";
import SearchSelect from "../components/SearchSelect";

const SOURCE_FORM_DEFAULT = {
    name: "",
    requestId: "",
    previewLink: "",
    templateMasterId: "",
    areaMasterId: "",
    marketMasterId: "",
    additionalMarkets: [],
    isActive: true
};
const PAGE_SIZE = 8;

const DEVICES = {
    mobile: { width: 375, label: "MOBILE" },
    tablet: { width: 768, label: "TABLET" },
    desktop: { width: 1200, label: "DESKTOP" }
};

function summarizeSeed(summary) {
    if (!summary) return "Master data seeded from archive.";
    return [
        `Processed ${summary.campaignsProcessed || 0} deployed campaigns`,
        `${summary.areasCreated || 0} new areas`,
        `${summary.marketsCreated || 0} new markets`,
        `${summary.additionalMarketsCreated || 0} new additional markets`,
        `${summary.sourceCampaignsCreated || 0} source campaigns created`,
        `${summary.sourceCampaignsUpdated || 0} source campaigns updated`
    ].join(" | ");
}

function summarizeAudit(audit) {
    if (!audit) return "";
    const passCount = (audit.checks || []).filter((check) => check.status === "pass").length;
    const warnCount = (audit.checks || []).filter((check) => check.status !== "pass").length;
    return [
        audit.healthy ? "Data quality healthy" : "Data quality needs review",
        `${passCount} pass`,
        `${warnCount} warn`,
        `${audit.summary?.sources || 0} sources checked`
    ].join(" | ");
}

function toUserError(apiError) {
    if (apiError?.status === 404) {
        return "API route not found. Restart backend with `npm run dev` and refresh.";
    }
    return apiError?.message || "Request failed.";
}

export default function SourceCampaignsPage() {
    const { permissions } = useAuth();
    const canManage = useMemo(
        () => permissions.includes("*") || permissions.includes("settings:manage_users"),
        [permissions]
    );

    const [templates, setTemplates] = useState([]);
    const [sourceCampaigns, setSourceCampaigns] = useState([]);
    const [areas, setAreas] = useState([]);
    const [markets, setMarkets] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [auditing, setAuditing] = useState(false);
    const [checkingLinks, setCheckingLinks] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [seedAudit, setSeedAudit] = useState(null);
    const [linkStatusById, setLinkStatusById] = useState({});
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ key: "name", direction: "asc" });

    const [sourceCreateOpen, setSourceCreateOpen] = useState(false);
    const [sourceEditOpen, setSourceEditOpen] = useState(false);
    const [selectedSource, setSelectedSource] = useState(null);
    const [sourceForm, setSourceForm] = useState(SOURCE_FORM_DEFAULT);
    const [previewDevice, setPreviewDevice] = useState("desktop");
    const [previewModal, setPreviewModal] = useState({
        open: false,
        url: "",
        id: "",
        name: ""
    });

    const mainMarkets = useMemo(
        () => markets.filter((market) => market.type === "MARKET"),
        [markets]
    );
    const additionalMarketOptions = useMemo(
        () => markets.filter((market) => market.type === "ADDITIONAL_MARKET"),
        [markets]
    );

    const filteredSourceCampaigns = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return sourceCampaigns;
        return sourceCampaigns.filter((source) => {
            const haystack = [
                source.name,
                source.requestId,
                source.templateName,
                source.areaName,
                source.marketName,
                Array.isArray(source.additionalMarkets) ? source.additionalMarkets.join(", ") : "",
                source.isActive ? "yes" : "no"
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [sourceCampaigns, search]);

    const sortedSourceCampaigns = useMemo(() => {
        const list = [...filteredSourceCampaigns];
        list.sort((a, b) => {
            let valueA = "";
            let valueB = "";
            if (sort.key === "additionalMarkets") {
                valueA = Array.isArray(a.additionalMarkets) ? a.additionalMarkets.join(", ").toLowerCase() : "";
                valueB = Array.isArray(b.additionalMarkets) ? b.additionalMarkets.join(", ").toLowerCase() : "";
            } else if (sort.key === "isActive") {
                valueA = a.isActive ? "yes" : "no";
                valueB = b.isActive ? "yes" : "no";
            } else if (sort.key === "preview") {
                valueA = String(a?.previewLink || "").trim().toLowerCase() || "no-preview";
                valueB = String(b?.previewLink || "").trim().toLowerCase() || "no-preview";
            } else if (sort.key === "linkStatus") {
                const rankByCondition = {
                    unknown: "3",
                    working: "2",
                    broken: "1",
                    missing: "0"
                };
                const conditionA = String(linkStatusById[a.id]?.condition || "unknown");
                const conditionB = String(linkStatusById[b.id]?.condition || "unknown");
                valueA = rankByCondition[conditionA] || "3";
                valueB = rankByCondition[conditionB] || "3";
            } else {
                valueA = String(a?.[sort.key] ?? "").toLowerCase();
                valueB = String(b?.[sort.key] ?? "").toLowerCase();
            }
            if (valueA < valueB) return sort.direction === "asc" ? -1 : 1;
            if (valueA > valueB) return sort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredSourceCampaigns, sort, linkStatusById]);

    const pageCount = Math.max(1, Math.ceil(sortedSourceCampaigns.length / PAGE_SIZE));
    const pagedSourceCampaigns = useMemo(() => {
        const safePage = Math.min(page, pageCount);
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedSourceCampaigns.slice(start, start + PAGE_SIZE);
    }, [sortedSourceCampaigns, page, pageCount]);

    async function loadData() {
        try {
            setLoading(true);
            const [templatesPayload, sourcesPayload, areasPayload, marketsPayload] = await Promise.all([
                apiRequest("/api/settings/templates"),
                apiRequest("/api/settings/source-campaigns"),
                apiRequest("/api/settings/areas"),
                apiRequest("/api/settings/markets")
            ]);
            setTemplates(templatesPayload.templates || []);
            setSourceCampaigns(sourcesPayload.sourceCampaigns || []);
            setAreas(areasPayload.areas || []);
            setMarkets(marketsPayload.markets || []);
        } catch (apiError) {
            setError(toUserError(apiError));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        setLinkStatusById((current) => {
            const next = {};
            for (const source of sourceCampaigns) {
                const previewUrl = String(source.previewLink || "").trim();
                if (!previewUrl) {
                    next[source.id] = {
                        condition: "missing",
                        label: "No link",
                        reason: "missing",
                        status: 0,
                        url: ""
                    };
                    continue;
                }

                const existing = current[source.id];
                if (existing && existing.url === previewUrl) {
                    next[source.id] = existing;
                } else {
                    next[source.id] = {
                        condition: "unknown",
                        label: "Unchecked",
                        reason: "not-checked",
                        status: 0,
                        url: previewUrl
                    };
                }
            }
            return next;
        });
    }, [sourceCampaigns]);

    useEffect(() => {
        if (!previewModal.open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [previewModal.open]);

    useEffect(() => {
        setPage(1);
    }, [search]);

    useEffect(() => {
        setPage((current) => Math.min(current, pageCount));
    }, [pageCount]);

    function onSort(nextKey) {
        setSort((current) => {
            if (current.key === nextKey) {
                return { key: nextKey, direction: current.direction === "asc" ? "desc" : "asc" };
            }
            return { key: nextKey, direction: "asc" };
        });
    }

    function sortLabel(key, label) {
        if (sort.key !== key) return label;
        return `${label} ${sort.direction === "asc" ? "↑" : "↓"}`;
    }

    function resetFeedback() {
        setMessage("");
        setError("");
    }

    function closeAllModals() {
        if (saving) return;
        setSourceCreateOpen(false);
        setSourceEditOpen(false);
        setSelectedSource(null);
        setSourceForm(SOURCE_FORM_DEFAULT);
    }

    function openSourceCreate() {
        resetFeedback();
        setSourceForm(SOURCE_FORM_DEFAULT);
        setSourceCreateOpen(true);
    }

    function openSourceEdit(source) {
        resetFeedback();
        setSelectedSource(source);
        setSourceForm({
            name: source.name || "",
            requestId: source.requestId || "",
            previewLink: source.previewLink || "",
            templateMasterId: source.templateMasterId || "",
            areaMasterId: source.areaMasterId || "",
            marketMasterId: source.marketMasterId || "",
            additionalMarkets: Array.isArray(source.additionalMarkets) ? source.additionalMarkets : [],
            isActive: Boolean(source.isActive)
        });
        setSourceEditOpen(true);
    }

    async function createSourceCampaign(event) {
        event.preventDefault();
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/settings/source-campaigns", {
                method: "POST",
                body: JSON.stringify(sourceForm)
            });
            setMessage("Source campaign master created.");
            setSourceCreateOpen(false);
            await loadData();
        } catch (apiError) {
            setError(toUserError(apiError));
        } finally {
            setSaving(false);
        }
    }

    async function updateSourceCampaign(event) {
        event.preventDefault();
        if (!selectedSource?.id) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/source-campaigns/${selectedSource.id}`, {
                method: "PATCH",
                body: JSON.stringify(sourceForm)
            });
            setMessage("Source campaign master updated.");
            setSourceEditOpen(false);
            setSelectedSource(null);
            await loadData();
        } catch (apiError) {
            setError(toUserError(apiError));
        } finally {
            setSaving(false);
        }
    }

    async function seedFromArchive() {
        resetFeedback();
        try {
            setSeeding(true);
            const payload = await apiRequest("/api/settings/seed-from-archive", {
                method: "POST"
            });
            setMessage(summarizeSeed(payload.summary));
            setSeedAudit(null);
            await loadData();
        } catch (apiError) {
            setError(toUserError(apiError));
        } finally {
            setSeeding(false);
        }
    }

    async function runSeedAudit() {
        resetFeedback();
        try {
            setAuditing(true);
            const payload = await apiRequest("/api/settings/seed-audit");
            setSeedAudit(payload);
            setMessage(summarizeAudit(payload));
        } catch (apiError) {
            setError(toUserError(apiError));
        } finally {
            setAuditing(false);
        }
    }

    async function validateLinkStatuses(targetSources, options = {}) {
        const { force = false, showGlobalLoading = true } = options;
        const sources = Array.isArray(targetSources) ? targetSources : [];
        const candidates = sources.filter((source) => {
            const previewUrl = String(source.previewLink || "").trim();
            if (!previewUrl) return false;
            if (force) return true;
            const currentStatus = linkStatusById[source.id];
            return !currentStatus || currentStatus.condition === "unknown";
        });

        if (!candidates.length) return;
        if (showGlobalLoading) setCheckingLinks(true);

        const batchSize = 8;
        try {
            for (let i = 0; i < candidates.length; i += batchSize) {
                const batch = candidates.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(async (source) => {
                    const previewUrl = String(source.previewLink || "").trim();
                    try {
                        const payload = await apiRequest(`/api/check-url?url=${encodeURIComponent(previewUrl)}`);
                        const isBroken = Boolean(payload?.broken || !payload?.status || payload.status >= 400);
                        return {
                            id: source.id,
                            condition: isBroken ? "broken" : "working",
                            label: isBroken ? "Broken" : "Working",
                            reason: payload?.reason || (isBroken ? "broken" : "ok"),
                            status: Number(payload?.status || 0),
                            url: previewUrl
                        };
                    } catch (_error) {
                        return {
                            id: source.id,
                            condition: "broken",
                            label: "Broken",
                            reason: "request-error",
                            status: 0,
                            url: previewUrl
                        };
                    }
                }));

                setLinkStatusById((current) => {
                    const next = { ...current };
                    for (const result of results) {
                        next[result.id] = result;
                    }
                    return next;
                });
            }
        } finally {
            if (showGlobalLoading) setCheckingLinks(false);
        }
    }

    useEffect(() => {
        const visibleUnknowns = pagedSourceCampaigns.filter((source) => {
            const previewUrl = String(source.previewLink || "").trim();
            if (!previewUrl) return false;
            const status = linkStatusById[source.id];
            return !status || status.condition === "unknown";
        });
        if (!visibleUnknowns.length) return;
        void validateLinkStatuses(visibleUnknowns, { force: false, showGlobalLoading: false });
    }, [pagedSourceCampaigns, linkStatusById]);

    function linkStatusBadge(statusItem) {
        const item = statusItem || { condition: "unknown", label: "Unchecked" };
        let classes = "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ";
        if (item.condition === "working") classes += "bg-green-100 text-green-700";
        else if (item.condition === "broken") classes += "bg-rose-100 text-rose-700";
        else if (item.condition === "missing") classes += "bg-gray-100 text-gray-600";
        else classes += "bg-blue-100 text-blue-700";

        const tooltip = item.reason
            ? `${item.reason}${item.status ? ` (${item.status})` : ""}`
            : item.label;

        return (
            <span className={classes} title={tooltip}>
                {item.label}
            </span>
        );
    }

    async function deleteSourceCampaign(source) {
        if (!source?.id) return;
        if (!window.confirm(`Delete source campaign "${source.name}"?`)) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/source-campaigns/${source.id}`, {
                method: "DELETE"
            });
            setMessage("Source campaign deleted.");
            await loadData();
        } catch (apiError) {
            setError(toUserError(apiError));
        } finally {
            setSaving(false);
        }
    }

    function openPreview(source) {
        if (!source?.previewLink) return;
        setPreviewDevice("desktop");
        setPreviewModal({
            open: true,
            url: String(source.previewLink),
            id: String(source.requestId || ""),
            name: String(source.name || "Source Campaign Preview")
        });
    }

    function closePreview() {
        setPreviewModal((current) => ({ ...current, open: false }));
    }

    const previewWrapperWidth = DEVICES[previewDevice]?.width || DEVICES.desktop.width;

    return (
        <div className="page">
            <div className="page-head">
                <h2>Source Campaigns</h2>
                <p>Master source campaigns used as template starters for builder workflow.</p>
            </div>

            {message && <section className="card"><p className="msg ok">{message}</p></section>}
            {error && <section className="card"><p className="msg error">{error}</p></section>}

            <section className="card">
                <div className="row-between">
                    <h3>Source campaign master</h3>
                    <div className="flex items-center gap-2">
                        {canManage && (
                            <button type="button" className="button-secondary" onClick={seedFromArchive} disabled={seeding || saving}>
                                {seeding ? "Seeding..." : "Seed from archive"}
                            </button>
                        )}
                        {canManage && (
                            <button type="button" className="button-secondary" onClick={runSeedAudit} disabled={auditing || saving || seeding}>
                                {auditing ? "Validating..." : "Validate master data"}
                            </button>
                        )}
                        {canManage && (
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={() => validateLinkStatuses(filteredSourceCampaigns, { force: true, showGlobalLoading: true })}
                                disabled={checkingLinks || saving || seeding}
                            >
                                {checkingLinks ? "Checking links..." : "Validate links"}
                            </button>
                        )}
                        {canManage && (
                            <button type="button" className="button-primary" onClick={openSourceCreate}>
                                Create source campaign
                            </button>
                        )}
                    </div>
                </div>
                <p className="muted mt-2">Seeding updates Areas, Markets, Additional Markets, and Source Campaign Master from deployed archive data.</p>
                {!!seedAudit && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-25 p-3">
                        <p className="text-sm font-medium text-gray-800">
                            Audit summary: {seedAudit.healthy ? "Healthy" : "Warnings found"}
                        </p>
                        <p className="muted mt-1">
                            Checked: {seedAudit.summary?.templates || 0} templates, {seedAudit.summary?.areas || 0} areas, {seedAudit.summary?.markets || 0} markets, {seedAudit.summary?.additionalMarkets || 0} additional markets, {seedAudit.summary?.sources || 0} sources.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(seedAudit.checks || []).map((check) => (
                                <span key={check.key} className={`pill ${check.status === "pass" ? "done" : "in-progress"}`}>
                                    {check.title}: {check.count}
                                </span>
                            ))}
                        </div>
                        {!!seedAudit.summary?.sourcesMissingPreview && (
                            <p className="muted mt-2">
                                Sources without preview link: {seedAudit.summary.sourcesMissingPreview}
                            </p>
                        )}
                    </div>
                )}

                {loading && <p className="muted mt-3">Loading source campaigns...</p>}

                {!loading && (
                    <div className="mt-4">
                        <DataTableControls
                            searchValue={search}
                            onSearchChange={setSearch}
                            searchPlaceholder="Search name, request ID, template, area, market..."
                            resultCount={filteredSourceCampaigns.length}
                            totalCount={sourceCampaigns.length}
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                        />
                    </div>
                )}

                {!loading && (
                    <div className="table-wrap mt-3">
                        <table>
                            <thead>
                                <tr>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("name")}>{sortLabel("name", "Name")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("requestId")}>{sortLabel("requestId", "Request ID")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("templateName")}>{sortLabel("templateName", "Template")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("areaName")}>{sortLabel("areaName", "Area")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("marketName")}>{sortLabel("marketName", "Market")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("additionalMarkets")}>{sortLabel("additionalMarkets", "Additional Markets")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("preview")}>{sortLabel("preview", "Preview")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("linkStatus")}>{sortLabel("linkStatus", "Link Status")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("isActive")}>{sortLabel("isActive", "Active")}</button></th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!filteredSourceCampaigns.length && (
                                    <tr>
                                        <td colSpan={10} className="text-center text-gray-500">No source campaigns yet.</td>
                                    </tr>
                                )}
                                {pagedSourceCampaigns.map((source) => (
                                    <tr key={source.id}>
                                        {(() => {
                                            const currentLinkStatus = linkStatusById[source.id];
                                            const canOpenPreview = Boolean(source.previewLink) && currentLinkStatus?.condition !== "broken";
                                            return (
                                                <>
                                        <td>{source.name}</td>
                                        <td>{source.requestId || "-"}</td>
                                        <td>{source.templateName || "-"}</td>
                                        <td>{source.areaName || "-"}</td>
                                        <td>{source.marketName || "-"}</td>
                                        <td>{Array.isArray(source.additionalMarkets) && source.additionalMarkets.length ? source.additionalMarkets.join(", ") : "-"}</td>
                                        <td>
                                            {canOpenPreview ? (
                                                <button type="button" className="button-secondary" onClick={() => openPreview(source)}>
                                                    View
                                                </button>
                                            ) : (
                                                <span className="muted">No preview</span>
                                            )}
                                        </td>
                                        <td>{linkStatusBadge(currentLinkStatus)}</td>
                                        <td>{source.isActive ? "Yes" : "No"}</td>
                                        <td>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className="button-secondary"
                                                    onClick={() => openSourceEdit(source)}
                                                    disabled={!canManage}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="button-secondary text-error-500"
                                                    onClick={() => deleteSourceCampaign(source)}
                                                    disabled={!canManage || saving}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                                </>
                                            );
                                        })()}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && (
                    <div className="mt-3">
                        <DataTablePagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </section>

            <SettingsModal title="Create Source Campaign Master" open={sourceCreateOpen} onClose={closeAllModals}>
                <form className="grid two gap-3" onSubmit={createSourceCampaign}>
                    <input
                        placeholder="Source campaign name"
                        value={sourceForm.name}
                        onChange={(event) => setSourceForm({ ...sourceForm, name: event.target.value })}
                        required
                    />
                    <input
                        placeholder="Request ID"
                        value={sourceForm.requestId}
                        onChange={(event) => setSourceForm({ ...sourceForm, requestId: event.target.value })}
                    />
                    <input
                        className="md:col-span-2"
                        placeholder="Preview URL"
                        value={sourceForm.previewLink}
                        onChange={(event) => setSourceForm({ ...sourceForm, previewLink: event.target.value })}
                    />
                    <SearchSelect
                        value={sourceForm.templateMasterId}
                        onChange={(nextTemplateId) => setSourceForm({ ...sourceForm, templateMasterId: nextTemplateId })}
                        options={[
                            { value: "", label: "Select template" },
                            ...templates.map((template) => ({
                                value: template.id,
                                label: `Template ${template.code} - ${template.name}`
                            }))
                        ]}
                        placeholder="Select template"
                    />
                    <SearchSelect
                        value={sourceForm.areaMasterId}
                        onChange={(nextAreaId) => setSourceForm({ ...sourceForm, areaMasterId: nextAreaId })}
                        options={[
                            { value: "", label: "Select area" },
                            ...areas.map((area) => ({
                                value: area.id,
                                label: `${area.code} - ${area.name}`
                            }))
                        ]}
                        placeholder="Select area"
                    />
                    <SearchSelect
                        value={sourceForm.marketMasterId}
                        onChange={(nextMarketId) => setSourceForm({ ...sourceForm, marketMasterId: nextMarketId })}
                        options={[
                            { value: "", label: "Select market" },
                            ...mainMarkets.map((market) => ({
                                value: market.id,
                                label: `${market.code} - ${market.name}`
                            }))
                        ]}
                        placeholder="Select market"
                    />
                    <SearchSelect
                        isMulti
                        value={sourceForm.additionalMarkets}
                        onChange={(nextAdditionalMarkets) => setSourceForm({ ...sourceForm, additionalMarkets: nextAdditionalMarkets })}
                        options={additionalMarketOptions.map((market) => ({
                            value: market.name,
                            label: `${market.code} - ${market.name}`
                        }))}
                        placeholder="Select additional markets"
                    />
                    <label className="inline-check md:col-span-2">
                        <input
                            type="checkbox"
                            checked={sourceForm.isActive}
                            onChange={(event) => setSourceForm({ ...sourceForm, isActive: event.target.checked })}
                        />
                        <span className="inline-check-box" aria-hidden="true">
                            <svg className="inline-check-icon" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        Active
                    </label>
                    <div className="md:col-span-2 mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeAllModals} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Creating..." : "Create source campaign"}
                        </button>
                    </div>
                </form>
            </SettingsModal>

            <SettingsModal title="Edit Source Campaign Master" open={sourceEditOpen} onClose={closeAllModals}>
                <form className="grid two gap-3" onSubmit={updateSourceCampaign}>
                    <input
                        placeholder="Source campaign name"
                        value={sourceForm.name}
                        onChange={(event) => setSourceForm({ ...sourceForm, name: event.target.value })}
                        required
                    />
                    <input
                        placeholder="Request ID"
                        value={sourceForm.requestId}
                        onChange={(event) => setSourceForm({ ...sourceForm, requestId: event.target.value })}
                    />
                    <input
                        className="md:col-span-2"
                        placeholder="Preview URL"
                        value={sourceForm.previewLink}
                        onChange={(event) => setSourceForm({ ...sourceForm, previewLink: event.target.value })}
                    />
                    <SearchSelect
                        value={sourceForm.templateMasterId}
                        onChange={(nextTemplateId) => setSourceForm({ ...sourceForm, templateMasterId: nextTemplateId })}
                        options={[
                            { value: "", label: "Select template" },
                            ...templates.map((template) => ({
                                value: template.id,
                                label: `Template ${template.code} - ${template.name}`
                            }))
                        ]}
                        placeholder="Select template"
                    />
                    <SearchSelect
                        value={sourceForm.areaMasterId}
                        onChange={(nextAreaId) => setSourceForm({ ...sourceForm, areaMasterId: nextAreaId })}
                        options={[
                            { value: "", label: "Select area" },
                            ...areas.map((area) => ({
                                value: area.id,
                                label: `${area.code} - ${area.name}`
                            }))
                        ]}
                        placeholder="Select area"
                    />
                    <SearchSelect
                        value={sourceForm.marketMasterId}
                        onChange={(nextMarketId) => setSourceForm({ ...sourceForm, marketMasterId: nextMarketId })}
                        options={[
                            { value: "", label: "Select market" },
                            ...mainMarkets.map((market) => ({
                                value: market.id,
                                label: `${market.code} - ${market.name}`
                            }))
                        ]}
                        placeholder="Select market"
                    />
                    <SearchSelect
                        isMulti
                        value={sourceForm.additionalMarkets}
                        onChange={(nextAdditionalMarkets) => setSourceForm({ ...sourceForm, additionalMarkets: nextAdditionalMarkets })}
                        options={additionalMarketOptions.map((market) => ({
                            value: market.name,
                            label: `${market.code} - ${market.name}`
                        }))}
                        placeholder="Select additional markets"
                    />
                    <label className="inline-check md:col-span-2">
                        <input
                            type="checkbox"
                            checked={sourceForm.isActive}
                            onChange={(event) => setSourceForm({ ...sourceForm, isActive: event.target.checked })}
                        />
                        <span className="inline-check-box" aria-hidden="true">
                            <svg className="inline-check-icon" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        Active
                    </label>
                    <div className="md:col-span-2 mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeAllModals} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save changes"}
                        </button>
                    </div>
                </form>
            </SettingsModal>

            {previewModal.open && (
                <div className="archive-preview-modal-backdrop" role="dialog" aria-modal="true" aria-label="Source campaign preview">
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
                                    className="archive-preview-toolbar-close"
                                    onClick={closePreview}
                                    aria-label="Close preview"
                                >
                                    x
                                </button>
                            </div>
                        </div>

                        <div className="archive-preview-modal-body">
                            <div className="archive-preview-modal-canvas" style={{ width: `${previewWrapperWidth}px` }}>
                                <div className="archive-preview-modal-url">{previewModal.url}</div>
                                <iframe
                                    title={`source-preview-${previewModal.id || "email"}`}
                                    className="archive-preview-modal-iframe"
                                    sandbox="allow-same-origin"
                                    src={previewModal.url}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
