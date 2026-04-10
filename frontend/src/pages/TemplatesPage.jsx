import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html as htmlLang } from "@codemirror/lang-html";
import { apiRequest } from "../api";
import { useAuth } from "../auth";
import SettingsModal from "../components/SettingsModal";
import DataTableControls, { DataTablePagination } from "../components/DataTableControls";
import { loadArchiveEmails } from "../archive-utils";

const TEMPLATE_EDIT_DEFAULT = {
    isActive: true,
    htmlContent: ""
};
const PAGE_SIZE = 8;
const HTML_EDITOR_EXTENSIONS = [htmlLang()];
const DEFAULT_SECTION_RULES = {
    detectSearch: true,
    splitOnDivider: true,
    forceFirstAsHeader: false,
    forceLastAsFooter: false,
    forcedSectionBreakIndexes: []
};

const DEVICES = {
    mobile: { width: 375, label: "MOBILE" },
    tablet: { width: 768, label: "TABLET" },
    desktop: { width: 1200, label: "DESKTOP" }
};

function extractHtmlLangCode(htmlContent) {
    const html = String(htmlContent || "");
    if (!html.trim()) return "";

    const htmlLangMatch = html.match(/<html[^>]*\blang\s*=\s*["']?([^"'\s>]+)/i);
    if (htmlLangMatch?.[1]) return String(htmlLangMatch[1]).trim().toLowerCase();

    const metaLangMatch = html.match(/<meta[^>]*(?:http-equiv=["']content-language["']|name=["']language["'])[^>]*content=["']([^"']+)["']/i);
    if (metaLangMatch?.[1]) return String(metaLangMatch[1]).trim().toLowerCase();

    return "";
}

function formatLanguageLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Unknown";
    const normalized = raw.toLowerCase();
    if (normalized.includes("english") || normalized === "en" || normalized.startsWith("en-")) return "English";
    if (normalized.includes("bahasa") || normalized.includes("indonesian") || normalized === "id" || normalized.startsWith("id-")) return "Bahasa";
    if (normalized.includes("japanese") || normalized === "ja" || normalized.startsWith("ja-")) return "Japanese";
    if (normalized.includes("korean") || normalized === "ko" || normalized.startsWith("ko-")) return "Korean";
    if (normalized.includes("chinese") || normalized === "zh" || normalized.startsWith("zh-")) return "Chinese";
    if (normalized.includes("thai") || normalized === "th" || normalized.startsWith("th-")) return "Thai";
    return raw;
}

function resolveSourceLanguage(sourcePreview, archiveLanguageByRequestId, fallbackLanguage = "") {
    const requestId = String(sourcePreview?.requestId || "").trim().toLowerCase();
    const archiveLanguage = requestId ? String(archiveLanguageByRequestId.get(requestId) || "").trim() : "";
    if (archiveLanguage) return formatLanguageLabel(archiveLanguage);

    const fallback = formatLanguageLabel(fallbackLanguage);
    return fallback && fallback !== "Unknown" ? fallback : "Unknown";
}

function getPreviewCondition(previewLink, previewStatusByUrl) {
    const url = String(previewLink || "").trim();
    if (!url) return "missing";
    return previewStatusByUrl.get(url)?.condition || "unknown";
}

export default function TemplatesPage() {
    const { permissions } = useAuth();
    const canManage = useMemo(
        () => permissions.includes("*") || permissions.includes("settings:manage_users"),
        [permissions]
    );

    const [templates, setTemplates] = useState([]);
    const [sourceCampaigns, setSourceCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [resolvingPreviews, setResolvingPreviews] = useState(false);
    const [importingArchive, setImportingArchive] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ key: "code", direction: "asc" });

    const [templateEditOpen, setTemplateEditOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedTemplateRowName, setSelectedTemplateRowName] = useState("");
    const [selectedTemplateRowStatus, setSelectedTemplateRowStatus] = useState("");
    const [templateEditData, setTemplateEditData] = useState(TEMPLATE_EDIT_DEFAULT);

    const [previewDevice, setPreviewDevice] = useState("desktop");
    const [previewModal, setPreviewModal] = useState({
        open: false,
        url: "",
        html: "",
        id: "",
        name: ""
    });
    const [previewStatusByUrl, setPreviewStatusByUrl] = useState(new Map());
    const [archiveLanguageByRequestId, setArchiveLanguageByRequestId] = useState(new Map());
    const [templateSectionRulesByCode, setTemplateSectionRulesByCode] = useState({});
    const [sectionRulesDefault, setSectionRulesDefault] = useState(DEFAULT_SECTION_RULES);
    const [sectionRulesModalOpen, setSectionRulesModalOpen] = useState(false);
    const [sectionRulesEditorJson, setSectionRulesEditorJson] = useState("{}");
    const [sectionRulesSaving, setSectionRulesSaving] = useState(false);

    async function loadData() {
        try {
            setLoading(true);
            const [templatesPayload, sourcesPayload, archiveEmails, sectionRulesPayload] = await Promise.all([
                apiRequest("/api/settings/templates"),
                apiRequest("/api/settings/source-campaigns"),
                loadArchiveEmails().catch(() => []),
                apiRequest("/api/settings/template-section-rules").catch(() => ({ defaultRules: DEFAULT_SECTION_RULES, byCode: {} }))
            ]);
            setTemplates(templatesPayload.templates || []);
            setSourceCampaigns(sourcesPayload.sourceCampaigns || []);
            setSectionRulesDefault(sectionRulesPayload?.defaultRules || DEFAULT_SECTION_RULES);
            setTemplateSectionRulesByCode(sectionRulesPayload?.byCode || {});

            const languageMap = new Map();
            for (const email of archiveEmails || []) {
                const requestId = String(email?.requestId || "").trim().toLowerCase();
                if (!requestId) continue;
                const targetLanguage = String(email?.targetLanguage || "").trim();
                if (!targetLanguage) continue;
                if (!languageMap.has(requestId)) {
                    languageMap.set(requestId, targetLanguage);
                }
            }
            setArchiveLanguageByRequestId(languageMap);
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (!previewModal.open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [previewModal.open]);

    function resetFeedback() {
        setMessage("");
        setError("");
    }

    function closeAllModals() {
        if (saving) return;
        setTemplateEditOpen(false);
        setSelectedTemplate(null);
        setSelectedTemplateRowName("");
        setSelectedTemplateRowStatus("");
        setTemplateEditData(TEMPLATE_EDIT_DEFAULT);
    }

    function openTemplateEdit(template, row = null) {
        resetFeedback();
        setSelectedTemplate(template);
        setSelectedTemplateRowName(String(row?.displayName || ""));
        setSelectedTemplateRowStatus(String(row?.extractionMessage || ""));
        setTemplateEditData({
            isActive: Boolean(template.isActive),
            htmlContent: String(template.htmlContent || "")
        });
        setTemplateEditOpen(true);
    }

    async function updateTemplate(event) {
        event.preventDefault();
        if (!selectedTemplate?.id) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/templates/${selectedTemplate.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    isActive: templateEditData.isActive,
                    htmlContent: templateEditData.htmlContent
                })
            });
            setMessage("Template updated.");
            setTemplateEditOpen(false);
            setSelectedTemplate(null);
            await loadData();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function deleteTemplate(template) {
        if (!template?.id) return;
        if (!window.confirm(`Delete template "${template.name}"?`)) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/templates/${template.id}`, {
                method: "DELETE"
            });
            setMessage("Template deleted.");
            await loadData();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function importAllTemplateHtmlFromArchive() {
        resetFeedback();
        try {
            setImportingArchive(true);
            const payload = await apiRequest("/api/settings/templates/import-from-archive", {
                method: "POST"
            });
            const importedCount = (payload.summary || []).filter((item) => item.status === "imported").length;
            const skippedCount = (payload.summary || []).filter((item) => item.status === "skipped").length;
            setMessage(`Archive HTML import complete. Imported: ${importedCount}, skipped: ${skippedCount}.`);
            await loadData();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setImportingArchive(false);
        }
    }

    async function importTemplateHtmlFromArchive(template) {
        if (!template?.id) return;
        resetFeedback();
        try {
            setImportingArchive(true);
            const payload = await apiRequest(`/api/settings/templates/${template.id}/import-from-archive`, {
                method: "POST"
            });
            const sourceLabel = payload.importedFrom?.requestId || payload.importedFrom?.sourceCampaignName || "archive source";
            setMessage(`Template ${template.code} HTML imported from ${sourceLabel}.`);
            await loadData();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setImportingArchive(false);
        }
    }

    function openSectionRulesEditor() {
        resetFeedback();
        const payload = templateSectionRulesByCode && typeof templateSectionRulesByCode === "object"
            ? templateSectionRulesByCode
            : {};
        setSectionRulesEditorJson(JSON.stringify(payload, null, 2));
        setSectionRulesModalOpen(true);
    }

    function closeSectionRulesEditor() {
        if (sectionRulesSaving) return;
        setSectionRulesModalOpen(false);
    }

    function seedSectionRulesByTemplateCodes() {
        const current = (() => {
            try {
                const parsed = JSON.parse(String(sectionRulesEditorJson || "{}"));
                return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
            } catch (_error) {
                return {};
            }
        })();
        const next = { ...current };
        for (const template of templates) {
            const code = String(template?.code || "").trim();
            if (!code) continue;
            if (!next[code] || typeof next[code] !== "object") {
                next[code] = { ...sectionRulesDefault };
            }
        }
        setSectionRulesEditorJson(JSON.stringify(next, null, 2));
    }

    async function saveSectionRulesByCode() {
        resetFeedback();
        let parsed = null;
        try {
            parsed = JSON.parse(String(sectionRulesEditorJson || "{}"));
        } catch (_error) {
            setError("Section rules JSON is invalid.");
            return;
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            setError("Section rules must be a JSON object keyed by template code.");
            return;
        }

        try {
            setSectionRulesSaving(true);
            const payload = await apiRequest("/api/settings/template-section-rules", {
                method: "PATCH",
                body: JSON.stringify({ byCode: parsed })
            });
            setTemplateSectionRulesByCode(payload?.byCode || {});
            setSectionRulesDefault(payload?.defaultRules || DEFAULT_SECTION_RULES);
            setSectionRulesModalOpen(false);
            setMessage("Template section rules saved.");
            await loadData();
        } catch (apiError) {
            const rawMessage = String(apiError?.message || "Failed to save section rules.");
            if (rawMessage.toLowerCase() === "template not found.") {
                setError("Section rules endpoint not loaded yet. Please restart API server, then try Save rules again.");
            } else {
                setError(rawMessage);
            }
        } finally {
            setSectionRulesSaving(false);
        }
    }

    function openPreview(template, source, displayName = "") {
        const htmlContent = String(template?.htmlContent || "");
        const previewUrl = String(source?.previewLink || "");
        if (!htmlContent.trim() && !previewUrl.trim()) return;

        setPreviewDevice("desktop");
        setPreviewModal({
            open: true,
            url: previewUrl,
            html: htmlContent,
            id: String(source?.requestId || `Template ${template.code}`),
            name: String(displayName || template.name || "Template Preview")
        });
    }

    function closePreview() {
        setPreviewModal((current) => ({ ...current, open: false }));
    }

    useEffect(() => {
        let active = true;

        async function resolvePreviewStatuses() {
            const uniquePreviewLinks = Array.from(new Set(
                sourceCampaigns
                    .map((source) => String(source?.previewLink || "").trim())
                    .filter(Boolean)
            ));

            if (!uniquePreviewLinks.length) {
                if (active) {
                    setPreviewStatusByUrl(new Map());
                    setResolvingPreviews(false);
                }
                return;
            }

            setResolvingPreviews(true);
            const checks = await Promise.all(
                uniquePreviewLinks.map(async (url) => {
                    const key = String(url || "").trim();
                    if (!key) return ["", { condition: "missing", status: 0, reason: "missing" }];

                    try {
                        const payload = await apiRequest(`/api/check-url?url=${encodeURIComponent(key)}`);
                        const broken = Boolean(payload?.broken || !payload?.status || payload.status >= 400);
                        return [
                            key,
                            {
                                condition: broken ? "broken" : "working",
                                status: Number(payload?.status || 0),
                                reason: String(payload?.reason || ""),
                                broken
                            }
                        ];
                    } catch (_error) {
                        return [
                            key,
                            {
                                condition: "broken",
                                status: 0,
                                reason: "request-failed",
                                broken: true
                            }
                        ];
                    }
                })
            );

            if (!active) return;
            setPreviewStatusByUrl(new Map(checks.filter(([key]) => key)));
            setResolvingPreviews(false);
        }

        resolvePreviewStatuses();
        return () => {
            active = false;
        };
    }, [sourceCampaigns]);

    const templateLanguageRows = useMemo(() => {
        const sourcesByTemplateId = new Map();
        for (const source of sourceCampaigns) {
            const templateId = String(source?.templateMasterId || "").trim();
            if (!templateId) continue;
            if (!sourcesByTemplateId.has(templateId)) {
                sourcesByTemplateId.set(templateId, []);
            }
            sourcesByTemplateId.get(templateId).push(source);
        }

        const rows = [];
        for (const template of templates) {
            const templateId = String(template?.id || "");
            const sources = sourcesByTemplateId.get(templateId) || [];
            const hasStoredHtml = Boolean(String(template?.htmlContent || "").trim());
            const templateFallbackLanguage = formatLanguageLabel(extractHtmlLangCode(template?.htmlContent || "") || "");

            if (!sources.length) {
                const htmlLanguage = formatLanguageLabel(extractHtmlLangCode(template?.htmlContent || "") || "Unknown");
                rows.push({
                    id: `${templateId}::${htmlLanguage.toLowerCase()}`,
                    template,
                    templateCodeLabel: `Template ${template.code}`,
                    displayName: `Template ${template.code} - ${htmlLanguage}`,
                    sourcePreview: null,
                    linkCondition: hasStoredHtml ? "stored" : "missing",
                    hasWorkingLink: hasStoredHtml,
                    extractionMessage: hasStoredHtml ? "Ready" : "Cannot extract the template",
                    useStoredPreview: hasStoredHtml,
                    canImportFromArchive: false
                });
                continue;
            }

            const groupsByLanguage = new Map();
            for (const source of sources) {
                const languageLabel = resolveSourceLanguage(source, archiveLanguageByRequestId, templateFallbackLanguage);
                const languageKey = languageLabel.toLowerCase();
                if (!groupsByLanguage.has(languageKey)) {
                    groupsByLanguage.set(languageKey, {
                        languageLabel,
                        sources: []
                    });
                }
                groupsByLanguage.get(languageKey).sources.push(source);
            }

            for (const [languageKey, group] of groupsByLanguage.entries()) {
                const prioritizedSources = [...group.sources].sort((a, b) => {
                    const conditionA = getPreviewCondition(a?.previewLink, previewStatusByUrl);
                    const conditionB = getPreviewCondition(b?.previewLink, previewStatusByUrl);
                    const scoreA = conditionA === "working" ? 2 : (conditionA === "unknown" ? 1 : 0);
                    const scoreB = conditionB === "working" ? 2 : (conditionB === "unknown" ? 1 : 0);
                    if (scoreA !== scoreB) return scoreB - scoreA;

                    const activeA = a?.isActive ? 1 : 0;
                    const activeB = b?.isActive ? 1 : 0;
                    if (activeA !== activeB) return activeB - activeA;

                    const updatedA = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
                    const updatedB = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
                    return updatedB - updatedA;
                });

                const sourcePreview = prioritizedSources[0] || null;
                const hasWorkingPreviewLink = prioritizedSources.some(
                    (source) => getPreviewCondition(source?.previewLink, previewStatusByUrl) === "working"
                );
                const hasUnknownPreviewLink = prioritizedSources.some(
                    (source) => getPreviewCondition(source?.previewLink, previewStatusByUrl) === "unknown"
                );
                const linkCondition = getPreviewCondition(sourcePreview?.previewLink, previewStatusByUrl);

                rows.push({
                    id: `${templateId}::${languageKey}`,
                    template,
                    templateCodeLabel: `Template ${template.code}`,
                    displayName: `Template ${template.code} - ${group.languageLabel}`,
                    sourcePreview,
                    linkCondition,
                    hasWorkingLink: hasWorkingPreviewLink,
                    extractionMessage: hasWorkingPreviewLink
                        ? "Ready"
                        : (hasUnknownPreviewLink && resolvingPreviews)
                            ? "Checking link..."
                        : (linkCondition === "broken" ? "Broken link" : "Cannot extract the template"),
                    useStoredPreview: false,
                    canImportFromArchive: hasWorkingPreviewLink
                });
            }
        }

        return rows;
    }, [templates, sourceCampaigns, archiveLanguageByRequestId, previewStatusByUrl, resolvingPreviews]);

    const filteredRows = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return templateLanguageRows;

        return templateLanguageRows.filter((row) => {
            const hasUrlPreview = Boolean(String(row?.sourcePreview?.previewLink || "").trim());
            const haystack = [
                row.template?.code,
                row.template?.name,
                row.displayName,
                row.template?.isMain ? "yes" : "no",
                row.template?.isActive ? "yes" : "no",
                row.sourcePreview?.requestId || "",
                row.linkCondition,
                hasUrlPreview ? "has preview" : "no preview",
                row.extractionMessage
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [templateLanguageRows, search]);

    const sortedRows = useMemo(() => {
        const list = [...filteredRows];
        list.sort((a, b) => {
            let valueA = "";
            let valueB = "";

            if (sort.key === "code") {
                valueA = String(Number(a?.template?.code || 0)).padStart(4, "0");
                valueB = String(Number(b?.template?.code || 0)).padStart(4, "0");
            } else if (sort.key === "name") {
                valueA = String(a?.displayName || "").toLowerCase();
                valueB = String(b?.displayName || "").toLowerCase();
            } else if (sort.key === "isMain") {
                valueA = a?.template?.isMain ? "yes" : "no";
                valueB = b?.template?.isMain ? "yes" : "no";
            } else if (sort.key === "isActive") {
                valueA = a?.template?.isActive ? "yes" : "no";
                valueB = b?.template?.isActive ? "yes" : "no";
            } else if (sort.key === "preview") {
                const rank = (row) => {
                    const rowHasStoredHtml = Boolean(String(row?.template?.htmlContent || "").trim());
                    if (row?.linkCondition === "working") return "4";
                    if (row?.useStoredPreview && rowHasStoredHtml) return "3";
                    if (row?.linkCondition === "unknown") return "2";
                    if (row?.linkCondition === "broken") return "1";
                    return "0";
                };
                valueA = rank(a);
                valueB = rank(b);
            } else if (sort.key === "extractStatus") {
                valueA = a?.hasWorkingLink ? "1" : "0";
                valueB = b?.hasWorkingLink ? "1" : "0";
            } else {
                valueA = String(a?.[sort.key] ?? "").toLowerCase();
                valueB = String(b?.[sort.key] ?? "").toLowerCase();
            }

            if (valueA < valueB) return sort.direction === "asc" ? -1 : 1;
            if (valueA > valueB) return sort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredRows, sort]);

    const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
    const pagedRows = useMemo(() => {
        const safePage = Math.min(page, pageCount);
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedRows.slice(start, start + PAGE_SIZE);
    }, [sortedRows, page, pageCount]);

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
        return `${label} ${sort.direction === "asc" ? "(asc)" : "(desc)"}`;
    }

    const previewWrapperWidth = DEVICES[previewDevice]?.width || DEVICES.desktop.width;

    return (
        <div className="page">
            <div className="page-head">
                <h2>Template</h2>
                <p>Manage fixed template group (Template 1-6). Source campaigns are now in Admin - Source Campaigns.</p>
            </div>

            {message && <section className="card"><p className="msg ok">{message}</p></section>}
            {error && <section className="card"><p className="msg error">{error}</p></section>}

            <section className="card">
                <div className="row-between">
                    <h3>Template group master</h3>
                    {canManage && (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={openSectionRulesEditor}
                                disabled={loading || importingArchive || saving || sectionRulesSaving}
                            >
                                Section Rules (by code)
                            </button>
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={importAllTemplateHtmlFromArchive}
                                disabled={loading || importingArchive || saving || sectionRulesSaving}
                            >
                                {importingArchive ? "Importing..." : "Store Archive HTML"}
                            </button>
                        </div>
                    )}
                </div>
                <p className="muted mt-2">Template 1-6 are available campaign starters. Campaigns can select any active template.</p>
                {resolvingPreviews && <p className="muted mt-2">Validating preview links...</p>}

                {loading && <p className="muted mt-3">Loading template groups...</p>}

                {!loading && (
                    <div className="mt-4">
                        <DataTableControls
                            searchValue={search}
                            onSearchChange={setSearch}
                            searchPlaceholder="Search template code, template + language, main, preview..."
                            resultCount={filteredRows.length}
                            totalCount={templateLanguageRows.length}
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
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("code")}>{sortLabel("code", "Code")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("name")}>{sortLabel("name", "Name")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("isMain")}>{sortLabel("isMain", "Main")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("isActive")}>{sortLabel("isActive", "Active")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("preview")}>{sortLabel("preview", "Preview")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("extractStatus")}>{sortLabel("extractStatus", "Extract Status")}</button></th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!filteredRows.length && (
                                    <tr>
                                        <td colSpan={7} className="text-center text-gray-500">No templates found.</td>
                                    </tr>
                                )}
                                {pagedRows.map((row) => {
                                    const template = row.template;
                                    const sourcePreview = row.sourcePreview;
                                    const hasStoredHtml = Boolean(String(template?.htmlContent || "").trim());
                                    const hasUrlPreview = Boolean(String(sourcePreview?.previewLink || "").trim());
                                    const canShowPreview = row.useStoredPreview
                                        ? hasStoredHtml
                                        : (row.hasWorkingLink && hasUrlPreview);
                                    const statusLabel = row.linkCondition === "broken"
                                        ? "Broken link"
                                        : row.extractionMessage;

                                    return (
                                        <tr key={row.id}>
                                            <td>{row.templateCodeLabel}</td>
                                            <td>{row.displayName}</td>
                                            <td>{template?.isMain ? "Yes" : "No"}</td>
                                            <td>{template?.isActive ? "Yes" : "No"}</td>
                                            <td>
                                                {canShowPreview ? (
                                                    <div className="flex items-center gap-2">
                                                        {row.useStoredPreview ? (
                                                            <button
                                                                type="button"
                                                                className="template-preview-thumb"
                                                                onClick={() => openPreview(template, sourcePreview, row.displayName)}
                                                                title="View stored template HTML preview"
                                                            >
                                                                <iframe
                                                                    title={`${row.displayName} stored HTML thumbnail`}
                                                                    srcDoc={template.htmlContent}
                                                                    loading="lazy"
                                                                    sandbox="allow-same-origin"
                                                                />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="template-preview-thumb"
                                                                onClick={() => openPreview(template, sourcePreview, row.displayName)}
                                                                title="View template preview"
                                                            >
                                                                <iframe
                                                                    title={`${row.displayName} thumbnail`}
                                                                    src={sourcePreview.previewLink}
                                                                    loading="lazy"
                                                                    sandbox="allow-same-origin"
                                                                />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="button-secondary"
                                                            onClick={() => openPreview(template, sourcePreview, row.displayName)}
                                                        >
                                                            View
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="muted">{statusLabel}</span>
                                                )}
                                            </td>
                                            <td>
                                                {row.hasWorkingLink ? (
                                                    <span className="pill done">Ready</span>
                                                ) : (
                                                    <span className="muted">{statusLabel}</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        className="button-secondary"
                                                        onClick={() => openTemplateEdit(template, row)}
                                                        disabled={!canManage}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="button-secondary"
                                                        onClick={() => importTemplateHtmlFromArchive(template)}
                                                        disabled={!canManage || saving || importingArchive || !row.canImportFromArchive}
                                                    >
                                                        Import HTML
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="button-secondary text-error-500"
                                                        onClick={() => deleteTemplate(template)}
                                                        disabled={!canManage || saving}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
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

            <SettingsModal title="Edit Template" open={templateEditOpen} onClose={closeAllModals} maxWidthClass="max-w-7xl">
                <form className="grid gap-3" onSubmit={updateTemplate}>
                    <p className="muted">Template code: Template {selectedTemplate?.code || "-"}</p>
                    {selectedTemplateRowName && (
                        <p className="muted">Selected row: {selectedTemplateRowName}{selectedTemplateRowStatus ? ` (${selectedTemplateRowStatus})` : ""}</p>
                    )}
                    <p className="muted">This editor updates the global Template {selectedTemplate?.code || "-"} HTML shared by its language rows.</p>
                    <input value={selectedTemplate?.name || ""} readOnly />
                    <label htmlFor="template-html-editor">Template HTML (stored in database)</label>
                    <div className="template-editor-grid" id="template-html-editor">
                        <div className="template-editor-pane">
                            <div className="template-editor-pane-head">Live code editor</div>
                            <CodeMirror
                                value={templateEditData.htmlContent}
                                height="420px"
                                theme="light"
                                extensions={HTML_EDITOR_EXTENSIONS}
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: true,
                                    highlightActiveLine: true,
                                    highlightActiveLineGutter: true,
                                    autocompletion: true
                                }}
                                onChange={(value) => setTemplateEditData({ ...templateEditData, htmlContent: value })}
                            />
                        </div>
                        <div className="template-editor-pane">
                            <div className="template-editor-pane-head">Live render preview</div>
                            {String(templateEditData.htmlContent || "").trim() ? (
                                <iframe
                                    title="Template live render preview"
                                    className="template-editor-preview-frame"
                                    sandbox="allow-same-origin"
                                    srcDoc={templateEditData.htmlContent}
                                />
                            ) : (
                                <div className="template-editor-preview-empty">No HTML yet. Import from archive or paste HTML.</div>
                            )}
                        </div>
                    </div>
                    <label className="inline-check">
                        <input
                            type="checkbox"
                            checked={templateEditData.isActive}
                            onChange={(event) => setTemplateEditData({ ...templateEditData, isActive: event.target.checked })}
                        />
                        <span className="inline-check-box" aria-hidden="true">
                            <svg className="inline-check-icon" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        Active
                    </label>
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeAllModals} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save changes"}
                        </button>
                    </div>
                </form>
            </SettingsModal>

            <SettingsModal title="Template Section Rules (by code)" open={sectionRulesModalOpen} onClose={closeSectionRulesEditor} maxWidthClass="max-w-5xl">
                <div className="grid gap-3">
                    <p className="muted">
                        Configure conversion rules used by Builder when clicking <strong>Convert HTML to editable blocks</strong>.
                        Key format must be template code (`"1"`, `"2"`, etc).
                    </p>
                    <p className="muted">
                        Default rule: {JSON.stringify(sectionRulesDefault)}
                    </p>
                    <label htmlFor="template-section-rules-editor">`byCode` JSON</label>
                    <textarea
                        id="template-section-rules-editor"
                        value={sectionRulesEditorJson}
                        onChange={(event) => setSectionRulesEditorJson(event.target.value)}
                        style={{ minHeight: 360, fontFamily: "monospace" }}
                        disabled={sectionRulesSaving}
                    />
                    <div className="mt-2 flex justify-between gap-2">
                        <button
                            type="button"
                            className="button-secondary"
                            onClick={seedSectionRulesByTemplateCodes}
                            disabled={sectionRulesSaving}
                        >
                            Add missing template codes
                        </button>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="button-secondary" onClick={closeSectionRulesEditor} disabled={sectionRulesSaving}>
                                Cancel
                            </button>
                            <button type="button" className="button-primary" onClick={saveSectionRulesByCode} disabled={sectionRulesSaving}>
                                {sectionRulesSaving ? "Saving..." : "Save rules"}
                            </button>
                        </div>
                    </div>
                </div>
            </SettingsModal>

            {previewModal.open && (
                <div className="archive-preview-modal-backdrop" role="dialog" aria-modal="true" aria-label="Template preview">
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
                                <div className="archive-preview-modal-url">
                                    {previewModal.url || "Stored template HTML preview"}
                                </div>
                                <iframe
                                    title={`template-preview-${previewModal.id || "email"}`}
                                    className="archive-preview-modal-iframe"
                                    sandbox="allow-same-origin"
                                    srcDoc={previewModal.html || undefined}
                                    src={previewModal.html ? undefined : previewModal.url}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
