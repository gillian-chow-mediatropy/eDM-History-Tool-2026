import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import { useAuth } from "../auth";
import SettingsModal from "../components/SettingsModal";
import DataTableControls, { DataTablePagination } from "../components/DataTableControls";
import SearchSelect from "../components/SearchSelect";
import { loadArchiveEmails } from "../archive-utils";

const PAGE_SIZE = 8;
const STATUS_OPTIONS = [
    { value: "DRAFT", label: "Draft" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "FINAL", label: "Final" },
    { value: "ARCHIVED", label: "Archived" }
];

const FORM_DEFAULT = {
    code: "",
    name: "",
    status: "DRAFT",
    templateMasterId: "",
    areaMasterId: "",
    marketMasterId: "",
    additionalMarkets: []
};

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function normalizeStatusLabel(status) {
    const value = String(status || "").toUpperCase();
    if (value === "IN_PROGRESS") return "In Progress";
    if (value === "FINAL") return "Final";
    if (value === "ARCHIVED") return "Archived";
    return "Draft";
}

function statusPillClass(status) {
    const value = String(status || "").toUpperCase();
    if (value === "FINAL") return "pill done";
    if (value === "IN_PROGRESS") return "pill in-progress";
    if (value === "ARCHIVED") return "pill todo";
    return "pill todo";
}

function extractHtmlLangCode(htmlContent) {
    const html = String(htmlContent || "");
    if (!html.trim()) return "";
    const htmlLangMatch = html.match(/<html[^>]*\blang\s*=\s*["']?([^"'\s>]+)/i);
    if (htmlLangMatch?.[1]) return String(htmlLangMatch[1]).trim().toLowerCase();
    return "";
}

function formatLanguageLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const normalized = raw.toLowerCase();
    if (normalized.includes("english") || normalized === "en" || normalized.startsWith("en-")) return "English";
    if (normalized.includes("bahasa") || normalized.includes("indonesian") || normalized === "id" || normalized.startsWith("id-")) return "Bahasa";
    if (normalized.includes("japanese") || normalized === "ja" || normalized.startsWith("ja-")) return "Japanese";
    if (normalized.includes("korean") || normalized === "ko" || normalized.startsWith("ko-")) return "Korean";
    if (normalized.includes("chinese") || normalized === "zh" || normalized.startsWith("zh-")) return "Chinese";
    if (normalized.includes("thai") || normalized === "th" || normalized.startsWith("th-")) return "Thai";
    return raw;
}

export default function CampaignsPage() {
    const navigate = useNavigate();
    const { permissions } = useAuth();
    const canManage = useMemo(
        () => permissions.includes("*") || permissions.includes("builder:edit"),
        [permissions]
    );

    const [campaigns, setCampaigns] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [templateLanguageSummaryById, setTemplateLanguageSummaryById] = useState(new Map());
    const [areas, setAreas] = useState([]);
    const [markets, setMarkets] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ key: "updatedAt", direction: "desc" });

    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [form, setForm] = useState(FORM_DEFAULT);
    const [templateSelectionValue, setTemplateSelectionValue] = useState("");

    const additionalMarketOptions = useMemo(
        () => markets.filter((market) => market.type === "ADDITIONAL_MARKET"),
        [markets]
    );

    const marketOptions = useMemo(
        () => markets.filter((market) => market.type === "MARKET"),
        [markets]
    );

    const templateSelectOptions = useMemo(() => {
        const options = [];
        for (const template of templates) {
            if (!template?.isActive) continue;
            const templateId = String(template.id || "").trim();
            const baseLabel = `Template ${template.code}`;
            const languages = (templateLanguageSummaryById.get(templateId) || [])
                .map((item) => String(item || "").trim())
                .filter(Boolean);

            if (!languages.length) {
                options.push({
                    value: `${templateId}::__base`,
                    label: baseLabel,
                    templateId
                });
                continue;
            }

            for (const language of languages) {
                options.push({
                    value: `${templateId}::${language.toLowerCase()}`,
                    label: `${baseLabel} - ${language}`,
                    templateId
                });
            }
        }
        return options;
    }, [templates, templateLanguageSummaryById]);

    const templateOptionByValue = useMemo(() => {
        const map = new Map();
        for (const option of templateSelectOptions) {
            map.set(option.value, option);
        }
        return map;
    }, [templateSelectOptions]);

    const selectedTemplateOptionValue = useMemo(() => {
        if (templateSelectionValue) return templateSelectionValue;
        const templateId = String(form.templateMasterId || "").trim();
        if (!templateId) return "";
        return templateSelectOptions.find((option) => option.templateId === templateId)?.value || "";
    }, [templateSelectionValue, form.templateMasterId, templateSelectOptions]);

    async function loadData() {
        try {
            setLoading(true);
            const [
                campaignsPayload,
                templatesPayload,
                sourceCampaignsPayload,
                areasPayload,
                marketsPayload,
                archiveEmails
            ] = await Promise.all([
                apiRequest("/api/campaigns"),
                apiRequest("/api/settings/templates"),
                apiRequest("/api/settings/source-campaigns"),
                apiRequest("/api/settings/areas"),
                apiRequest("/api/settings/markets"),
                loadArchiveEmails().catch(() => [])
            ]);

            const nextCampaigns = Array.isArray(campaignsPayload?.campaigns) ? campaignsPayload.campaigns : [];
            const nextTemplates = Array.isArray(templatesPayload?.templates) ? templatesPayload.templates : [];
            const nextSources = Array.isArray(sourceCampaignsPayload?.sourceCampaigns) ? sourceCampaignsPayload.sourceCampaigns : [];
            setCampaigns(nextCampaigns);
            setTemplates(nextTemplates);
            setAreas(Array.isArray(areasPayload?.areas) ? areasPayload.areas : []);
            setMarkets(Array.isArray(marketsPayload?.markets) ? marketsPayload.markets : []);

            const archiveLanguageByRequestId = new Map();
            for (const email of archiveEmails || []) {
                const requestId = String(email?.requestId || "").trim().toLowerCase();
                const targetLanguage = formatLanguageLabel(String(email?.targetLanguage || "").trim());
                if (requestId && targetLanguage && !archiveLanguageByRequestId.has(requestId)) {
                    archiveLanguageByRequestId.set(requestId, targetLanguage);
                }
            }

            const sourcesByTemplateId = new Map();
            for (const source of nextSources) {
                const templateId = String(source?.templateMasterId || "").trim();
                if (!templateId) continue;
                if (!sourcesByTemplateId.has(templateId)) {
                    sourcesByTemplateId.set(templateId, []);
                }
                sourcesByTemplateId.get(templateId).push(source);
            }

            const summaryByTemplateId = new Map();
            for (const template of nextTemplates) {
                const templateId = String(template?.id || "").trim();
                const languageSet = new Set();
                const sources = sourcesByTemplateId.get(templateId) || [];

                for (const source of sources) {
                    const requestId = String(source?.requestId || "").trim().toLowerCase();
                    const archiveLanguage = requestId ? archiveLanguageByRequestId.get(requestId) : "";
                    const sourceLanguage = formatLanguageLabel(archiveLanguage || "");
                    if (sourceLanguage && sourceLanguage !== "Unknown") {
                        languageSet.add(sourceLanguage);
                    }
                }

                if (!languageSet.size) {
                    const htmlLanguage = formatLanguageLabel(extractHtmlLangCode(template?.htmlContent || ""));
                    if (htmlLanguage && htmlLanguage !== "Unknown") {
                        languageSet.add(htmlLanguage);
                    }
                }

                summaryByTemplateId.set(templateId, Array.from(languageSet));
            }
            setTemplateLanguageSummaryById(summaryByTemplateId);
        } catch (apiError) {
            setError(apiError.message || "Failed to load campaigns.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [search]);

    function resetFeedback() {
        setMessage("");
        setError("");
    }

    function closeModals() {
        if (saving) return;
        setCreateOpen(false);
        setEditOpen(false);
        setSelectedCampaign(null);
        setForm(FORM_DEFAULT);
        setTemplateSelectionValue("");
    }

    function openCreate() {
        resetFeedback();
        setForm(FORM_DEFAULT);
        setTemplateSelectionValue("");
        setCreateOpen(true);
    }

    function openEdit(campaign) {
        resetFeedback();
        setSelectedCampaign(campaign);
        setForm({
            code: campaign.code || "",
            name: campaign.name || "",
            status: campaign.status || "DRAFT",
            templateMasterId: campaign.templateMasterId || "",
            areaMasterId: campaign.areaMasterId || "",
            marketMasterId: campaign.marketMasterId || "",
            additionalMarkets: Array.isArray(campaign.additionalMarkets) ? campaign.additionalMarkets : []
        });
        setTemplateSelectionValue("");
        setEditOpen(true);
    }

    async function createCampaign(event) {
        event.preventDefault();
        if (!form.name.trim()) {
            setError("Campaign name is required.");
            return;
        }
        if (!String(form.templateMasterId || "").trim()) {
            setError("Template is required.");
            return;
        }
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/campaigns", {
                method: "POST",
                body: JSON.stringify(form)
            });
            setMessage("Campaign created.");
            setCreateOpen(false);
            await loadData();
        } catch (apiError) {
            setError(apiError.message || "Failed to create campaign.");
        } finally {
            setSaving(false);
        }
    }

    async function updateCampaign(event) {
        event.preventDefault();
        if (!selectedCampaign?.id) return;
        if (!form.name.trim()) {
            setError("Campaign name is required.");
            return;
        }
        if (!String(form.templateMasterId || "").trim()) {
            setError("Template is required.");
            return;
        }
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/campaigns/${selectedCampaign.id}`, {
                method: "PATCH",
                body: JSON.stringify(form)
            });
            setMessage("Campaign updated.");
            setEditOpen(false);
            setSelectedCampaign(null);
            await loadData();
        } catch (apiError) {
            setError(apiError.message || "Failed to update campaign.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteCampaign(campaign) {
        if (!campaign?.id) return;
        if (!window.confirm(`Archive campaign "${campaign.name}"?`)) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
            setMessage("Campaign archived.");
            await loadData();
        } catch (apiError) {
            setError(apiError.message || "Failed to archive campaign.");
        } finally {
            setSaving(false);
        }
    }

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

    const filteredCampaigns = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return campaigns;
        return campaigns.filter((campaign) => {
            const haystack = [
                campaign.code,
                campaign.name,
                campaign.status,
                campaign.templateName,
                campaign.areaName,
                campaign.marketName,
                campaign.createdByName
            ].join(" ").toLowerCase();
            return haystack.includes(keyword);
        });
    }, [campaigns, search]);

    const sortedCampaigns = useMemo(() => {
        const list = [...filteredCampaigns];
        list.sort((a, b) => {
            let valueA = "";
            let valueB = "";

            if (sort.key === "updatedAt" || sort.key === "createdAt") {
                valueA = new Date(a?.[sort.key] || 0).getTime();
                valueB = new Date(b?.[sort.key] || 0).getTime();
            } else if (sort.key === "currentVersionNumber" || sort.key === "currentProofRound") {
                valueA = Number(a?.[sort.key] || 0);
                valueB = Number(b?.[sort.key] || 0);
            } else {
                valueA = String(a?.[sort.key] ?? "").toLowerCase();
                valueB = String(b?.[sort.key] ?? "").toLowerCase();
            }

            if (valueA < valueB) return sort.direction === "asc" ? -1 : 1;
            if (valueA > valueB) return sort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredCampaigns, sort]);

    const pageCount = Math.max(1, Math.ceil(sortedCampaigns.length / PAGE_SIZE));
    const pagedCampaigns = useMemo(() => {
        const safePage = Math.min(page, pageCount);
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedCampaigns.slice(start, start + PAGE_SIZE);
    }, [sortedCampaigns, page, pageCount]);

    useEffect(() => {
        setPage((current) => Math.min(current, pageCount));
    }, [pageCount]);

    function renderForm(onSubmit, submitLabel) {
        return (
            <form onSubmit={onSubmit} className="space-y-3">
                <div className="grid two">
                    <input
                        placeholder="Campaign code (optional auto-generated)"
                        value={form.code}
                        onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    />
                    <input
                        placeholder="Campaign name"
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        required
                    />
                </div>

                <div className="grid two">
                    <SearchSelect
                        value={form.status}
                        onChange={(nextStatus) => setForm((current) => ({ ...current, status: nextStatus }))}
                        options={STATUS_OPTIONS}
                        placeholder="Select status"
                    />
                    <SearchSelect
                        value={selectedTemplateOptionValue}
                        onChange={(value) => {
                            const option = templateOptionByValue.get(String(value || ""));
                            const templateMasterId = option?.templateId || "";
                            setTemplateSelectionValue(String(value || ""));
                            setForm((current) => ({ ...current, templateMasterId }));
                        }}
                        options={templateSelectOptions}
                        placeholder="Select template"
                    />
                </div>

                <div className="grid two">
                    <SearchSelect
                        value={form.areaMasterId}
                        onChange={(value) => setForm((current) => ({ ...current, areaMasterId: value }))}
                        options={areas
                            .filter((area) => area.isActive)
                            .map((area) => ({
                                value: area.id,
                                label: area.name
                        }))}
                        placeholder="Select area"
                    />
                    <SearchSelect
                        value={form.marketMasterId}
                        onChange={(value) => setForm((current) => ({ ...current, marketMasterId: value }))}
                        options={marketOptions
                            .filter((market) => market.isActive)
                            .map((market) => ({
                                value: market.id,
                                label: market.name
                        }))}
                        placeholder="Select market"
                    />
                </div>

                <div>
                    <SearchSelect
                        isMulti
                        value={form.additionalMarkets}
                        onChange={(value) => setForm((current) => ({ ...current, additionalMarkets: value }))}
                        options={additionalMarketOptions
                            .filter((market) => market.isActive)
                            .map((market) => ({
                                value: market.name,
                                label: market.name
                            }))}
                        placeholder="Select additional markets"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <button type="button" className="button-secondary" onClick={closeModals} disabled={saving}>Cancel</button>
                    <button type="submit" className="button-primary" disabled={saving}>{saving ? "Saving..." : submitLabel}</button>
                </div>
            </form>
        );
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>Campaigns</h2>
                <p>Create and manage campaign workspaces for builder, versions, proof rounds, and approvals.</p>
            </div>

            {message && <section className="card"><p className="msg ok">{message}</p></section>}
            {error && <section className="card"><p className="msg error">{error}</p></section>}

            <section className="card">
                <div className="row-between mb-3">
                    <h3>Campaign list</h3>
                    {canManage && (
                        <button type="button" className="button-primary" onClick={openCreate}>
                            Create campaign
                        </button>
                    )}
                </div>

                <DataTableControls
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Search code, campaign name, template, market..."
                    resultCount={sortedCampaigns.length}
                    totalCount={campaigns.length}
                />

                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("code")}>{sortLabel("code", "Code")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("name")}>{sortLabel("name", "Campaign")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("status")}>{sortLabel("status", "Status")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("templateName")}>{sortLabel("templateName", "Template")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("currentVersionNumber")}>{sortLabel("currentVersionNumber", "Version")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("currentProofRound")}>{sortLabel("currentProofRound", "Proof")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("createdByName")}>{sortLabel("createdByName", "Creator")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("updatedAt")}>{sortLabel("updatedAt", "Updated")}</button></th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={9}>Loading campaigns...</td></tr>
                            )}
                            {!loading && pagedCampaigns.length === 0 && (
                                <tr><td colSpan={9}>No campaigns yet.</td></tr>
                            )}
                            {!loading && pagedCampaigns.map((campaign) => (
                                <tr key={campaign.id}>
                                    <td>{campaign.code}</td>
                                    <td>
                                        <strong>{campaign.name}</strong>
                                        <p className="muted">{campaign.areaName || "-"} / {campaign.marketName || "-"}</p>
                                    </td>
                                    <td><span className={statusPillClass(campaign.status)}>{normalizeStatusLabel(campaign.status)}</span></td>
                                    <td>{campaign.templateName || "-"}</td>
                                    <td>{campaign.currentVersionNumber || 0}</td>
                                    <td>{campaign.currentProofRound || 0}</td>
                                    <td>{campaign.createdByName || campaign.createdById || "-"}</td>
                                    <td>{formatDateTime(campaign.updatedAt)}</td>
                                    <td>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="button-secondary"
                                                onClick={() => navigate(`/campaigns/${encodeURIComponent(campaign.id)}/manage`)}
                                            >
                                                Manage
                                            </button>
                                            {canManage && (
                                                <>
                                                    <button type="button" className="button-secondary" onClick={() => openEdit(campaign)}>Edit</button>
                                                    <button type="button" className="button-secondary" onClick={() => deleteCampaign(campaign)}>Delete</button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <DataTablePagination
                    page={page}
                    pageCount={pageCount}
                    onPageChange={setPage}
                />
            </section>

            <SettingsModal title="Create Campaign" open={createOpen} onClose={closeModals} maxWidthClass="max-w-4xl">
                {renderForm(createCampaign, "Create campaign")}
            </SettingsModal>

            <SettingsModal title="Edit Campaign" open={editOpen} onClose={closeModals} maxWidthClass="max-w-4xl">
                {renderForm(updateCampaign, "Update campaign")}
            </SettingsModal>
        </div>
    );
}
