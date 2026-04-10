import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api";
import { NavLink, useParams, useSearchParams } from "react-router-dom";
import SearchSelect from "../components/SearchSelect";
import Step2Canvas from "../components/builder/Step2Canvas";
import MediaPickerModal from "../components/MediaPickerModal";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

const DRAFT_KEY = "edm_builder_draft_v2";
const PROOF_LOG_KEY = "edm_builder_proof_logs_v2";
const DRAFT_VERSIONS_KEY = "edm_builder_draft_versions_v2";
const DRAFT_SELECTION_KEY_PREFIX = "edm_builder_selected_draft_v1";
const BUILDER_HISTORY_LIMIT = 80;
const MAX_RECIPIENTS = 10;
const PERSONALIZATION_TOKENS = [
    { key: "memberName", label: "Member Name", token: "{{member_name}}" },
    { key: "bonvoyTier", label: "Bonvoy Tier Level", token: "{{bonvoy_tier}}" },
    { key: "pointsBalance", label: "Points Balance", token: "{{points_balance}}" }
];
const PERSONALIZATION_SAMPLE_DEFAULTS = {
    memberName: "Alex Johnson",
    bonvoyTier: "Gold Elite",
    pointsBalance: "128,500"
};
const TEMPLATE_SECTION_RULES = {
    default: {
        detectSearch: true,
        splitOnDivider: true,
        forceFirstAsHeader: false,
        forceLastAsFooter: false,
        forcedSectionBreakIndexes: []
    },
    byCode: {
        // Add per-template overrides here (key by numeric code string).
        // Example:
        // "5": { detectSearch: true, splitOnDivider: true, forceFirstAsHeader: true }
    }
};

function createDefaultDraftState() {
    return {
        campaignName: "",
        subject: "",
        preheader: "",
        heroImageUrl: "",
        headline: "",
        bodyCopy: "",
        ctaLabel: "",
        ctaUrl: "",
        htmlSource: "",
        recipients: "",
        fromEmail: ""
    };
}

function normalizeTemplateCodeKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const digits = raw.match(/\d+/)?.[0] || "";
    return digits || raw.toLowerCase();
}
const WORKSPACE_TABS = [
    { id: "builder", label: "Builder" },
    { id: "proof", label: "Proof" },
    { id: "approval", label: "Approval" },
    { id: "versions", label: "Versions" },
    { id: "history", label: "History" }
];
const PREVIEW_DEVICES = {
    desktop: { label: "Desktop", width: "100%" },
    mobile: { label: "Mobile", width: "390px" },
    tablet: { label: "Tablet", width: "768px" }
};
const QUICK_TEXT_EDITOR_MODULES = {
    toolbar: [
        ["bold", "italic", "underline"],
        ["link"],
        ["clean"]
    ],
    clipboard: {
        matchVisual: false
    }
};
const QUICK_TEXT_EDITOR_FORMATS = [
    "bold", "italic", "underline", "link"
];

function splitRecipients(raw) {
    return String(raw || "")
        .split(/[,\n;]+/)
        .map((v) => v.trim())
        .filter(Boolean);
}

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[char]));
}

function readLocalJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_e) {
        return fallback;
    }
}

function templateSort(a, b) {
    return Number(a?.code || 0) - Number(b?.code || 0);
}

function isValidHttpUrl(value) {
    if (!value) return false;
    try {
        const parsed = new URL(String(value));
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_error) {
        return false;
    }
}

function isAcceptableAssetUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    if (isValidHttpUrl(raw)) return true;
    if (raw.startsWith("/uploads/")) return true;
    if (raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("/")) return true;
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(raw)) return true;
    return false;
}

function renderPersonalizedHtml(html, sample) {
    let output = String(html || "");
    output = output.replace(/\{\{\s*member_name\s*\}\}/gi, sample.memberName || "");
    output = output.replace(/\{\{\s*bonvoy_tier\s*\}\}/gi, sample.bonvoyTier || "");
    output = output.replace(/\{\{\s*points_balance\s*\}\}/gi, sample.pointsBalance || "");
    return output;
}

function sanitizePreviewHtml(html) {
    let output = String(html || "");
    output = output.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "");
    output = output.replace(/<\s*(iframe|object|embed|applet)\b[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    output = output.replace(/<\s*(iframe|object|embed|applet)\b[^>]*\/?>/gi, "");
    output = output.replace(/\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)/gi, "");
    output = output.replace(/\s(href|src)\s*=\s*(\"|')\s*javascript:[\s\S]*?\2/gi, " $1=\"#\"");
    return output;
}

function injectQuickEditBridge(html) {
    const source = String(html || "");
    if (!source) return source;
    const bridgeScript = `
<script>
(function () {
  function resolveElementTarget(target) {
    if (target && target.nodeType === 3) return target.parentElement;
    if (target && target.closest) return target;
    return null;
  }
  function pick(event) {
    var base = resolveElementTarget(event.target);
    var match = base && base.closest ? base.closest('[data-edm-edit-id]') : null;
    if (!match) return false;
    var id = String(match.getAttribute('data-edm-edit-id') || '').trim();
    if (!id) return false;
    event.preventDefault();
    event.stopPropagation();
    try {
      window.parent && window.parent.postMessage({ type: 'edm-quick-edit-select', id: id }, '*');
    } catch (e) {}
    return true;
  }
  document.addEventListener('mousedown', function (event) {
    if (event && event.button === 2) pick(event);
  }, true);
  document.addEventListener('contextmenu', function (event) {
    pick(event);
  }, true);
  document.addEventListener('click', function (event) {
    pick(event);
  }, true);
})();
</script>`;
    if (/<\/body>/i.test(source)) {
        return source.replace(/<\/body>/i, `${bridgeScript}</body>`);
    }
    return `${source}${bridgeScript}`;
}

const QUICK_EDIT_SKIP_TAGS = new Set([
    "html", "head", "body", "style", "script", "meta", "link", "title", "tbody", "thead", "tfoot", "tr"
]);
const QUICK_EDIT_TEXT_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "td", "th", "li", "strong", "em", "small", "label", "button"
]);
const QUICK_EDIT_INLINE_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "strong", "em", "small", "label", "button", "li"
]);

function collapseTextValue(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function getOwnEditableText(element) {
    if (!element?.childNodes?.length) return "";
    const text = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.nodeValue || "")
        .join(" ");
    return collapseTextValue(text);
}

function setOwnEditableText(element, text) {
    if (!element) return;
    const nextText = String(text || "");
    const textNodes = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNodes.length) {
        element.insertBefore(element.ownerDocument.createTextNode(nextText), element.firstChild || null);
        return;
    }
    textNodes[0].nodeValue = nextText;
    for (let index = 1; index < textNodes.length; index += 1) {
        textNodes[index].remove();
    }
}

function normalizeQuillHtmlForEmail(html, targetTag = "") {
    const source = String(html || "").trim();
    if (!source) return "";
    try {
        const parser = new DOMParser();
        const documentNode = parser.parseFromString(`<div id="quill-root">${source}</div>`, "text/html");
        const root = documentNode.getElementById("quill-root");
        if (!root) return source;

        root.querySelectorAll("p").forEach((node) => {
            node.style.margin = "0";
        });

        const tag = String(targetTag || "").toLowerCase();
        if (QUICK_EDIT_INLINE_TAGS.has(tag)) {
            const children = Array.from(root.children);
            if (!children.length) return root.innerHTML;
            const inlineParts = children.map((node) => (
                String(node.tagName || "").toLowerCase() === "p" ? node.innerHTML : node.outerHTML
            ));
            return inlineParts.join("<br>");
        }

        return root.innerHTML;
    } catch (_error) {
        return source;
    }
}

function describeQuickEditableElement(element) {
    const tag = String(element?.tagName || "").toLowerCase();
    if (!tag || QUICK_EDIT_SKIP_TAGS.has(tag)) return null;

    if (tag === "img") {
        return {
            kind: "image",
            tag,
            src: String(element.getAttribute("src") || ""),
            alt: String(element.getAttribute("alt") || "")
        };
    }

    if (tag === "a") {
        const label = collapseTextValue(element.textContent || "");
        return {
            kind: "link",
            tag,
            label,
            href: String(element.getAttribute("href") || "")
        };
    }

    if (!QUICK_EDIT_TEXT_TAGS.has(tag)) return null;
    const ownText = getOwnEditableText(element);
    const html = String(element.innerHTML || "").trim();
    if (!ownText && !html) return null;
    return {
        kind: "text",
        tag,
        text: ownText,
        html
    };
}

function extractDecorativePrefix(label) {
    const source = String(label || "");
    const match = source.match(/^(\s*(?:\u00BB|\u203A|\u00AB|\u2022|\u00B7|\u25BA|\u25B8|\u27A4|\u2794|\u2192)+\s*)+/);
    return match ? match[0] : "";
}

function stripDecorativePrefix(label) {
    const source = String(label || "");
    return source.replace(/^(\s*(?:\u00BB|\u203A|\u00AB|\u2022|\u00B7|\u25BA|\u25B8|\u27A4|\u2794|\u2192)+\s*)+/, "");
}

function findLastTextNodeForLinkLabel(element) {
    const walker = element?.ownerDocument?.createTreeWalker?.(element, NodeFilter.SHOW_TEXT) || null;
    if (!walker) return null;
    let lastNonEmpty = null;
    let lastPrimary = null;
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const normalized = collapseTextValue(node?.nodeValue || "");
        if (!normalized) continue;
        lastNonEmpty = node;
        if (stripDecorativePrefix(normalized).trim()) {
            lastPrimary = node;
        }
    }
    return lastPrimary || lastNonEmpty;
}

function setLinkLabelPreserveMarkup(element, nextLabel) {
    if (!element) return;
    const currentVisible = collapseTextValue(element.textContent || "");
    const prefix = extractDecorativePrefix(currentVisible);
    const nextBare = stripDecorativePrefix(String(nextLabel || "")).trim();
    const fallbackBare = stripDecorativePrefix(currentVisible).trim();
    const safeBare = nextBare || fallbackBare;

    if (!element.children?.length) {
        element.textContent = prefix ? `${prefix}${safeBare}` : safeBare;
        return;
    }

    const targetNode = findLastTextNodeForLinkLabel(element);
    if (!targetNode) {
        element.appendChild(element.ownerDocument.createTextNode(prefix ? `${prefix}${safeBare}` : safeBare));
        return;
    }

    const currentText = String(targetNode.nodeValue || "");
    const leadingWs = (currentText.match(/^\s*/) || [""])[0];
    const trailingWs = (currentText.match(/\s*$/) || [""])[0];
    targetNode.nodeValue = `${leadingWs}${safeBare}${trailingWs}`;
}

function indexQuickEditableElements(documentNode) {
    const body = documentNode?.body;
    if (!body) return [];
    const all = Array.from(body.querySelectorAll("*"));
    const indexed = [];
    let counter = 0;
    all.forEach((element) => {
        const descriptor = describeQuickEditableElement(element);
        if (!descriptor) return;
        const id = String(counter);
        counter += 1;
        element.setAttribute("data-edm-edit-id", id);
        indexed.push({ id, descriptor, element });
    });
    return indexed;
}

function buildQuickEditSnapshot(html) {
    const source = String(html || "").trim();
    if (!source) return { annotatedHtml: "", entries: [] };
    try {
        const parser = new DOMParser();
        const documentNode = parser.parseFromString(source, "text/html");
        const indexed = indexQuickEditableElements(documentNode);
        const entries = indexed.map((item) => ({ id: item.id, ...item.descriptor }));
        return {
            annotatedHtml: "<!DOCTYPE html>\n" + documentNode.documentElement.outerHTML,
            entries
        };
    } catch (_error) {
        return { annotatedHtml: source, entries: [] };
    }
}

function applyQuickEditMutation(html, editId, payload = {}) {
    const source = String(html || "").trim();
    const targetId = String(editId || "").trim();
    if (!source || !targetId) return { applied: false, html: source };
    try {
        const parser = new DOMParser();
        const documentNode = parser.parseFromString(source, "text/html");
        const indexed = indexQuickEditableElements(documentNode);
        const match = indexed.find((item) => item.id === targetId);
        if (!match?.element) return { applied: false, html: source };

        const { descriptor, element } = match;
        if (descriptor.kind === "text") {
            const nextHtml = String(payload.html ?? "").trim();
            if (nextHtml) {
                const normalizedHtml = normalizeQuillHtmlForEmail(nextHtml, descriptor.tag);
                if (normalizedHtml) {
                    element.innerHTML = normalizedHtml;
                } else {
                    setOwnEditableText(element, String(payload.text ?? descriptor.text ?? ""));
                }
            } else {
                setOwnEditableText(element, String(payload.text ?? descriptor.text ?? ""));
            }
        } else if (descriptor.kind === "link") {
            const enteredLabel = String(payload.label ?? descriptor.label ?? "");
            setLinkLabelPreserveMarkup(element, enteredLabel);
            const nextHref = String(payload.href ?? descriptor.href ?? "").trim();
            if (nextHref) element.setAttribute("href", nextHref);
            else element.removeAttribute("href");
        } else if (descriptor.kind === "image") {
            const nextSrc = String(payload.src ?? descriptor.src ?? "").trim();
            const nextAlt = String(payload.alt ?? descriptor.alt ?? "");
            if (nextSrc) element.setAttribute("src", nextSrc);
            else element.removeAttribute("src");
            if (nextAlt) element.setAttribute("alt", nextAlt);
            else element.removeAttribute("alt");
        }

        return {
            applied: true,
            descriptor,
            html: "<!DOCTYPE html>\n" + documentNode.documentElement.outerHTML
        };
    } catch (_error) {
        return { applied: false, html: source };
    }
}

function extractTokensFromText(value) {
    const source = String(value || "");
    const matches = source.match(/\{\{\s*[a-z0-9_]+\s*\}\}/gi) || [];
    return matches.map((token) => token.replace(/\s+/g, "").toLowerCase());
}

function collectUnknownTokens(value, allowedSet, outputSet) {
    if (typeof value === "string") {
        const tokens = extractTokensFromText(value);
        for (const token of tokens) {
            if (!allowedSet.has(token)) {
                outputSet.add(token);
            }
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectUnknownTokens(item, allowedSet, outputSet);
        return;
    }

    if (value && typeof value === "object") {
        for (const item of Object.values(value)) collectUnknownTokens(item, allowedSet, outputSet);
    }
}

function cloneJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return null;
    }
}

function sanitizeBuilderUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "#";
    if (raw.startsWith("mailto:") || raw.startsWith("tel:")) return raw;
    if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return raw;
    if (isValidHttpUrl(raw)) return raw;
    return "#";
}

function normalizeLayoutSections(model) {
    const bodyBlocks = Array.isArray(model?.layout?.bodyBlocks) ? model.layout.bodyBlocks : [];
    const hasSections = bodyBlocks.some((item) => String(item?.type || "").toLowerCase() === "section");
    if (hasSections) {
        return bodyBlocks
            .filter((item) => String(item?.type || "").toLowerCase() === "section")
            .map((section, index) => ({
                id: String(section?.id || `section-${index + 1}`),
                type: "section",
                props: {
                    name: String(section?.props?.name || `Section ${index + 1}`),
                    bgColor: String(section?.props?.bgColor || "#ffffff"),
                    paddingTop: Number(section?.props?.paddingTop ?? 16),
                    paddingBottom: Number(section?.props?.paddingBottom ?? 16),
                    blocks: Array.isArray(section?.props?.blocks) ? section.props.blocks : []
                }
            }));
    }
    return [{
        id: "section-legacy",
        type: "section",
        props: {
            name: "Section 1",
            bgColor: "#ffffff",
            paddingTop: 16,
            paddingBottom: 16,
            blocks: bodyBlocks
        }
    }];
}

function readRawHtmlFromLayout(model) {
    const sections = normalizeLayoutSections(model);
    if (sections.length !== 1) return "";
    const firstBlocks = Array.isArray(sections[0]?.props?.blocks) ? sections[0].props.blocks : [];
    if (firstBlocks.length !== 1) return "";
    const block = firstBlocks[0];
    if (String(block?.type || "").toLowerCase() !== "html") return "";
    return String(block?.props?.html || "");
}

function isRawTemplateLayout(model) {
    const mode = String(model?.metadata?.editorMode || "").trim().toLowerCase();
    if (mode === "raw_html") return true;
    if (mode === "structured_blocks") return false;
    return Boolean(readRawHtmlFromLayout(model).trim());
}

function buildDraftSelectionKey(templateId, campaignId) {
    const templateKey = String(templateId || "template").trim() || "template";
    const campaignKey = String(campaignId || "campaign").trim() || "campaign";
    return `${DRAFT_SELECTION_KEY_PREFIX}__${campaignKey}__${templateKey}`;
}

function renderLeafBlock(block) {
    const type = String(block?.type || "").toLowerCase();
    const props = block?.props || {};

    if (type === "html") {
        return String(props.html || "");
    }

    if (type === "text") {
        const text = escapeHtml(String(props.text || "")).replace(/\n/g, "<br/>");
        const align = ["left", "center", "right"].includes(String(props.align || "").toLowerCase()) ? String(props.align).toLowerCase() : "left";
        const color = String(props.color || "#111827");
        const fontSize = Math.max(12, Math.min(48, Number(props.fontSize || 16)));
        const lineHeight = Math.round(fontSize * 1.5);
        return `<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"${align}\" style=\"padding:12px 0;font-family:Arial,Helvetica,sans-serif;font-size:${fontSize}px;line-height:${lineHeight}px;color:${color};\">${text}</td></tr></table>`;
    }

    if (type === "image") {
        const src = escapeHtml(String(props.src || ""));
        const alt = escapeHtml(String(props.alt || ""));
        const width = Math.max(120, Math.min(1200, Number(props.width || 600)));
        const align = ["left", "center", "right"].includes(String(props.align || "").toLowerCase()) ? String(props.align).toLowerCase() : "center";
        const href = sanitizeBuilderUrl(props.href || "");
        const imageTag = `<img src=\"${src}\" alt=\"${alt}\" width=\"${width}\" style=\"display:block;width:100%;max-width:${width}px;height:auto;border:0;\" />`;
        const content = href && href !== "#" ? `<a href=\"${escapeHtml(href)}\" style=\"text-decoration:none;\">${imageTag}</a>` : imageTag;
        return `<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"${align}\" style=\"padding:12px 0;\">${content}</td></tr></table>`;
    }

    if (type === "button") {
        const label = escapeHtml(String(props.label || "View"));
        const href = escapeHtml(sanitizeBuilderUrl(props.href || "#"));
        const align = ["left", "center", "right"].includes(String(props.align || "").toLowerCase()) ? String(props.align).toLowerCase() : "left";
        const bgColor = String(props.bgColor || "#111827");
        const textColor = String(props.textColor || "#ffffff");
        const radius = Math.max(0, Math.min(40, Number(props.radius || 4)));
        return `<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"${align}\" style=\"padding:8px 0;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td bgcolor=\"${bgColor}\" style=\"border-radius:${radius}px;\"><a href=\"${href}\" style=\"display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${textColor};text-decoration:none;\">${label}</a></td></tr></table></td></tr></table>`;
    }

    if (type === "spacer") {
        const height = Math.max(4, Number(props.height || 20));
        return `<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td style=\"line-height:${height}px;font-size:${height}px;\">&nbsp;</td></tr></table>`;
    }

    if (type === "divider") {
        const color = String(props.color || "#e5e7eb");
        const thickness = Math.max(1, Math.min(12, Number(props.thickness || 1)));
        return `<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td style=\"padding:8px 0;border-top:${thickness}px solid ${color};font-size:0;line-height:0;\">&nbsp;</td></tr></table>`;
    }

    return "";
}

function renderHtmlFromBuilderModel(model, fallbackHtml = "") {
    const mode = String(model?.metadata?.editorMode || "").trim().toLowerCase();
    if (mode === "raw_html") {
        const rawHtml = readRawHtmlFromLayout(model);
        if (rawHtml.trim()) return rawHtml;
    }

    const sections = normalizeLayoutSections(model);
    const headerHtml = String(model?.layout?.header?.props?.html || "");
    const footerHtml = String(model?.layout?.footer?.props?.html || "");

    const sectionHtml = sections.map((section) => {
        const blocks = Array.isArray(section?.props?.blocks) ? section.props.blocks : [];
        const rendered = blocks.map((block) => renderLeafBlock(block)).join("\n");
        const bg = String(section?.props?.bgColor || "#ffffff");
        const pt = Math.max(0, Math.min(80, Number(section?.props?.paddingTop ?? 16)));
        const pb = Math.max(0, Math.min(80, Number(section?.props?.paddingBottom ?? 16)));
        return `<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td style=\"background:${bg};padding:${pt}px 0 ${pb}px 0;\">${rendered}</td></tr></table>`;
    }).join("\n");

    const resolvedBody = sectionHtml || fallbackHtml || "";
    return [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "<meta charset=\"utf-8\" />",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
        "</head>",
        "<body style=\"margin:0;padding:0;background:#f5f7fa;\">",
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#f5f7fa;\">",
        "<tr><td align=\"center\" style=\"padding:20px;\">",
        "<table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:100%;background:#ffffff;\">",
        `<tr><td>${headerHtml}</td></tr>`,
        `<tr><td style=\"padding:24px;\">${resolvedBody}</td></tr>`,
        `<tr><td>${footerHtml}</td></tr>`,
        "</table>",
        "</td></tr>",
        "</table>",
        "</body>",
        "</html>"
    ].join("\n");
}

function formatAutosaveTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function formatVersionTimestamp(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function resolveTemplateSectionRules(templateInfo, modelMetadata = {}) {
    const templateCode = normalizeTemplateCodeKey(
        templateInfo?.code
        || modelMetadata?.templateCode
        || ""
    );
    const templateRuleOverride = (
        templateInfo?.sectionRule
        && typeof templateInfo.sectionRule === "object"
        && !Array.isArray(templateInfo.sectionRule)
    ) ? templateInfo.sectionRule : null;
    const byCode = TEMPLATE_SECTION_RULES.byCode || {};
    const override = templateRuleOverride || (templateCode ? (byCode[templateCode] || null) : null);
    return {
        ...(TEMPLATE_SECTION_RULES.default || {}),
        ...(override || {}),
        templateCode
    };
}

function htmlToEditableBodyBlocks(html, options = {}) {
    const rules = {
        ...(TEMPLATE_SECTION_RULES.default || {}),
        ...(options?.rules || {})
    };
    const source = String(html || "").trim();
    const emptyResult = {
        sections: [],
        header: null,
        footer: null,
        headerHtml: "",
        footerHtml: "",
        fidelity: "empty"
    };
    if (!source) return emptyResult;

    const normalizeTemplateCode = (value) => String(value || "").trim().toLowerCase().replace(/^template\s*/i, "");
    const templateCode = normalizeTemplateCode(rules?.templateCode || options?.templateCode || "");
    if (templateCode === "5") {
        const findCommentIndex = (pattern, startAt = 0, useLast = false) => {
            const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
            let found = -1;
            let match = null;
            while ((match = global.exec(source)) !== null) {
                if (match.index < startAt) continue;
                found = match.index;
                if (!useLast) break;
            }
            return found;
        };

        const headerStart = findCommentIndex(/<!--\s*header\s*-->/i);
        const headerEnd = findCommentIndex(/<!--\s*end\s+content\s+container\s*-->/i, Math.max(0, headerStart));
        const searchSectionEnd = findCommentIndex(/<!--\s*end\s+of\s+search\s+sec\s*2\s*-->/i, Math.max(0, headerEnd));
        const section4Start = findCommentIndex(/<!--\s*headline\s+3\s+column\s+with\s+image\s+sec\s*4\s*-->/i, Math.max(0, searchSectionEnd));
        const footerStart = findCommentIndex(/<!--\s*FOOTER\s+PART\s*-->/i, Math.max(0, section4Start));
        const footerEnd = findCommentIndex(/<!--\s*End\s+OF\s+FOOTER\s+PART\s*-->/i, Math.max(0, footerStart), true);

        const validTemplate5Markers = (
            headerStart >= 0
            && headerEnd > headerStart
            && searchSectionEnd > headerEnd
            && section4Start > searchSectionEnd
            && footerStart > section4Start
            && footerEnd > footerStart
        );

        if (validTemplate5Markers) {
            let seq = 0;
            const buildSection = (name, fragmentHtml) => {
                const chunk = String(fragmentHtml || "").trim();
                if (!chunk) return null;
                seq += 1;
                return {
                    id: `section-${Date.now()}-${seq}`,
                    type: "section",
                    locked: false,
                    props: {
                        name,
                        bgColor: "#ffffff",
                        paddingTop: 16,
                        paddingBottom: 16,
                        blocks: [{
                            id: `html-${Date.now()}-${seq}`,
                            type: "html",
                            locked: false,
                            props: { html: chunk }
                        }]
                    }
                };
            };

            const sectionOne = buildSection("Section 1", source.slice(headerEnd, searchSectionEnd));
            const sectionTwo = buildSection("Section 2", source.slice(searchSectionEnd, section4Start));
            const sectionThree = buildSection("Section 3", source.slice(section4Start, footerStart));
            const sections = [sectionOne, sectionTwo, sectionThree].filter(Boolean);

            if (sections.length >= 2) {
                return {
                    sections,
                    header: null,
                    footer: null,
                    headerHtml: source.slice(headerStart, headerEnd),
                    footerHtml: source.slice(footerStart, footerEnd),
                    fidelity: "template5_marker_split"
                };
            }
        }
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(source, "text/html");
    const body = documentNode?.body;
    if (!body) return emptyResult;

    // ---------- helpers ----------
    const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const styleOf = (node) => String(node?.getAttribute?.("style") || "").toLowerCase();
    const classOf = (node) => String(node?.getAttribute?.("class") || "").toLowerCase();
    const isHiddenElement = (node) => {
        let current = node;
        while (current && current !== body) {
            const st = styleOf(current);
            if (/display\s*:\s*none/.test(st) || /visibility\s*:\s*hidden/.test(st)) return true;
            const cls = classOf(current);
            if (/(^|\s)(hide|hidden|desktop-hide|mobile-hide|visually-hidden)(\s|$)/.test(cls)) return true;
            current = current.parentElement;
        }
        return false;
    };
    const getAlign = (node) => {
        if (!node) return "";
        const attr = String(node.getAttribute?.("align") || "").toLowerCase();
        if (attr === "left" || attr === "center" || attr === "right") return attr;
        const m = styleOf(node).match(/text-align\s*:\s*(left|center|right)/);
        return m?.[1] || "";
    };
    const getPxValue = (raw, fallback) => {
        const m = String(raw || "").match(/(\d{1,4})/);
        const parsed = Number(m?.[1] || fallback);
        return Number.isNaN(parsed) ? fallback : parsed;
    };
    const getBgColor = (node) => {
        if (!node) return "";
        const attr = String(node.getAttribute?.("bgcolor") || "").trim();
        if (attr) return attr;
        const m = styleOf(node).match(/background(?:-color)?\s*:\s*([^;]+)/);
        return m?.[1]?.trim() || "";
    };
    const getPadding = (node) => {
        const st = styleOf(node);
        const top = st.match(/padding-top\s*:\s*(\d+)/)?.[1];
        const bot = st.match(/padding-bottom\s*:\s*(\d+)/)?.[1];
        if (top || bot) return { top: Number(top || 0), bottom: Number(bot || 0) };
        const all = st.match(/padding\s*:\s*([^;]+)/)?.[1];
        if (all) {
            const parts = all.trim().split(/\s+/).map((p) => Number(p.replace(/[^\d]/g, "")) || 0);
            if (parts.length === 1) return { top: parts[0], bottom: parts[0] };
            if (parts.length === 2) return { top: parts[0], bottom: parts[0] };
            if (parts.length >= 3) return { top: parts[0], bottom: parts[2] };
        }
        return { top: 0, bottom: 0 };
    };
    const widthOf = (table) => {
        const w = String(table?.getAttribute?.("width") || "").trim();
        if (w) return Number(w.replace(/[^\d]/g, "")) || 0;
        const m = styleOf(table).match(/width\s*:\s*(\d+)/);
        return Number(m?.[1] || 0);
    };

    // ---------- locate outer email wrapper ----------
    const allTables = Array.from(body.querySelectorAll("table")).filter((t) => !isHiddenElement(t));
    let outer = null;
    for (const t of allTables) {
        const w = widthOf(t);
        if (w >= 560 && w <= 760) { outer = t; break; }
    }
    if (!outer) outer = allTables[0] || body;

    // Walk down through single-cell wrappers to reach the actual content host
    const findContentHost = (root) => {
        let host = root;
        for (let i = 0; i < 5; i += 1) {
            const tds = Array.from(host.querySelectorAll(":scope > tbody > tr > td, :scope > tr > td"))
                .filter((td) => !isHiddenElement(td));
            const meaningful = tds.filter((td) => Array.from(td.children || []).some((c) => /^(table|div|img|p|h[1-6]|ul|ol|a)$/i.test(c.tagName)));
            if (meaningful.length === 1) { host = meaningful[0]; continue; }
            break;
        }
        return host;
    };
    const host = findContentHost(outer);

    // ---------- collect module-level children in document order ----------
    const isModuleCandidate = (el) => {
        if (!el || isHiddenElement(el)) return false;
        const tag = String(el.tagName || "").toLowerCase();
        if (!/^(table|div|p|h[1-6]|img|a|ul|ol)$/.test(tag)) return false;
        const text = cleanText(el.textContent || "");
        const hasMedia = Boolean(el.querySelector?.("img[src],a[href]"));
        return text.length > 0 || hasMedia;
    };

    let modules = Array.from(host.children || []).filter(isModuleCandidate);
    if (!modules.length) {
        modules = [host];
    }

    // If host collapses all content into one table node, split by top-level row cells.
    if (modules.length === 1) {
        const only = modules[0];
        const directRows = Array.from(only.querySelectorAll(":scope > tbody > tr, :scope > tr"))
            .filter((row) => !isHiddenElement(row));
        if (directRows.length) {
            const rowCells = directRows.flatMap((row) => (
                Array.from(row.children || []).filter((cell) => {
                    const tag = String(cell?.tagName || "").toLowerCase();
                    return (tag === "td" || tag === "th") && !isHiddenElement(cell);
                })
            ));
            const splitModules = rowCells
                .map((cell) => {
                    const children = Array.from(cell.children || []).filter((child) => !isHiddenElement(child));
                    const firstMeaningful = children.find((child) => isModuleCandidate(child));
                    return firstMeaningful || (children[0] || cell);
                })
                .filter((item) => item && !isHiddenElement(item));
            if (splitModules.length >= 3) {
                modules = splitModules;
            }
        }
    }

    // ---------- header / footer detection (content-based) ----------
    const looksHeader = (el) => {
        if (!el) return false;
        const text = cleanText(el.textContent || "").toLowerCase();
        const hasLogo = Boolean(el.querySelector?.("img[alt*='marriott' i], img[alt*='bonvoy' i], img[src*='logo' i]"));
        const navLike = /find\s*(&|and)?\s*reserve|my\s*account|sign\s*in/.test(text) && text.length < 240;
        return hasLogo || navLike;
    };
    const looksFooter = (el) => {
        if (!el) return false;
        const text = cleanText(el.textContent || "").toLowerCase();
        return /unsubscribe|manage preferences|privacy|terms|all rights reserved|copyright|marriott international/.test(text);
    };
    const looksSearch = (el) => {
        if (!el) return false;
        const text = cleanText(el.textContent || "").toLowerCase();
        const hasInput = Boolean(el.querySelector?.("input,select,textarea"));
        const hasWhereTo = /where\s*to/.test(text);
        const hasSearchWord = /search/.test(text);
        const hasSearchCta = /search hotel|find hotel|book|reserve/.test(text);
        return hasInput || hasWhereTo || (hasSearchWord && hasSearchCta);
    };
    const looksDivider = (el) => {
        if (!el) return false;
        const tag = String(el.tagName || "").toLowerCase();
        if (tag === "hr") return true;
        const text = cleanText(el.textContent || "");
        const st = styleOf(el);
        const cls = classOf(el);
        const hasDividerClass = /(divider|separator|rule|line)/.test(cls);
        const hasBorderTop = /border-top\s*:\s*(1|2|3|4)px/.test(st);
        const hasThinHeight = /height\s*:\s*(1|2|3|4)px/.test(st);
        if (hasDividerClass || (!text && (hasBorderTop || hasThinHeight))) return true;

        // Common email spacer-divider pattern: single empty cell with height/line-height
        // (e.g. 24-60px) used between major modules.
        const spacerCell = el.querySelector?.(":scope > tbody > tr > td, :scope > tr > td");
        if (!spacerCell) return false;
        const spacerText = cleanText(String(spacerCell.textContent || "").replace(/&nbsp;/gi, ""));
        const spacerStyle = styleOf(spacerCell);
        const heightAttr = Number(String(spacerCell.getAttribute?.("height") || "").replace(/[^\d]/g, "") || 0);
        const lineHeight = Number((spacerStyle.match(/line-height\s*:\s*(\d+)/)?.[1]) || 0);
        const heightStyle = Number((spacerStyle.match(/height\s*:\s*(\d+)/)?.[1]) || 0);
        const spacerHeight = Math.max(heightAttr, lineHeight, heightStyle);
        return !spacerText && spacerHeight >= 24;
    };
    const splitModuleByRows = (moduleRoot) => {
        if (!moduleRoot || !moduleRoot.querySelectorAll) return [];
        const directRows = Array.from(moduleRoot.querySelectorAll(":scope > tbody > tr, :scope > tr"))
            .filter((row) => !isHiddenElement(row));
        if (!directRows.length) return [];

        const rowModules = directRows
            .map((row) => {
                const rowCells = Array.from(row.children || []).filter((cell) => {
                    const tag = String(cell?.tagName || "").toLowerCase();
                    return (tag === "td" || tag === "th") && !isHiddenElement(cell);
                });
                if (!rowCells.length) return null;

                if (rowCells.length === 1) {
                    const cell = rowCells[0];
                    const children = Array.from(cell.children || []).filter((child) => !isHiddenElement(child));
                    const firstMeaningful = children.find((child) => isModuleCandidate(child));
                    if (firstMeaningful) return firstMeaningful;
                    if (children[0]) return children[0];
                    const text = cleanText(cell.textContent || "");
                    if (text) return cell;
                    return null;
                }

                // Multi-column row: preserve all columns by wrapping the row in a temporary table.
                const wrapper = documentNode.createElement("table");
                wrapper.setAttribute("role", "presentation");
                wrapper.setAttribute("width", "100%");
                wrapper.setAttribute("cellpadding", "0");
                wrapper.setAttribute("cellspacing", "0");
                wrapper.setAttribute("border", "0");
                wrapper.innerHTML = `<tbody>${row.outerHTML}</tbody>`;
                return wrapper;
            })
            .filter((item) => Boolean(item) && !isHiddenElement(item));

        return rowModules.length >= 2 ? rowModules : [];
    };
    const expandNestedModules = (node, depth = 0) => {
        if (!node || depth > 8) return [];

        const directCandidates = Array.from(node.children || []).filter(isModuleCandidate);
        if (directCandidates.length >= 2) return directCandidates;

        const rowSplit = splitModuleByRows(node);
        if (rowSplit.length >= 2) return rowSplit;

        const singleCell = node.querySelector?.(":scope > tbody > tr > td, :scope > tr > td");
        if (singleCell && !isHiddenElement(singleCell)) {
            const fromCellChildren = Array.from(singleCell.children || []).filter(isModuleCandidate);
            if (fromCellChildren.length >= 2) return fromCellChildren;
            const deeper = expandNestedModules(singleCell, depth + 1);
            if (deeper.length >= 2) return deeper;
        }

        if (directCandidates.length === 1) {
            const deeper = expandNestedModules(directCandidates[0], depth + 1);
            if (deeper.length >= 2) return deeper;
        }

        return [];
    };

    if (modules.length === 1) {
        const expandedNested = expandNestedModules(modules[0]);
        if (expandedNested.length >= 2) {
            modules = expandedNested;
        }
    }

    let headerHtml = "";
    let footerHtml = "";
    let headerEl = null;
    let footerEl = null;
    let bodyModules = [...modules];
    if (
        bodyModules.length > 1
        && (Boolean(rules.forceFirstAsHeader) || looksHeader(bodyModules[0]))
    ) {
        headerEl = bodyModules[0];
        headerHtml = headerEl.outerHTML;
        bodyModules = bodyModules.slice(1);
    }
    if (
        bodyModules.length > 1
        && (Boolean(rules.forceLastAsFooter) || looksFooter(bodyModules[bodyModules.length - 1]))
    ) {
        footerEl = bodyModules[bodyModules.length - 1];
        footerHtml = footerEl.outerHTML;
        bodyModules = bodyModules.slice(0, -1);
    }

    let searchEl = null;
    if (Boolean(rules.detectSearch) && bodyModules.length > 1 && looksSearch(bodyModules[0])) {
        searchEl = bodyModules[0];
        bodyModules = bodyModules.slice(1);
    }

    // If body still collapsed into one giant wrapper, split by internal rows.
    if (bodyModules.length === 1) {
        const expanded = splitModuleByRows(bodyModules[0]);
        if (expanded.length >= 2) {
            bodyModules = expanded;
        }
    }

    // ---------- lossless conversion ----------
    // Keep each module as HTML block so visuals stay identical after conversion.
    let blockSeq = 0;
    const sections = [];

    const extractFromElement = (root) => {
        const innerTd = root?.tagName?.toLowerCase() === "table"
            ? (root.querySelector(":scope > tbody > tr > td, :scope > tr > td") || null)
            : null;
        const bgColor = getBgColor(innerTd) || getBgColor(root) || "#ffffff";
        const pad = innerTd ? getPadding(innerTd) : getPadding(root);
        const fragmentHtml = String(root?.outerHTML || "").trim();

        blockSeq += 1;
        const htmlBlock = {
            id: `html-${Date.now()}-${blockSeq}`,
            type: "html",
            locked: false,
            props: { html: fragmentHtml }
        };

        return {
            blocks: fragmentHtml ? [htmlBlock] : [],
            bgColor,
            paddingTop: pad.top,
            paddingBottom: pad.bottom
        };
    };

    const buildSectionFromModules = (mods, sectionName) => {
        if (!Array.isArray(mods) || !mods.length) return null;
        const firstExtracted = extractFromElement(mods[0]);
        const combinedHtml = mods
            .map((mod) => String(mod?.outerHTML || "").trim())
            .filter(Boolean)
            .join("\n");
        if (!combinedHtml.trim()) return null;
        blockSeq += 1;
        return {
            id: `section-${Date.now()}-${blockSeq}`,
            type: "section",
            locked: false,
            props: {
                name: sectionName,
                bgColor: firstExtracted.bgColor,
                paddingTop: firstExtracted.paddingTop,
                paddingBottom: firstExtracted.paddingBottom,
                blocks: [{
                    id: `html-${Date.now()}-${blockSeq}`,
                    type: "html",
                    locked: false,
                    props: { html: combinedHtml }
                }]
            }
        };
    };

    if (searchEl) {
        const searchSection = buildSectionFromModules([searchEl], "Search");
        if (searchSection) sections.push(searchSection);
    }

    const groupedBodyModules = [];
    let currentGroup = [];
    const forcedBreakSet = new Set(
        (Array.isArray(rules.forcedSectionBreakIndexes) ? rules.forcedSectionBreakIndexes : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0)
    );
    bodyModules.forEach((mod, modIndex) => {
        const isDividerBreak = Boolean(rules.splitOnDivider) && looksDivider(mod);
        const isForcedBreak = forcedBreakSet.has(modIndex);
        if (isDividerBreak || isForcedBreak) {
            if (currentGroup.length) {
                groupedBodyModules.push(currentGroup);
                currentGroup = [];
            }
            return;
        }
        currentGroup.push(mod);
    });
    if (currentGroup.length) {
        groupedBodyModules.push(currentGroup);
    }
    if (!groupedBodyModules.length && bodyModules.length) {
        groupedBodyModules.push(bodyModules);
    }

    groupedBodyModules.forEach((group, index) => {
        const section = buildSectionFromModules(group, `Section ${index + 1}`);
        if (section) sections.push(section);
    });

    // Header / footer as structured blocks (same extractor)
    const header = headerEl ? extractFromElement(headerEl) : null;
    const footer = footerEl ? extractFromElement(footerEl) : null;

    if (!sections.length) {
        return {
            sections: [],
            header,
            footer,
            headerHtml,
            footerHtml,
            fidelity: "empty"
        };
    }

    const fidelity = "lossless_html";

    return {
        sections,
        header,
        footer,
        headerHtml,
        footerHtml,
        fidelity
    };
}

function applySectionModelFromHtml(baseModelInput, htmlSource, options = {}) {
    const source = String(htmlSource || "").trim();
    const baseModel = cloneJson(baseModelInput);
    if (!baseModel?.layout || !source) {
        return { model: baseModelInput, sectionCount: 0, fidelity: "empty" };
    }

    const parsed = htmlToEditableBodyBlocks(source, options);
    const parsedSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
    if (!parsedSections.length) {
        return { model: baseModel, sectionCount: 0, fidelity: parsed?.fidelity || "empty" };
    }

    let nextSections = [...parsedSections];
    const headerHtml = String(parsed?.headerHtml || "").trim();
    const footerHtml = String(parsed?.footerHtml || "").trim();
    const headerData = parsed?.header || null;
    const footerData = parsed?.footer || null;

    if (headerData || headerHtml) {
        baseModel.layout.header = {
            ...(baseModel.layout.header || {}),
            id: baseModel.layout.header?.id || "locked-header",
            type: "header",
            lockedPosition: true,
            locked: true,
            props: {
                ...(baseModel.layout.header?.props || {}),
                editable: true,
                ...(headerHtml ? { html: headerHtml } : {}),
                ...(headerData ? {
                    blocks: headerData.blocks || [],
                    bgColor: headerData.bgColor || "#ffffff",
                    paddingTop: headerData.paddingTop || 0,
                    paddingBottom: headerData.paddingBottom || 0
                } : {})
            }
        };
    }
    if (footerData || footerHtml) {
        baseModel.layout.footer = {
            ...(baseModel.layout.footer || {}),
            id: baseModel.layout.footer?.id || "locked-footer",
            type: "footer",
            lockedPosition: true,
            locked: true,
            props: {
                ...(baseModel.layout.footer?.props || {}),
                editable: true,
                ...(footerHtml ? { html: footerHtml } : {}),
                ...(footerData ? {
                    blocks: footerData.blocks || [],
                    bgColor: footerData.bgColor || "#ffffff",
                    paddingTop: footerData.paddingTop || 0,
                    paddingBottom: footerData.paddingBottom || 0
                } : {})
            }
        };
    }

    baseModel.layout.bodyBlocks = nextSections;
    baseModel.metadata = {
        ...(baseModel.metadata || {}),
        editorMode: "structured_blocks",
        conversionMode: String(parsed?.fidelity || "unknown"),
        conversionRule: "template_section_rules",
        conversionUpdatedAt: new Date().toISOString()
    };
    return { model: baseModel, sectionCount: nextSections.length, fidelity: parsed?.fidelity || "unknown" };
}

function computeHtmlCompareStats(baseHtml, targetHtml) {
    const base = String(baseHtml || "");
    const target = String(targetHtml || "");
    const baseLen = base.length;
    const targetLen = target.length;
    const changed = base !== target;
    const delta = targetLen - baseLen;
    const larger = Math.max(baseLen, targetLen, 1);
    const similarity = Math.max(0, Math.round(((larger - Math.abs(delta)) / larger) * 100));
    return {
        changed,
        baseLen,
        targetLen,
        delta,
        similarity
    };
}

function buildFoundationLayoutForSave(existingDraft, workingDraft, personalization, baseModel = null, options = {}) {
    const currentModel = cloneJson(baseModel || existingDraft?.layoutJson || {});
    if (!currentModel || typeof currentModel !== "object") return null;
    if (!currentModel.layout || typeof currentModel.layout !== "object") return null;
    const forceHtmlSource = Boolean(options?.forceHtmlSource);

    if (!Array.isArray(currentModel.layout.bodyBlocks)) {
        currentModel.layout.bodyBlocks = [];
    }

    const html = String(workingDraft.htmlSource || "");
    const sections = normalizeLayoutSections(currentModel);
    if (forceHtmlSource) {
        currentModel.layout.bodyBlocks = [{
            id: `section-${Date.now()}`,
            type: "section",
            locked: false,
            props: {
                name: "Section 1",
                bgColor: "#ffffff",
                paddingTop: 16,
                paddingBottom: 16,
                blocks: [{
                    id: `html-${Date.now()}`,
                    type: "html",
                    locked: false,
                    props: { html }
                }]
            }
        }];
    } else {
        const hasStructuredBlocks = sections.some((section) => {
            const blocks = Array.isArray(section?.props?.blocks) ? section.props.blocks : [];
            return blocks.some((block) => String(block?.type || "").toLowerCase() !== "html");
        });

        if (hasStructuredBlocks) {
            currentModel.layout.bodyBlocks = sections;
        } else {
        const nextSections = sections.length ? sections : [{
            id: `section-${Date.now()}`,
            type: "section",
            locked: false,
            props: {
                name: "Section 1",
                bgColor: "#ffffff",
                paddingTop: 16,
                paddingBottom: 16,
                blocks: []
            }
        }];
        const firstSection = nextSections[0];
        const firstBlocks = Array.isArray(firstSection?.props?.blocks) ? [...firstSection.props.blocks] : [];
        const htmlIndex = firstBlocks.findIndex((block) => String(block?.type || "").toLowerCase() === "html");
        if (htmlIndex >= 0) {
            firstBlocks[htmlIndex] = {
                ...firstBlocks[htmlIndex],
                props: {
                    ...(firstBlocks[htmlIndex]?.props || {}),
                    html
                }
            };
        } else {
            firstBlocks.unshift({
                id: `html-${Date.now()}`,
                type: "html",
                locked: false,
                props: { html }
            });
        }
        firstSection.props = {
            ...(firstSection.props || {}),
            blocks: firstBlocks
        };
        currentModel.layout.bodyBlocks = nextSections;
        }
    }

    currentModel.metadata = {
        ...(currentModel.metadata || {}),
        editorMode: forceHtmlSource ? "raw_html" : "structured_blocks",
        campaignName: String(workingDraft.campaignName || ""),
        subject: String(workingDraft.subject || ""),
        preheader: String(workingDraft.preheader || ""),
        updatedAt: new Date().toISOString()
    };

    currentModel.personalization = {
        ...(currentModel.personalization || {}),
        samples: {
            member_name: personalization.memberName || "",
            bonvoy_tier: personalization.bonvoyTier || "",
            points_balance: personalization.pointsBalance || ""
        }
    };

    // Backend validation requires locked header/footer identity to remain constant.
    currentModel.layout.header = {
        ...(currentModel.layout.header || {}),
        id: "locked-header",
        type: "header",
        lockedPosition: true,
        locked: true,
        props: {
            ...(currentModel.layout.header?.props || {}),
            editable: true
        }
    };
    currentModel.layout.footer = {
        ...(currentModel.layout.footer || {}),
        id: "locked-footer",
        type: "footer",
        lockedPosition: true,
        locked: true,
        props: {
            ...(currentModel.layout.footer?.props || {}),
            editable: true
        }
    };

    return currentModel;
}

function createWorkingModelFromHtml({
    html = "",
    campaignName = "",
    subject = "",
    preheader = "",
    personalization = PERSONALIZATION_SAMPLE_DEFAULTS,
    templateRules = null
}) {
    const safeHtml = String(html || "");
    const now = new Date().toISOString();
    const fallbackHeaderProps = {
        html: "<!-- Locked Header -->",
        editable: true,
        blocks: []
    };
    const fallbackFooterProps = {
        html: "<!-- Locked Footer -->",
        editable: true,
        blocks: []
    };

    const normalizedHtmlBlock = (fragment, suffix) => ({
        id: `html-${Date.now()}-${suffix}`,
        type: "html",
        locked: false,
        props: { html: String(fragment || "") }
    });

    const buildLockedPartProps = (partData, partHtml, fallbackProps, suffix) => {
        const htmlFragment = String(partHtml || "").trim();
        const rawBlocks = Array.isArray(partData?.blocks) ? partData.blocks : [];
        const blocks = rawBlocks.length
            ? rawBlocks
                .map((block, index) => ({
                    id: String(block?.id || `html-${Date.now()}-${suffix}-${index + 1}`),
                    type: String(block?.type || "html").toLowerCase(),
                    locked: false,
                    props: { ...(block?.props || {}) }
                }))
                .filter((block) => String(block?.type || "").trim())
            : (htmlFragment ? [normalizedHtmlBlock(htmlFragment, suffix)] : []);

        if (!blocks.length) {
            return { ...fallbackProps };
        }

        return {
            ...(htmlFragment ? { html: htmlFragment } : {}),
            editable: true,
            blocks,
            bgColor: String(partData?.bgColor || "#ffffff"),
            paddingTop: Number(partData?.paddingTop ?? 0),
            paddingBottom: Number(partData?.paddingBottom ?? 0)
        };
    };

    const parsedForLockedParts = htmlToEditableBodyBlocks(safeHtml, {
        rules: {
            ...(TEMPLATE_SECTION_RULES.default || {}),
            ...(templateRules || {})
        }
    });

    const seededHeaderProps = buildLockedPartProps(
        parsedForLockedParts?.header || null,
        parsedForLockedParts?.headerHtml || "",
        fallbackHeaderProps,
        "header"
    );
    const seededFooterProps = buildLockedPartProps(
        parsedForLockedParts?.footer || null,
        parsedForLockedParts?.footerHtml || "",
        fallbackFooterProps,
        "footer"
    );

    return {
        schemaVersion: 1,
        metadata: {
            createdAt: now,
            updatedAt: now,
            editorMode: "raw_html",
            campaignName: String(campaignName || ""),
            subject: String(subject || ""),
            preheader: String(preheader || "")
        },
        personalization: {
            tokens: PERSONALIZATION_TOKENS,
            samples: {
                member_name: String(personalization?.memberName || ""),
                bonvoy_tier: String(personalization?.bonvoyTier || ""),
                points_balance: String(personalization?.pointsBalance || "")
            }
        },
        layout: {
            header: {
                id: "locked-header",
                type: "header",
                locked: true,
                lockedPosition: true,
                props: seededHeaderProps
            },
            bodyBlocks: [{
                id: `section-${Date.now()}`,
                type: "section",
                locked: false,
                props: {
                    name: "Section 1",
                    bgColor: "#ffffff",
                    paddingTop: 16,
                    paddingBottom: 16,
                    blocks: [{
                        id: `html-${Date.now()}`,
                        type: "html",
                        locked: false,
                        props: { html: safeHtml }
                    }]
                }
            }],
            footer: {
                id: "locked-footer",
                type: "footer",
                locked: true,
                lockedPosition: true,
                props: seededFooterProps
            }
        }
    };
}

export default function BuilderPage() {
    const [searchParams] = useSearchParams();
    const { campaignId } = useParams();
    const campaignIdFromUrl = String(campaignId || searchParams.get("campaignId") || "").trim();
    const initialTab = String(searchParams.get("tab") || "builder").toLowerCase();

    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [proofLogs, setProofLogs] = useState(() => readLocalJson(PROOF_LOG_KEY, []));
    const [draftVersions, setDraftVersions] = useState(() => readLocalJson(DRAFT_VERSIONS_KEY, []));
    const [previewMode, setPreviewMode] = useState("working");
    const [previewDevice, setPreviewDevice] = useState("desktop");
    const [showSamplePersonalization, setShowSamplePersonalization] = useState(true);
    const [builderDraft, setBuilderDraft] = useState(null);
    const [builderModel, setBuilderModel] = useState(null);
    const [rawTemplateMode, setRawTemplateMode] = useState(false);
    const [builderVersions, setBuilderVersions] = useState([]);
    const [foundationSaving, setFoundationSaving] = useState(false);
    const autosaving = false;
    const [lastAutosavedAt, setLastAutosavedAt] = useState("");
    const [autosaveNonce, setAutosaveNonce] = useState(0);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [campaignContext, setCampaignContext] = useState(null);
    const [campaignContextReady, setCampaignContextReady] = useState(!campaignIdFromUrl);
    const [campaignDetail, setCampaignDetail] = useState({ versions: [], proofSends: [], activities: [] });
    const [selectedProofVersionKey, setSelectedProofVersionKey] = useState("working");
    const [compareBaseVersionKey, setCompareBaseVersionKey] = useState("working");
    const [compareTargetVersionKey, setCompareTargetVersionKey] = useState("");
    const [proofSending, setProofSending] = useState(false);
    const [restoringVersion, setRestoringVersion] = useState(false);
    const [focusBlockId, setFocusBlockId] = useState("");
    const [loadedVersionLabel, setLoadedVersionLabel] = useState("Working draft (unsaved changes)");
    const [activeTab, setActiveTab] = useState(
        WORKSPACE_TABS.some((tab) => tab.id === initialTab) ? initialTab : "builder"
    );
    const [actionLoading, setActionLoading] = useState({});
    const [showCanvasSections, setShowCanvasSections] = useState(false);
    const [quickEditSelectionId, setQuickEditSelectionId] = useState("");
    const [showQuickEditMediaPicker, setShowQuickEditMediaPicker] = useState(false);
    const [quickEditForm, setQuickEditForm] = useState({
        text: "",
        textHtml: "",
        label: "",
        href: "",
        src: "",
        alt: ""
    });
    const [previewFrameNonce, setPreviewFrameNonce] = useState(0);

    const [personalization, setPersonalization] = useState(PERSONALIZATION_SAMPLE_DEFAULTS);
    const builderChangeMutedRef = useRef(false);
    const previewFrameRef = useRef(null);
    const previewFrameCleanupRef = useRef(null);
    const pendingPreviewScrollRef = useRef(null);

    function isActionLoading(key) {
        return Boolean(actionLoading?.[key]);
    }

    async function runWithActionLoading(key, action) {
        if (!key || typeof action !== "function") return;
        if (isActionLoading(key)) return;
        setActionLoading((current) => ({ ...current, [key]: true }));
        const startedAt = Date.now();
        try {
            return await action();
        } finally {
            const elapsed = Date.now() - startedAt;
            const minMs = 220;
            if (elapsed < minMs) {
                await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
            }
            setActionLoading((current) => ({ ...current, [key]: false }));
        }
    }

    const [draft, setDraft] = useState(() => readLocalJson(DRAFT_KEY, createDefaultDraftState()));

    const activeTemplates = useMemo(
        () => [...templates].filter((template) => template.isActive).sort(templateSort),
        [templates]
    );

    const campaignTemplateId = String(campaignContext?.templateMasterId || "").trim();

    const templateOptions = useMemo(() => {
        if (!campaignTemplateId) return activeTemplates;
        return [...templates]
            .filter((template) => template.isActive || template.id === campaignTemplateId)
            .sort(templateSort);
    }, [templates, activeTemplates, campaignTemplateId]);

    const selectedTemplate = useMemo(
        () => templateOptions.find((template) => template.id === templateId) || null,
        [templateOptions, templateId]
    );

    const isCampaignTemplateLocked = Boolean(campaignIdFromUrl && campaignTemplateId);

    const campaignKey = `${campaignIdFromUrl || "campaign"}__${templateId || "template"}__${draft.campaignName || "unnamed"}`;
    const localRoundCount = proofLogs.filter((log) => log.campaignKey === campaignKey && log.ok).length;
    const roundCount = Math.max(localRoundCount, Number(campaignContext?.currentProofRound || 0));
    const latestDraftVersion = builderVersions[0] || draftVersions[0] || null;

    const step1Checks = useMemo(() => {
        const hasTemplate = Boolean(selectedTemplate);
        const starterReady = Boolean(String(draft.htmlSource || "").trim());
        return [
            { key: "template", label: "Template selected", ok: hasTemplate },
            { key: "starter", label: "Starter HTML loaded", ok: starterReady }
        ];
    }, [selectedTemplate, draft.htmlSource]);

    const step1Ready = step1Checks.every((item) => item.ok);

    const previewSourceHtml = useMemo(() => {
        if (previewMode === "latest" && (latestDraftVersion?.html || latestDraftVersion?.htmlDraft)) {
            return latestDraftVersion.html || latestDraftVersion.htmlDraft;
        }
        return draft.htmlSource;
    }, [previewMode, latestDraftVersion, draft.htmlSource]);

    const previewHtml = useMemo(() => {
        if (!showSamplePersonalization) return sanitizePreviewHtml(previewSourceHtml);
        return sanitizePreviewHtml(renderPersonalizedHtml(previewSourceHtml, personalization));
    }, [showSamplePersonalization, previewSourceHtml, personalization]);

    const quickEditSnapshot = useMemo(
        () => buildQuickEditSnapshot(draft.htmlSource),
        [draft.htmlSource]
    );
    const quickEditEntries = quickEditSnapshot.entries;
    const quickEditModeEnabled = previewMode === "working";
    const quickEditSelectedEntry = useMemo(
        () => quickEditEntries.find((item) => item.id === quickEditSelectionId) || null,
        [quickEditEntries, quickEditSelectionId]
    );

    const previewFrameHtml = useMemo(() => {
        if (!quickEditModeEnabled) {
            return previewHtml || "<p style='padding:16px'>No HTML yet.</p>";
        }
        const source = String(quickEditSnapshot.annotatedHtml || draft.htmlSource || "");
        const withPersonalization = showSamplePersonalization
            ? renderPersonalizedHtml(source, personalization)
            : source;
        const safeHtml = sanitizePreviewHtml(withPersonalization);
        return injectQuickEditBridge(safeHtml) || "<p style='padding:16px'>No HTML yet.</p>";
    }, [
        quickEditModeEnabled,
        previewHtml,
        quickEditSnapshot.annotatedHtml,
        draft.htmlSource,
        showSamplePersonalization,
        personalization
    ]);

    const tokenValidationIssues = useMemo(
        () => validateTokenUsage(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [draft, builderModel]
    );

    const qaIssues = useMemo(() => {
        const issues = [];

        if (!draft.subject.trim()) {
            issues.push({ id: "subject-required", level: "error", message: "Subject is required.", section: "global" });
        }
        if (!draft.campaignName.trim()) {
            issues.push({ id: "campaign-name-required", level: "error", message: "Campaign name is required.", section: "global" });
        }
        if (!String(draft.htmlSource || "").trim()) {
            issues.push({ id: "html-required", level: "error", message: "HTML source is required.", section: "global" });
        }
        tokenValidationIssues.forEach((message, index) => {
            issues.push({
                id: `token-${index}`,
                level: "error",
                message,
                section: "global"
            });
        });

        const sections = normalizeLayoutSections(builderModel);
        const bodyBlocks = sections.flatMap((section) => (
            Array.isArray(section?.props?.blocks) ? section.props.blocks : []
        ));
        if (showCanvasSections && !bodyBlocks.length) {
            issues.push({
                id: "body-empty",
                level: "warn",
                message: "No body blocks in canvas. Add at least one content block.",
                section: "builder"
            });
        }

        bodyBlocks.forEach((block, index) => {
            const type = String(block?.type || "").toLowerCase();
            const blockId = String(block?.id || "");
            const prefix = `Block #${index + 1}`;
            const src = String(block?.props?.src || "").trim();
            const alt = String(block?.props?.alt || "").trim();
            const href = String(block?.props?.href || "").trim();
            const label = String(block?.props?.label || "").trim();
            const text = String(block?.props?.text || "").trim();

            if (type === "image") {
                if (!src) {
                    issues.push({ id: `${blockId}-img-src`, level: "error", blockId, message: `${prefix}: image source is required.`, section: "builder" });
                } else if (!isAcceptableAssetUrl(src)) {
                    issues.push({ id: `${blockId}-img-src-invalid`, level: "error", blockId, message: `${prefix}: image source URL is invalid.`, section: "builder" });
                }
                if (!alt) {
                    issues.push({ id: `${blockId}-img-alt`, level: "error", blockId, message: `${prefix}: alt text is required for accessibility.`, section: "builder" });
                }
            }

            if (type === "button") {
                if (!label) {
                    issues.push({ id: `${blockId}-btn-label`, level: "error", blockId, message: `${prefix}: button label is required.`, section: "builder" });
                }
                if (!href) {
                    issues.push({ id: `${blockId}-btn-link`, level: "error", blockId, message: `${prefix}: button URL is required.`, section: "builder" });
                } else if (!isValidHttpUrl(href) && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
                    issues.push({ id: `${blockId}-btn-link-invalid`, level: "error", blockId, message: `${prefix}: button URL is invalid.`, section: "builder" });
                }
            }

            if (type === "text" && !text) {
                issues.push({ id: `${blockId}-text-empty`, level: "warn", blockId, message: `${prefix}: text block is empty.`, section: "builder" });
            }
        });

        return issues;
    }, [draft, builderModel, tokenValidationIssues, showCanvasSections]);

    const qaErrorCount = useMemo(
        () => qaIssues.filter((issue) => issue.level === "error").length,
        [qaIssues]
    );

    const foundationLayoutPreview = useMemo(() => {
        const base = builderModel || builderDraft?.layoutJson || null;
        const nextLayout = buildFoundationLayoutForSave(builderDraft, draft, personalization, base);
        return nextLayout ? JSON.stringify(nextLayout, null, 2) : "";
    }, [builderDraft, builderModel, draft, personalization]);

    const combinedVersionHistory = useMemo(() => {
        const dbVersions = (builderVersions || []).map((item) => ({
            id: item.id,
            draftId: item.draftId || "",
            createdAt: item.createdAt,
            versionLabel: item.versionLabel || "",
            campaignName: item.campaignName || draft.campaignName || "",
            subject: item.subject || draft.subject || "",
            html: item.htmlDraft || "",
            layoutJson: item.layoutJson || null,
            source: "db"
        }));
        const localVersions = (draftVersions || []).map((item) => ({
            ...item,
            source: "local"
        }));

        return [...dbVersions, ...localVersions]
            .filter((item) => item.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [builderVersions, draftVersions, draft.campaignName, draft.subject]);

    const campaignVersionTimeline = useMemo(
        () => (Array.isArray(campaignDetail.versions) ? [...campaignDetail.versions] : []).sort(
            (a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
        ),
        [campaignDetail.versions]
    );

    const campaignProofTimeline = useMemo(
        () => (Array.isArray(campaignDetail.proofSends) ? [...campaignDetail.proofSends] : []).sort(
            (a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
        ),
        [campaignDetail.proofSends]
    );

    const campaignActivityTimeline = useMemo(
        () => (Array.isArray(campaignDetail.activities) ? [...campaignDetail.activities] : []).sort(
            (a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
        ),
        [campaignDetail.activities]
    );

    const campaignVersionEntries = useMemo(
        () => campaignVersionTimeline
            .filter((item) => String(item?.htmlContent || "").trim())
            .map((item) => ({
                key: `campaign:${item.id}`,
                source: "campaign",
                label: `Campaign v${item.versionNumber} - ${formatVersionTimestamp(item.createdAt) || "No date"}`,
                campaignVersionId: item.id,
                versionNumber: Number(item.versionNumber || 0),
                subject: String(item.subject || ""),
                preheader: String(item.preheader || ""),
                html: String(item.htmlContent || ""),
                layoutJson: item.layoutJson || null,
                createdAt: item.createdAt || new Date().toISOString()
            })),
        [campaignVersionTimeline]
    );

    const builderVersionEntries = useMemo(() => {
        const seen = new Set();
        return combinedVersionHistory
            .filter((item) => String(item?.html || "").trim())
            .map((item) => {
                const source = item.source === "db" ? "builder_db" : "builder_local";
                const key = `${source}:${item.id}`;
                if (seen.has(key)) return null;
                seen.add(key);
                return {
                    key,
                    source,
                    label: `${source === "builder_db" ? "Builder DB" : "Builder local"} - ${(item.versionLabel || item.subject || item.campaignName || formatVersionTimestamp(item.createdAt) || "No date")}`,
                    campaignVersionId: "",
                    versionNumber: Number(item.versionNumber || 0),
                    versionLabel: String(item.versionLabel || ""),
                    subject: String(item.subject || ""),
                    preheader: "",
                    html: String(item.html || ""),
                    layoutJson: item.layoutJson || null,
                    createdAt: item.createdAt || new Date().toISOString()
                };
            })
            .filter(Boolean);
    }, [combinedVersionHistory]);

    const proofVersionOptions = useMemo(() => {
        const options = [{
            key: "working",
            source: "working",
            label: "Working draft (unsaved changes)",
            campaignVersionId: "",
            versionNumber: Number(campaignContext?.currentVersionNumber || 0),
            subject: String(draft.subject || ""),
            preheader: String(draft.preheader || ""),
            html: String(draft.htmlSource || ""),
            layoutJson: builderModel || builderDraft?.layoutJson || null,
            createdAt: new Date().toISOString()
        }];
        return [...options, ...campaignVersionEntries, ...builderVersionEntries];
    }, [campaignContext?.currentVersionNumber, draft.subject, draft.preheader, draft.htmlSource, builderModel, builderDraft?.layoutJson, campaignVersionEntries, builderVersionEntries]);

    const selectableVersionOptions = useMemo(
        () => proofVersionOptions.filter((item) => String(item?.html || "").trim()),
        [proofVersionOptions]
    );

    const proofVersionSelectOptions = useMemo(
        () => selectableVersionOptions.map((item) => ({
            value: item.key,
            label: item.label
        })),
        [selectableVersionOptions]
    );

    const selectedProofVersion = useMemo(
        () => selectableVersionOptions.find((item) => item.key === selectedProofVersionKey) || selectableVersionOptions[0] || null,
        [selectableVersionOptions, selectedProofVersionKey]
    );

    const compareBaseVersion = useMemo(
        () => selectableVersionOptions.find((item) => item.key === compareBaseVersionKey) || selectableVersionOptions[0] || null,
        [selectableVersionOptions, compareBaseVersionKey]
    );

    const compareTargetVersion = useMemo(
        () => selectableVersionOptions.find((item) => item.key === compareTargetVersionKey) || selectableVersionOptions[1] || null,
        [selectableVersionOptions, compareTargetVersionKey]
    );

    const compareStats = useMemo(() => {
        if (!compareBaseVersion || !compareTargetVersion) return null;
        return computeHtmlCompareStats(compareBaseVersion.html, compareTargetVersion.html);
    }, [compareBaseVersion, compareTargetVersion]);

    useEffect(() => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, [draft]);

    useEffect(() => {
        localStorage.setItem(PROOF_LOG_KEY, JSON.stringify(proofLogs.slice(0, 150)));
    }, [proofLogs]);

    useEffect(() => {
        localStorage.setItem(DRAFT_VERSIONS_KEY, JSON.stringify(draftVersions.slice(0, 60)));
    }, [draftVersions]);

    useEffect(() => {
        if (!selectableVersionOptions.length) {
            setSelectedProofVersionKey("working");
            setCompareBaseVersionKey("working");
            setCompareTargetVersionKey("");
            return;
        }

        const availableKeys = new Set(selectableVersionOptions.map((item) => item.key));
        if (!availableKeys.has(selectedProofVersionKey)) {
            setSelectedProofVersionKey(selectableVersionOptions[0].key);
        }
        if (!availableKeys.has(compareBaseVersionKey)) {
            setCompareBaseVersionKey(selectableVersionOptions[0].key);
        }
        if (!compareTargetVersionKey || !availableKeys.has(compareTargetVersionKey)) {
            const fallbackTarget = selectableVersionOptions.find((item) => item.key !== selectableVersionOptions[0].key)
                || selectableVersionOptions[0];
            setCompareTargetVersionKey(fallbackTarget.key);
        }
    }, [selectableVersionOptions, selectedProofVersionKey, compareBaseVersionKey, compareTargetVersionKey]);

    useEffect(() => {
        if (!quickEditModeEnabled) {
            setQuickEditSelectionId("");
            return;
        }
        if (!quickEditSelectionId) return;
        const stillExists = quickEditEntries.some((item) => item.id === quickEditSelectionId);
        if (!stillExists) {
            setQuickEditSelectionId("");
        }
    }, [quickEditModeEnabled, quickEditEntries, quickEditSelectionId]);

    useEffect(() => {
        if (!showQuickEditMediaPicker) return;
        if (!quickEditSelectedEntry || quickEditSelectedEntry.kind !== "image") {
            setShowQuickEditMediaPicker(false);
        }
    }, [showQuickEditMediaPicker, quickEditSelectedEntry]);

    useEffect(() => {
        const iframe = previewFrameRef.current;
        const documentNode = iframe?.contentDocument;
        if (!documentNode?.body) return;

        if (previewFrameCleanupRef.current) {
            previewFrameCleanupRef.current();
            previewFrameCleanupRef.current = null;
        }

        if (!quickEditModeEnabled) return;

        const styleId = "edm-quick-edit-style";
        if (!documentNode.getElementById(styleId)) {
            const style = documentNode.createElement("style");
            style.id = styleId;
            style.textContent = `
                [data-edm-edit-id] { cursor: pointer !important; outline: 1px dashed transparent; outline-offset: 2px; transition: outline-color 120ms ease; }
                [data-edm-edit-id]:hover { outline-color: #f97316; }
                [data-edm-edit-id].edm-edit-selected { outline: 2px solid #fb923c !important; background: rgba(251, 146, 60, 0.08) !important; }
            `;
            (documentNode.head || documentNode.body).appendChild(style);
        }

        const pickTarget = (event) => {
            const rawTarget = event?.target;
            const elementTarget = rawTarget instanceof Element
                ? rawTarget
                : (rawTarget?.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : null);
            const clicked = elementTarget?.closest?.("[data-edm-edit-id]") || null;
            if (!clicked) return false;
            const id = String(clicked.getAttribute("data-edm-edit-id") || "").trim();
            if (!id) return false;
            openQuickEditSelectionById(id);
            return true;
        };

        const clickHandler = (event) => {
            const matched = pickTarget(event);
            if (!matched) return;
            event.preventDefault();
            event.stopPropagation();
        };

        const mouseDownHandler = (event) => {
            if (Number(event?.button) !== 2) return;
            const matched = pickTarget(event);
            if (!matched) return;
            event.preventDefault();
            event.stopPropagation();
        };

        const contextMenuHandler = (event) => {
            const matched = pickTarget(event);
            if (!matched) return;
            event.preventDefault();
            event.stopPropagation();
            setStepStatus("Element selected from right-click. Update fields in Click-to-edit panel.");
        };

        documentNode.addEventListener("click", clickHandler, true);
        documentNode.addEventListener("mousedown", mouseDownHandler, true);
        documentNode.addEventListener("contextmenu", contextMenuHandler, true);
        previewFrameCleanupRef.current = () => {
            documentNode.removeEventListener("click", clickHandler, true);
            documentNode.removeEventListener("mousedown", mouseDownHandler, true);
            documentNode.removeEventListener("contextmenu", contextMenuHandler, true);
        };

        return () => {
            if (previewFrameCleanupRef.current) {
                previewFrameCleanupRef.current();
                previewFrameCleanupRef.current = null;
            }
        };
    }, [quickEditModeEnabled, quickEditEntries, previewFrameNonce]);

    useEffect(() => {
        const iframe = previewFrameRef.current;
        const documentNode = iframe?.contentDocument;
        if (!documentNode?.body) return;
        documentNode.querySelectorAll(".edm-edit-selected").forEach((element) => {
            element.classList.remove("edm-edit-selected");
        });
        if (!quickEditModeEnabled || !quickEditSelectionId) return;
        const selectedNode = documentNode.querySelector(`[data-edm-edit-id="${quickEditSelectionId}"]`);
        if (selectedNode) {
            selectedNode.classList.add("edm-edit-selected");
        }
    }, [quickEditModeEnabled, quickEditSelectionId, previewFrameNonce, previewFrameHtml]);

    useEffect(() => {
        function onMessage(event) {
            const iframeWindow = previewFrameRef.current?.contentWindow;
            if (!iframeWindow) return;
            if (event.source !== iframeWindow) return;
            const data = event.data || {};
            if (String(data.type || "") !== "edm-quick-edit-select") return;
            const id = String(data.id || "").trim();
            if (!id) return;
            openQuickEditSelectionById(id);
        }
        window.addEventListener("message", onMessage);
        return () => {
            window.removeEventListener("message", onMessage);
        };
    }, [quickEditEntries]);

    useEffect(() => {
        async function run() {
            try {
                setLoading(true);
                setError("");

                const templatePayload = await apiRequest("/api/settings/templates");

                const nextTemplates = Array.isArray(templatePayload?.templates) ? templatePayload.templates : [];
                setTemplates(nextTemplates);
            } catch (apiError) {
                setError(apiError.message);
            } finally {
                setLoading(false);
            }
        }
        run();
    }, []);

    useEffect(() => {
        if (!templateOptions.length) return;
        if (campaignIdFromUrl && !campaignContextReady) return;

        if (campaignIdFromUrl) {
            if (campaignTemplateId) {
                if (templateId !== campaignTemplateId && templateOptions.some((template) => template.id === campaignTemplateId)) {
                    setTemplateId(campaignTemplateId);
                }
            } else if (templateId) {
                setTemplateId("");
            }
            return;
        }

        if (!templateId || !templateOptions.some((template) => template.id === templateId)) {
            const fallback =
                templateOptions.find((template) => template.isMain)
                || templateOptions[0]
                || null;
            if (fallback?.id && fallback.id !== templateId) {
                setTemplateId(fallback.id);
            }
        }
    }, [templateOptions, campaignTemplateId, campaignContextReady, campaignIdFromUrl, templateId]);

    useEffect(() => {
        if (!templateId) return;
        if (campaignIdFromUrl && !campaignContext?.id) return;
        resetWorkingDraftForCurrentContext();
        loadLatestBuilderDraftForSelection(templateId, campaignIdFromUrl);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, campaignIdFromUrl, campaignContext?.id]);

    function resetError() {
        setError("");
    }

    function setStepStatus(message) {
        setStatus(message);
        setError("");
    }

    function resetWorkingDraftForCurrentContext() {
        const contextName = String(campaignContext?.name || "").trim();
        setBuilderDraft(null);
        setBuilderModel(null);
        setRawTemplateMode(false);
        setBuilderVersions([]);
        setUndoStack([]);
        setRedoStack([]);
        setLoadedVersionLabel("Working draft (unsaved changes)");
        setPreviewMode("working");
        setSelectedProofVersionKey("working");
        setQuickEditSelectionId("");
        setDraft((current) => ({
            ...current,
            campaignName: contextName || "",
            subject: contextName || "",
            preheader: "",
            htmlSource: ""
        }));
    }

    function validateTokenUsage() {
        const allowedTokens = new Set(PERSONALIZATION_TOKENS.map((item) => item.token.toLowerCase()));
        const unknownTokens = new Set();

        collectUnknownTokens(
            {
                subject: draft.subject,
                preheader: draft.preheader,
                headline: draft.headline,
                bodyCopy: draft.bodyCopy,
                ctaLabel: draft.ctaLabel,
                ctaUrl: draft.ctaUrl,
                htmlSource: draft.htmlSource
            },
            allowedTokens,
            unknownTokens
        );

        if (builderModel?.layout?.bodyBlocks) {
            collectUnknownTokens(builderModel.layout.bodyBlocks, allowedTokens, unknownTokens);
        }

        if (!unknownTokens.size) return [];
        const allowedLabel = PERSONALIZATION_TOKENS.map((item) => item.token).join(", ");
        return [
            `Unknown personalization token(s): ${Array.from(unknownTokens).join(", ")}. Allowed tokens: ${allowedLabel}.`
        ];
    }

    function updateDraftField(field, value) {
        setDraft((current) => ({
            ...current,
            [field]: value
        }));
        if (builderDraft?.id) {
            setAutosaveNonce((current) => current + 1);
        }
    }

    function updatePersonalizationField(field, value) {
        setPersonalization((current) => ({
            ...current,
            [field]: value
        }));
        if (builderDraft?.id) {
            setAutosaveNonce((current) => current + 1);
        }
    }

    function openQuickEditSelectionById(editId) {
        const id = String(editId || "").trim();
        if (!id) return;
        const entry = quickEditEntries.find((item) => item.id === id) || null;
        if (!entry) {
            setError("Selected element is no longer available. Please click again.");
            return;
        }
        setQuickEditSelectionId(String(entry.id || id));
        setQuickEditForm({
            text: String(entry.text || ""),
            textHtml: String(entry.html || ""),
            label: entry.kind === "link" ? stripDecorativePrefix(String(entry.label || "")) : String(entry.label || ""),
            href: String(entry.href || ""),
            src: String(entry.src || ""),
            alt: String(entry.alt || "")
        });
        setError("");
    }

    function capturePreviewScrollPosition() {
        const previewWindow = previewFrameRef.current?.contentWindow;
        if (!previewWindow) return;
        pendingPreviewScrollRef.current = {
            x: Number(previewWindow.scrollX || 0),
            y: Number(previewWindow.scrollY || 0)
        };
    }

    function restorePreviewScrollPosition() {
        const previewWindow = previewFrameRef.current?.contentWindow;
        const saved = pendingPreviewScrollRef.current;
        if (!previewWindow || !saved) return;
        previewWindow.scrollTo(saved.x || 0, saved.y || 0);
        pendingPreviewScrollRef.current = null;
    }

    function applyQuickEditSelection() {
        if (!quickEditSelectedEntry) {
            setError("Click a template element in preview first.");
            return;
        }

        const source = String(draft.htmlSource || "").trim();
        if (!source) {
            setError("No HTML source available.");
            return;
        }

        const payload = quickEditSelectedEntry.kind === "text"
            ? { text: quickEditForm.text, html: quickEditForm.textHtml }
            : quickEditSelectedEntry.kind === "link"
                ? { label: quickEditForm.label, href: quickEditForm.href }
                : { src: quickEditForm.src, alt: quickEditForm.alt };

        const result = applyQuickEditMutation(source, quickEditSelectedEntry.id, payload);
        if (!result.applied || !String(result.html || "").trim()) {
            setError("Could not apply edit to this element. Please click it again and retry.");
            return;
        }

        capturePreviewScrollPosition();
        setDraft((current) => ({
            ...current,
            htmlSource: result.html
        }));
        setPreviewMode("working");
        setSelectedProofVersionKey("working");
        if (builderDraft?.id) {
            setAutosaveNonce((current) => current + 1);
        }
        setStepStatus(`${quickEditSelectedEntry.kind} updated in template HTML.`);
    }

    function applyQuickEditMediaSelection(item) {
        if (!item || quickEditSelectedEntry?.kind !== "image") return;
        setQuickEditForm((current) => ({
            ...current,
            src: String(item?.url || ""),
            alt: String(current?.alt || "").trim() || String(item?.altText || "")
        }));
        setShowQuickEditMediaPicker(false);
        setError("");
    }

    function syncDraftHtmlFromModel(nextModel) {
        const html = renderHtmlFromBuilderModel(nextModel, draft.htmlSource);
        if (html === "") return;
        setDraft((current) => ({
            ...current,
            htmlSource: html
        }));
    }

    function handleBuilderModelChange(nextModel) {
        const safeNextModel = cloneJson(nextModel);
        if (!safeNextModel) return;

        const previousModel = cloneJson(builderModel || builderDraft?.layoutJson || null);
        const shouldTrackHistory = !builderChangeMutedRef.current && previousModel;
        if (shouldTrackHistory) {
            const previousJson = JSON.stringify(previousModel);
            const nextJson = JSON.stringify(safeNextModel);
            if (previousJson !== nextJson) {
                setUndoStack((current) => [previousModel, ...current].slice(0, BUILDER_HISTORY_LIMIT));
                setRedoStack([]);
                setAutosaveNonce((current) => current + 1);
            }
        }

        setBuilderModel(safeNextModel);
        if (!rawTemplateMode) {
            syncDraftHtmlFromModel(safeNextModel);
        }
    }

    function applySnapshot(nextSnapshot) {
        const safeSnapshot = cloneJson(nextSnapshot);
        if (!safeSnapshot) return;
        builderChangeMutedRef.current = true;
        setBuilderModel(safeSnapshot);
        if (!rawTemplateMode) {
            syncDraftHtmlFromModel(safeSnapshot);
        }
        window.setTimeout(() => {
            builderChangeMutedRef.current = false;
        }, 0);
        setAutosaveNonce((current) => current + 1);
    }

    function handleUndo() {
        setUndoStack((current) => {
            if (!current.length) return current;
            const [previous, ...rest] = current;
            const currentSnapshot = cloneJson(builderModel || builderDraft?.layoutJson || null);
            if (currentSnapshot) {
                setRedoStack((redoCurrent) => [currentSnapshot, ...redoCurrent].slice(0, BUILDER_HISTORY_LIMIT));
            }
            applySnapshot(previous);
            setStepStatus("Undo applied.");
            return rest;
        });
    }

    function handleRedo() {
        setRedoStack((current) => {
            if (!current.length) return current;
            const [next, ...rest] = current;
            const currentSnapshot = cloneJson(builderModel || builderDraft?.layoutJson || null);
            if (currentSnapshot) {
                setUndoStack((undoCurrent) => [currentSnapshot, ...undoCurrent].slice(0, BUILDER_HISTORY_LIMIT));
            }
            applySnapshot(next);
            setStepStatus("Redo applied.");
            return rest;
        });
    }

    async function loadBuilderDraftById(id) {
        if (!id) return;
        const payload = await apiRequest(`/api/builder/drafts/${id}`);
        const nextDraft = payload?.draft || null;
        const nextVersions = Array.isArray(payload?.versions) ? payload.versions : [];
        setBuilderDraft(nextDraft);
        setBuilderModel(nextDraft?.layoutJson || null);
        setRawTemplateMode(isRawTemplateLayout(nextDraft?.layoutJson || null));
        setUndoStack([]);
        setRedoStack([]);
        setLastAutosavedAt(nextDraft?.updatedAt || "");
        setBuilderVersions(nextVersions);
        if (nextVersions.length) {
            const latest = nextVersions[0];
            setLoadedVersionLabel(String(latest?.versionLabel || latest?.subject || latest?.campaignName || "Working draft").trim());
        } else {
            setLoadedVersionLabel("Working draft (unsaved changes)");
        }
        if (nextDraft) {
            try {
                const storageKey = buildDraftSelectionKey(nextDraft.templateMasterId, nextDraft.campaignId || campaignIdFromUrl);
                localStorage.setItem(storageKey, String(nextDraft.id || ""));
            } catch (_error) {
                // Ignore localStorage issues in private mode.
            }
            setDraft((current) => ({
                ...current,
                campaignName: nextDraft.campaignName || current.campaignName,
                subject: nextDraft.subject || current.subject,
                preheader: nextDraft.preheader || current.preheader,
                htmlSource: nextDraft.htmlDraft || current.htmlSource
            }));
        }
    }

    async function loadLatestBuilderDraftForSelection(nextTemplateId, campaignId = "") {
        if (!nextTemplateId) {
            resetWorkingDraftForCurrentContext();
            return;
        }

        try {
            const query = new URLSearchParams();
            query.set("templateMasterId", nextTemplateId);
            if (campaignId) query.set("campaignId", campaignId);
            const payload = await apiRequest(`/api/builder/drafts?${query.toString()}`);
            const drafts = Array.isArray(payload?.drafts) ? payload.drafts : [];
            if (!drafts.length) {
                resetWorkingDraftForCurrentContext();
                return;
            }
            let preferredDraftId = "";
            try {
                const storageKey = buildDraftSelectionKey(nextTemplateId, campaignId);
                preferredDraftId = String(localStorage.getItem(storageKey) || "").trim();
            } catch (_error) {
                preferredDraftId = "";
            }
            const preferred = preferredDraftId
                ? drafts.find((item) => String(item?.id || "").trim() === preferredDraftId)
                : null;
            // For campaign workspace, always use latest DB draft by updatedAt to avoid stale draft selection.
            const shouldForceLatest = Boolean(String(campaignId || "").trim());
            await loadBuilderDraftById((shouldForceLatest ? null : preferred?.id) || drafts[0].id);
        } catch (_error) {
            resetWorkingDraftForCurrentContext();
        }
    }

    async function fetchLatestTemplateById(templateMasterId) {
        const targetTemplateId = String(templateMasterId || "").trim();
        if (!targetTemplateId) return null;

        const payload = await apiRequest("/api/settings/templates");
        const nextTemplates = Array.isArray(payload?.templates) ? payload.templates : [];
        if (nextTemplates.length) {
            setTemplates(nextTemplates);
        }
        return nextTemplates.find((template) => String(template?.id || "").trim() === targetTemplateId) || null;
    }

    async function refreshCampaignContext(campaignIdValue, options = {}) {
        const targetCampaignId = String(campaignIdValue || "").trim();
        const {
            keepReady = true
        } = options;

        if (!targetCampaignId) {
            setCampaignContext(null);
            setCampaignDetail({ versions: [], proofSends: [], activities: [] });
            if (!keepReady) setCampaignContextReady(true);
            return null;
        }

        const payload = await apiRequest(`/api/campaigns/${encodeURIComponent(targetCampaignId)}`);
        const campaign = payload?.campaign || null;
        setCampaignContext(campaign);
        const campaignTemplateId = String(campaign?.templateMasterId || "").trim();
        if (campaignTemplateId) {
            setTemplateId(campaignTemplateId);
        }
        setCampaignDetail({
            versions: Array.isArray(payload?.versions) ? payload.versions : [],
            proofSends: Array.isArray(payload?.proofSends) ? payload.proofSends : [],
            activities: Array.isArray(payload?.activities) ? payload.activities : []
        });
        setDraft((current) => ({
            ...current,
            campaignName: String(campaign?.name || current.campaignName || ""),
            subject: String(campaign?.name || current.subject || "")
        }));
        if (!keepReady) setCampaignContextReady(true);
        return campaign;
    }

    useEffect(() => {
        let active = true;
        async function loadCampaignContext() {
            setCampaignContextReady(false);
            if (!campaignIdFromUrl) {
                setCampaignContext(null);
                setCampaignDetail({ versions: [], proofSends: [], activities: [] });
                setCampaignContextReady(true);
                return;
            }
            try {
                await refreshCampaignContext(campaignIdFromUrl, { keepReady: false });
                if (!active) return;
            } catch (apiError) {
                if (!active) return;
                setError(apiError.message || "Failed to load campaign context.");
                setCampaignContextReady(true);
            }
        }
        loadCampaignContext();
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaignIdFromUrl]);

    // Autosave intentionally disabled; save is manual via Save now / Save draft version.

    async function persistStep2Foundation({ saveVersion = false, refreshAfterSave = true, background = false, versionLabel = "" } = {}) {
        const workingDraft = await ensureDraftInitializedForSave();
        const forceHtmlSource = rawTemplateMode;

        const layoutJson = buildFoundationLayoutForSave(
            workingDraft,
            draft,
            personalization,
            builderModel || workingDraft?.layoutJson || null,
            { forceHtmlSource }
        );
        if (!layoutJson) {
            throw new Error("Builder foundation JSON is not ready.");
        }

        if (!background) {
            setFoundationSaving(true);
        }
        try {
            const savePayload = await apiRequest(`/api/builder/drafts/${workingDraft.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    campaignName: draft.campaignName,
                    subject: draft.subject,
                    preheader: draft.preheader,
                    htmlDraft: draft.htmlSource,
                    layoutJson
                })
            });
            if (savePayload?.draft) {
                setBuilderDraft(savePayload.draft);
            }

            if (saveVersion) {
                await apiRequest(`/api/builder/drafts/${workingDraft.id}/versions`, {
                    method: "POST",
                    body: JSON.stringify({
                        layoutJson,
                        htmlDraft: draft.htmlSource,
                        versionLabel
                    })
                });
            }

            if (refreshAfterSave) {
                await loadBuilderDraftById(workingDraft.id);
            }
        } finally {
            if (!background) {
                setFoundationSaving(false);
            }
        }
    }

    function insertPersonalizationTokens() {
        const tokenLines = PERSONALIZATION_TOKENS.map((item) => `${item.label}: ${item.token}`).join("\n");
        setDraft((current) => {
            const body = String(current.bodyCopy || "");
            const merged = body.trim() ? `${body}\n\n${tokenLines}` : tokenLines;
            return { ...current, bodyCopy: merged };
        });
        if (builderDraft?.id) {
            setAutosaveNonce((current) => current + 1);
        }
        setStepStatus("Personalization tokens inserted into body copy.");
    }

    function validateStep2Draft() {
        return qaIssues
            .filter((issue) => issue.level === "error")
            .map((issue) => issue.message);
    }

    async function initializeDraftFromTemplate({ templateToUse, resolvedHtml, nextCampaignName, nextSubject, nextPreheader }) {
        setDraft((current) => ({
            ...current,
            campaignName: nextCampaignName,
            subject: nextSubject,
            htmlSource: resolvedHtml
        }));

        const payload = await apiRequest("/api/builder/drafts/init", {
            method: "POST",
            body: JSON.stringify({
                campaignId: campaignIdFromUrl || undefined,
                templateMasterId: templateToUse.id,
                campaignName: nextCampaignName,
                subject: nextSubject,
                preheader: nextPreheader,
                htmlSource: resolvedHtml
            })
        });

        const nextDraft = payload?.draft || null;
        if (nextDraft?.id) {
            setBuilderDraft(nextDraft);
            setBuilderModel(nextDraft?.layoutJson || null);
            setRawTemplateMode(isRawTemplateLayout(nextDraft?.layoutJson || null));
            setBuilderVersions(Array.isArray(payload?.versions) ? payload.versions : []);
            setUndoStack([]);
            setRedoStack([]);
            setLastAutosavedAt(nextDraft?.updatedAt || "");
            if (campaignIdFromUrl) {
                await refreshCampaignContext(campaignIdFromUrl);
            }
        }

        return nextDraft;
    }

    async function ensureDraftInitializedForSave() {
        if (builderDraft?.id) return builderDraft;

        const source = String(draft.htmlSource || "").trim();
        if (!source) {
            throw new Error("Please load template HTML first.");
        }
        if (!selectedTemplate?.id) {
            throw new Error("Select template first.");
        }

        const fallbackName = `Template ${selectedTemplate.code || selectedTemplate.name || ""}`.trim();
        const nextCampaignName = String(draft.campaignName || campaignContext?.name || fallbackName || "Campaign Draft").trim();
        const nextSubject = String(draft.subject || campaignContext?.name || nextCampaignName || fallbackName || "Campaign Subject").trim();
        const nextPreheader = String(draft.preheader || "").trim();

        const initializedDraft = await initializeDraftFromTemplate({
            templateToUse: selectedTemplate,
            resolvedHtml: source,
            nextCampaignName,
            nextSubject,
            nextPreheader
        });

        if (!initializedDraft?.id) {
            throw new Error("Failed to initialize draft.");
        }
        return initializedDraft;
    }

    async function convertHtmlToBlocks() {
        const source = String(draft.htmlSource || "").trim();
        if (!source) {
            setError("Please load template HTML first.");
            return;
        }

        let workingDraft = builderDraft || null;
        const nextCampaignName = draft.campaignName || campaignContext?.name || "";
        const nextSubject = draft.subject || campaignContext?.name || "";
        const nextPreheader = draft.preheader || "";

        if (!workingDraft?.id) {
            if (!selectedTemplate?.id) {
                setError("Select template first.");
                return;
            }
            try {
                const initializedDraft = await initializeDraftFromTemplate({
                    templateToUse: selectedTemplate,
                    resolvedHtml: source,
                    nextCampaignName,
                    nextSubject,
                    nextPreheader
                });
                if (!initializedDraft?.id) {
                    setError("Failed to initialize draft.");
                    return;
                }
                workingDraft = initializedDraft;
            } catch (apiError) {
                setError(apiError.message || "Failed to initialize Step 2 draft.");
                return;
            }
        }

        const baseModel = cloneJson(builderModel || workingDraft?.layoutJson || {
            schemaVersion: 1,
            metadata: {},
            personalization: {},
            layout: {
                header: {
                    id: "locked-header",
                    type: "header",
                    locked: true,
                    props: { html: "<!-- Locked Header -->", editable: true }
                },
                bodyBlocks: [],
                footer: {
                    id: "locked-footer",
                    type: "footer",
                    locked: true,
                    props: { html: "<!-- Locked Footer -->", editable: true }
                }
            }
        });

        if (!baseModel?.layout?.header || !baseModel?.layout?.footer) {
            setError("Builder model is not ready.");
            return;
        }

        let templateForRules = selectedTemplate;
        if (selectedTemplate?.id) {
            try {
                const latestTemplate = await fetchLatestTemplateById(selectedTemplate.id);
                templateForRules = latestTemplate || selectedTemplate;
            } catch (_error) {
                templateForRules = selectedTemplate;
            }
        }
        const templateRules = resolveTemplateSectionRules(templateForRules, baseModel?.metadata || {});
        const converted = applySectionModelFromHtml(baseModel, source, { rules: templateRules });
        if (!converted?.sectionCount) {
            setError("Could not generate editable sections from this HTML.");
            return;
        }
        setRawTemplateMode(false);
        // Preserve exact template HTML after conversion; only block edits should regenerate HTML.
        setBuilderModel(cloneJson(converted.model));
        setUndoStack([]);
        setRedoStack([]);
        setDraft((current) => ({
            ...current,
            htmlSource: source
        }));

        try {
            await apiRequest(`/api/builder/drafts/${workingDraft.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    campaignName: nextCampaignName,
                    subject: nextSubject,
                    preheader: nextPreheader,
                    htmlDraft: source,
                    layoutJson: converted.model
                })
            });
            await loadBuilderDraftById(workingDraft.id);
            setLastAutosavedAt(new Date().toISOString());
            setStepStatus(`Converted HTML into ${converted.sectionCount} editable sections (${converted.fidelity || "parsed"}).`);
        } catch (apiError) {
            setError(apiError.message || "Converted blocks, but failed to save.");
        }
    }

    async function applyTemplateHtml() {
        if (!selectedTemplate) {
            setError("Select template first.");
            return;
        }

        resetError();
        let templateToUse = selectedTemplate;
        try {
            const latestTemplate = await fetchLatestTemplateById(selectedTemplate.id);
            templateToUse = latestTemplate || selectedTemplate;
        } catch (apiError) {
            setError(apiError.message || "Failed to refresh template HTML from database.");
            return;
        }

        const html = String(templateToUse?.htmlContent || "").trim();
        if (!html) {
            setError("Selected template has no stored HTML yet.");
            return;
        }

        const nextCampaignName = draft.campaignName || campaignContext?.name || "";
        const nextSubject = draft.subject || campaignContext?.name || "";
        setDraft((current) => ({
            ...current,
            htmlSource: html,
            campaignName: nextCampaignName,
            subject: nextSubject
        }));
        setPreviewMode("working");
        setSelectedProofVersionKey("working");
        setQuickEditSelectionId("");
        setBuilderDraft(null);
        setBuilderModel(createWorkingModelFromHtml({
            html,
            campaignName: nextCampaignName,
            subject: nextSubject,
            preheader: draft.preheader || "",
            personalization,
            templateRules: resolveTemplateSectionRules(templateToUse, null)
        }));
        setRawTemplateMode(true);
        setBuilderVersions([]);
        setLastAutosavedAt("");
        setUndoStack([]);
        setRedoStack([]);
        setLoadedVersionLabel(`Template source - ${templateToUse?.name || selectedTemplate.name}`);
        setStepStatus(`Template HTML loaded from ${templateToUse?.name || selectedTemplate.name}. Click "Convert HTML to editable blocks" when ready.`);
    }

    function applyContent() {
        if (!draft.htmlSource.trim()) {
            setError("Please load or paste HTML first.");
            return;
        }

        try {
            const parser = new DOMParser();
            const documentNode = parser.parseFromString(draft.htmlSource, "text/html");
            const firstImage = documentNode.querySelector("img");
            const heading = documentNode.querySelector("h1, h2");
            const paragraph = documentNode.querySelector("p");
            const firstLink = documentNode.querySelector("a");

            if (draft.heroImageUrl && firstImage) firstImage.setAttribute("src", draft.heroImageUrl);
            if (draft.headline && heading) heading.textContent = draft.headline;
            if (draft.bodyCopy && paragraph) paragraph.textContent = draft.bodyCopy;
            if (firstLink) {
                if (draft.ctaLabel) firstLink.textContent = draft.ctaLabel;
                if (draft.ctaUrl) firstLink.setAttribute("href", draft.ctaUrl);
            }

            if (draft.preheader) {
                const span = documentNode.createElement("span");
                span.setAttribute("style", "display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;");
                span.textContent = draft.preheader;
                if (documentNode.body.firstChild) documentNode.body.insertBefore(span, documentNode.body.firstChild);
            }

            setDraft((current) => ({
                ...current,
                htmlSource: "<!DOCTYPE html>\n" + documentNode.documentElement.outerHTML
            }));
            if (builderDraft?.id) {
                setAutosaveNonce((current) => current + 1);
            }
            setStepStatus("Content and images applied to HTML.");
        } catch (parseError) {
            setError(parseError.message || "Failed to parse HTML.");
        }
    }

    async function saveDraftVersion() {
        const issues = validateStep2Draft();
        if (issues.length) {
            setError(issues.join(" "));
            return;
        }

        const suggestedLabel = `Version ${new Date().toLocaleString("en-GB")}`;
        const promptedLabel = window.prompt("Version name", suggestedLabel);
        if (promptedLabel === null) {
            setStepStatus("Save draft version cancelled.");
            return;
        }
        const versionLabel = String(promptedLabel || "").trim() || suggestedLabel;

        try {
            const workingDraft = await ensureDraftInitializedForSave();
            const forceHtmlSource = rawTemplateMode;
            const layoutJson = buildFoundationLayoutForSave(
                workingDraft,
                draft,
                personalization,
                builderModel || workingDraft?.layoutJson || null,
                { forceHtmlSource }
            );
            await persistStep2Foundation({ saveVersion: true, versionLabel });

            const entry = {
                id: `v-${Date.now()}`,
                createdAt: new Date().toISOString(),
                versionLabel,
                campaignName: draft.campaignName,
                subject: draft.subject,
                html: draft.htmlSource
            };
            setDraftVersions((current) => [entry, ...current].slice(0, 60));

            if (campaignIdFromUrl) {
                await apiRequest(`/api/campaigns/${encodeURIComponent(campaignIdFromUrl)}/versions`, {
                    method: "POST",
                    body: JSON.stringify({
                        subject: draft.subject,
                        preheader: draft.preheader,
                        htmlContent: draft.htmlSource,
                        layoutJson,
                        changeNote: `Saved from Step 2 draft version (${versionLabel}).`
                    })
                });
                await refreshCampaignContext(campaignIdFromUrl);
            }

            setPreviewMode("latest");
            setLoadedVersionLabel(versionLabel);
            setStepStatus(`Draft version "${versionLabel}" saved and campaign version timeline updated.`);
        } catch (apiError) {
            setError(apiError.message || "Failed to save draft version.");
        }
    }

    async function saveNow() {
        try {
            await persistStep2Foundation({ saveVersion: false });
            setLastAutosavedAt(new Date().toISOString());
            setLoadedVersionLabel("Working draft (saved)");
            setStepStatus("Working draft saved.");
        } catch (apiError) {
            setError(apiError.message || "Failed to save draft.");
        }
    }

    function loadVersion(version, message = "Loaded selected draft version to working draft.") {
        const versionHtml = String(version?.html || version?.htmlDraft || version?.htmlContent || "").trim();
        if (!versionHtml) return;
        const resolvedLabel = String(
            version?.label
            || version?.versionLabel
            || version?.subject
            || version?.campaignName
            || "Working draft"
        ).trim();
        setDraft((current) => ({
            ...current,
            campaignName: version.campaignName || current.campaignName,
            subject: version.subject || current.subject,
            preheader: version.preheader || current.preheader,
            htmlSource: versionHtml
        }));
        if (version?.layoutJson) {
            setBuilderModel(version.layoutJson);
            setRawTemplateMode(isRawTemplateLayout(version.layoutJson));
        }
        if (builderDraft?.id) {
            setAutosaveNonce((current) => current + 1);
        }
        setPreviewMode("working");
        setQuickEditSelectionId("");
        setLoadedVersionLabel(resolvedLabel);
        setStepStatus(message);
    }

    async function deleteDraftVersion(version) {
        const versionId = String(version?.id || "").trim();
        if (!versionId) return;
        if (!window.confirm("Delete this version? This action cannot be undone.")) return;

        try {
            resetError();
            const source = String(version?.source || "").toLowerCase();
            if (source === "local") {
                setDraftVersions((current) => current.filter((item) => String(item?.id || "") !== versionId));
                setStepStatus("Local version deleted.");
                return;
            }

            if (source === "db") {
                const draftId = String(version?.draftId || builderDraft?.id || "").trim();
                const draftIdFallback = String(builderDraft?.id || "").trim();
                const candidatePaths = [
                    `/api/builder/versions/${encodeURIComponent(versionId)}`
                ];
                if (draftId) {
                    candidatePaths.push(`/api/builder/drafts/${encodeURIComponent(draftId)}/versions/${encodeURIComponent(versionId)}`);
                }
                if (draftIdFallback && draftIdFallback !== draftId) {
                    candidatePaths.push(`/api/builder/drafts/${encodeURIComponent(draftIdFallback)}/versions/${encodeURIComponent(versionId)}`);
                }

                let deleted = false;
                let firstNon404Error = null;
                for (const path of candidatePaths) {
                    try {
                        await apiRequest(path, { method: "DELETE" });
                        deleted = true;
                        break;
                    } catch (apiError) {
                        if (Number(apiError?.status || 0) === 404) continue;
                        if (!firstNon404Error) firstNon404Error = apiError;
                    }
                }

                if (!deleted) {
                    if (firstNon404Error) throw firstNon404Error;
                    throw new Error("Delete endpoint not found (404). Please restart API server and try again.");
                }
                if (draftId) {
                    await loadBuilderDraftById(draftId);
                } else {
                    setBuilderVersions((current) => current.filter((item) => String(item?.id || "") !== versionId));
                }
                setStepStatus("Builder DB version deleted.");
            }
        } catch (apiError) {
            setError(apiError.message || "Failed to delete draft version.");
        }
    }

    async function deleteCampaignVersion(version) {
        const versionId = String(version?.id || "").trim();
        if (!versionId || !campaignIdFromUrl) return;
        if (!window.confirm("Delete this campaign version? This action cannot be undone.")) return;

        try {
            resetError();
            await apiRequest(`/api/campaigns/${encodeURIComponent(campaignIdFromUrl)}/versions/${encodeURIComponent(versionId)}`, {
                method: "DELETE"
            });
            await refreshCampaignContext(campaignIdFromUrl);
            setStepStatus(`Campaign version ${version.versionNumber || ""} deleted.`);
        } catch (apiError) {
            setError(apiError.message || "Failed to delete campaign version.");
        }
    }

    async function restoreCompareTarget() {
        if (!compareTargetVersion) {
            setError("Select a compare target version first.");
            return;
        }

        try {
            setRestoringVersion(true);
            if (campaignIdFromUrl && compareTargetVersion.campaignVersionId) {
                await apiRequest(`/api/campaigns/${encodeURIComponent(campaignIdFromUrl)}/versions/${encodeURIComponent(compareTargetVersion.campaignVersionId)}/restore`, {
                    method: "POST",
                    body: JSON.stringify({
                        changeNote: `Restored from ${compareTargetVersion.label}`
                    })
                });
                await refreshCampaignContext(campaignIdFromUrl);
            } else if (campaignIdFromUrl) {
                await apiRequest(`/api/campaigns/${encodeURIComponent(campaignIdFromUrl)}/versions`, {
                    method: "POST",
                    body: JSON.stringify({
                        subject: compareTargetVersion.subject || draft.subject,
                        preheader: compareTargetVersion.preheader || draft.preheader,
                        htmlContent: compareTargetVersion.html,
                        layoutJson: compareTargetVersion.layoutJson || builderModel || builderDraft?.layoutJson || null,
                        changeNote: `Restored from ${compareTargetVersion.label}`
                    })
                });
                await refreshCampaignContext(campaignIdFromUrl);
            }

            loadVersion(compareTargetVersion, `Restored ${compareTargetVersion.label} to working draft.`);
        } catch (apiError) {
            setError(apiError.message || "Failed to restore selected version.");
        } finally {
            setRestoringVersion(false);
        }
    }

    async function ensureCampaignVersionForProof(selectedVersion) {
        if (!campaignIdFromUrl) return { campaignVersionId: "", versionNumber: 0 };
        if (selectedVersion?.campaignVersionId) {
            return {
                campaignVersionId: selectedVersion.campaignVersionId,
                versionNumber: Number(selectedVersion.versionNumber || 0)
            };
        }

        const payload = await apiRequest(`/api/campaigns/${encodeURIComponent(campaignIdFromUrl)}/versions`, {
            method: "POST",
            body: JSON.stringify({
                subject: selectedVersion?.subject || draft.subject,
                preheader: selectedVersion?.preheader || draft.preheader,
                htmlContent: selectedVersion?.html || draft.htmlSource,
                layoutJson: selectedVersion?.layoutJson || builderModel || builderDraft?.layoutJson || null,
                changeNote: `Proof snapshot from ${selectedVersion?.label || "selected version"}.`
            })
        });

        return {
            campaignVersionId: String(payload?.version?.id || ""),
            versionNumber: Number(payload?.version?.versionNumber || 0)
        };
    }

    async function sendProof() {
        const selectedVersion = selectedProofVersion || null;
        try {
            const recipients = splitRecipients(draft.recipients);
            const proofSubject = String(selectedVersion?.subject || draft.subject || "").trim();
            const proofHtml = String(selectedVersion?.html || draft.htmlSource || "").trim();
            if (!proofSubject) throw new Error("Subject is required.");
            if (!proofHtml) throw new Error("HTML source is required.");
            if (!recipients.length) throw new Error("At least one recipient is required.");
            if (recipients.length > MAX_RECIPIENTS) throw new Error(`Maximum ${MAX_RECIPIENTS} recipients allowed.`);
            const tokenIssues = validateTokenUsage();
            if (tokenIssues.length) throw new Error(tokenIssues.join(" "));
            const allowedTokens = new Set(PERSONALIZATION_TOKENS.map((item) => item.token.toLowerCase()));
            const unknownProofTokens = new Set();
            collectUnknownTokens(proofHtml, allowedTokens, unknownProofTokens);
            if (unknownProofTokens.size) {
                throw new Error(`Unknown personalization token(s): ${Array.from(unknownProofTokens).join(", ")}`);
            }

            setProofSending(true);
            setStatus("Sending proof...");
            setError("");
            const proofVersionMeta = await ensureCampaignVersionForProof(selectedVersion);

            const result = await apiRequest("/api/send-proof", {
                method: "POST",
                body: JSON.stringify({
                    subject: proofSubject,
                    html: proofHtml,
                    recipients,
                    fromEmail: draft.fromEmail || undefined
                })
            });

            if (campaignIdFromUrl) {
                await apiRequest(`/api/campaigns/${encodeURIComponent(campaignIdFromUrl)}/proof-sends`, {
                    method: "POST",
                    body: JSON.stringify({
                        campaignVersionId: proofVersionMeta.campaignVersionId || undefined,
                        iterationNo: Number(campaignContext?.currentProofRound || 0) + 1,
                        recipients,
                        subject: proofSubject,
                        status: "SENT",
                        providerMessageId: result.messageId || "",
                        sentAt: new Date().toISOString()
                    })
                });
                await refreshCampaignContext(campaignIdFromUrl);
            }

            const entry = {
                timestamp: new Date().toISOString(),
                subject: proofSubject,
                recipients,
                ok: true,
                messageId: result.messageId || "",
                selectedVersionLabel: selectedVersion?.label || "Working draft",
                campaignVersionNumber: Number(proofVersionMeta.versionNumber || 0) || null,
                campaignKey
            };
            setProofLogs((current) => [entry, ...current].slice(0, 150));
            setStatus(`Proof sent from ${selectedVersion?.label || "working draft"}${result.messageId ? ` (ID: ${result.messageId})` : ""}.`);
        } catch (apiError) {
            if (campaignIdFromUrl) {
                try {
                    await apiRequest(`/api/campaigns/${encodeURIComponent(campaignIdFromUrl)}/proof-sends`, {
                        method: "POST",
                        body: JSON.stringify({
                            iterationNo: Number(campaignContext?.currentProofRound || 0) + 1,
                            recipients: splitRecipients(draft.recipients),
                            subject: String(selectedVersion?.subject || draft.subject || "").trim(),
                            status: "FAILED",
                            errorMessage: apiError.message
                        })
                    });
                    await refreshCampaignContext(campaignIdFromUrl);
                } catch (_logError) {
                    // Keep primary error surfaced from send action.
                }
            }
            const entry = {
                timestamp: new Date().toISOString(),
                subject: String(selectedVersion?.subject || draft.subject || "").trim(),
                recipients: splitRecipients(draft.recipients),
                ok: false,
                error: apiError.message,
                selectedVersionLabel: selectedVersion?.label || "Working draft",
                campaignKey
            };
            setProofLogs((current) => [entry, ...current].slice(0, 150));
            setError(apiError.message);
        } finally {
            setProofSending(false);
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>Campaign Workspace</h2>
                <p>Manage one campaign across Builder, Proof, Approval, Versions, and History.</p>
                {campaignContext?.id && (
                    <p className="muted">
                        Managing campaign: <strong>{campaignContext.code}</strong> - {campaignContext.name}
                    </p>
                )}
            </div>

            {loading && <div className="card">Loading template master...</div>}
            {error && <div className="card"><p className="msg error">{error}</p></div>}
            {status && <div className="card"><p className="msg ok">{status}</p></div>}

            {!campaignIdFromUrl && !loading && (
                <section className="card">
                    <h3>No campaign selected</h3>
                    <p className="muted mt-2">Open Campaigns first, then click <strong>Manage</strong> on a campaign row.</p>
                    <div className="mt-3">
                        <NavLink to="/campaigns" className="button-primary">Open campaigns</NavLink>
                    </div>
                </section>
            )}

            {!loading && campaignIdFromUrl && (
                <>
                    <section className="card">
                        <div className="flex flex-wrap gap-2">
                            {WORKSPACE_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={`button-secondary ${activeTab === tab.id ? "active" : ""}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </section>
                    {activeTab === "builder" && (
                        <>
                    <section className="card builder-workspace-sticky">
                        <div className="builder-workspace-sticky-row">
                            <div>
                                <h3>Builder workspace</h3>
                                <p className="muted">Edit blocks, validate QA, save versions, then send proof.</p>
                            </div>
                            <div className="builder-workspace-actions">
                                <span className={`pill ${autosaving ? "in-progress" : "done"}`}>
                                    {autosaving ? "AUTOSAVING..." : "MANUAL SAVE ONLY"}
                                </span>
                                {lastAutosavedAt && (
                                    <span className="muted">Last autosaved: {formatAutosaveTime(lastAutosavedAt)}</span>
                                )}
                                <button type="button" className="button-secondary" onClick={() => setActiveTab("proof")}>
                                    Send proof
                                </button>
                                <button
                                    type="button"
                                    className={`button-primary ${isActionLoading("save-draft-version") ? "is-loading" : ""}`}
                                    onClick={() => runWithActionLoading("save-draft-version", saveDraftVersion)}
                                    disabled={qaErrorCount > 0 || isActionLoading("save-draft-version")}
                                >
                                    {isActionLoading("save-draft-version") ? "Saving..." : "Save draft version"}
                                </button>
                            </div>
                        </div>
                    </section>
                    <section className="card">
                        <h3>Step 1 - Template selection</h3>
                        <p className="muted">Campaign template is managed from Campaign settings. Step 1 binds Step 2 to that selected template.</p>
                        <div className="mt-5">
                            <div>
                                <label htmlFor="group-select">Template group</label>
                                <SearchSelect
                                    id="group-select"
                                    value={templateId}
                                    onChange={(nextValue) => {
                                        if (isCampaignTemplateLocked) return;
                                        setTemplateId(nextValue);
                                    }}
                                    isDisabled={isCampaignTemplateLocked}
                                    options={templateOptions.map((template) => ({
                                        value: template.id,
                                        label: `Template ${template.code} - ${template.name}`
                                    }))}
                                    placeholder="Select template group"
                                />
                                {isCampaignTemplateLocked ? (
                                    <p className="muted mt-2">Locked to this campaign's selected template.</p>
                                ) : (
                                    <p className="muted mt-2">Choose the template for this campaign draft workspace.</p>
                                )}
                                {campaignIdFromUrl && !campaignTemplateId && (
                                    <p className="msg error mt-2">
                                        This campaign has no template selected yet. Set it in Campaigns before starting Step 2.
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="builder-step1-action-grid">
                            <div className="builder-step1-action-card">
                                <button
                                    type="button"
                                    className={`button-secondary ${isActionLoading("load-template-html") ? "is-loading" : ""}`}
                                    onClick={() => runWithActionLoading("load-template-html", async () => applyTemplateHtml())}
                                    disabled={!selectedTemplate || isActionLoading("load-template-html")}
                                    title="Loads exact HTML from selected template into working view"
                                >
                                    {isActionLoading("load-template-html") ? "Loading..." : "Load Template HTML"}
                                </button>
                                <p className="muted">Loads exact HTML only. It does not auto-convert or auto-save.</p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {step1Checks.map((item) => (
                                <span key={item.key} className={`pill ${item.ok ? "done" : "todo"}`}>{item.ok ? "DONE" : "TODO"} {item.label}</span>
                            ))}
                            <span className={`pill ${step1Ready ? "done" : "todo"}`}>{step1Ready ? "READY FOR SIGN-OFF" : "NOT READY"}</span>
                        </div>
                    </section>

                    <section className="card builder-step2-card">
                        <h3>Step 2 - Content, images, and personalization</h3>
                        <p className="muted">Edit campaign metadata, build blocks on canvas, validate QA checks, then save a version.</p>
                        <div className="builder-step2-stack">
                            <div className="builder-step2-meta">
                                <span className="pill in-progress">Campaign: {campaignContext?.code || "-"}</span>
                                <span className="pill in-progress">Status: {campaignContext?.status || "DRAFT"}</span>
                                <span className="pill in-progress">Version: {campaignContext?.currentVersionNumber || 0}</span>
                                <span className="pill in-progress">Proof round: {campaignContext?.currentProofRound || 0}</span>
                                <span className="pill in-progress">Loaded version: {loadedVersionLabel || "Working draft (unsaved changes)"}</span>
                            </div>
                            <div className="row-between">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className={`button-secondary ${isActionLoading("undo") ? "is-loading" : ""}`}
                                        onClick={() => runWithActionLoading("undo", async () => handleUndo())}
                                        disabled={!builderDraft?.id || !undoStack.length || foundationSaving || isActionLoading("undo")}
                                    >
                                        {isActionLoading("undo") ? "Undoing..." : "Undo"}
                                    </button>
                                    <button
                                        type="button"
                                        className={`button-secondary ${isActionLoading("redo") ? "is-loading" : ""}`}
                                        onClick={() => runWithActionLoading("redo", async () => handleRedo())}
                                        disabled={!builderDraft?.id || !redoStack.length || foundationSaving || isActionLoading("redo")}
                                    >
                                        {isActionLoading("redo") ? "Redoing..." : "Redo"}
                                    </button>
                                    <button
                                        type="button"
                                        className={`button-secondary ${(foundationSaving || isActionLoading("save-now")) ? "is-loading" : ""}`}
                                        onClick={() => runWithActionLoading("save-now", saveNow)}
                                        disabled={
                                            foundationSaving
                                            || isActionLoading("save-now")
                                            || isActionLoading("convert-html-blocks")
                                            || isActionLoading("load-template-html")
                                        }
                                    >
                                        {(foundationSaving || isActionLoading("save-now")) ? "Saving..." : "Save now"}
                                    </button>
                                    <button
                                        type="button"
                                        className={`button-secondary ${isActionLoading("convert-html-blocks") ? "is-loading" : ""}`}
                                        onClick={() => runWithActionLoading("convert-html-blocks", convertHtmlToBlocks)}
                                        disabled={foundationSaving || isActionLoading("convert-html-blocks")}
                                    >
                                        {isActionLoading("convert-html-blocks") ? "Converting..." : "Convert HTML to editable blocks"}
                                    </button>
                                </div>
                            </div>
                            <h4>Personalization fields</h4>
                            <div className="grid three">
                                <input placeholder="Member Name sample" value={personalization.memberName} onChange={(event) => updatePersonalizationField("memberName", event.target.value)} />
                                <input placeholder="Bonvoy Tier sample" value={personalization.bonvoyTier} onChange={(event) => updatePersonalizationField("bonvoyTier", event.target.value)} />
                                <input placeholder="Points Balance sample" value={personalization.pointsBalance} onChange={(event) => updatePersonalizationField("pointsBalance", event.target.value)} />
                            </div>
                            <p className="muted">Available tokens: {PERSONALIZATION_TOKENS.map((item) => item.token).join(" | ")}</p>
                            {!!tokenValidationIssues.length && (
                                <div className="card">
                                    <p className="msg error">{tokenValidationIssues.join(" ")}</p>
                                </div>
                            )}
                            <div className="card">
                                <div className="builder-qa-header">
                                    <h4>Step 2 QA guardrails</h4>
                                    <div className="builder-qa-pills">
                                        <span className={`pill ${qaErrorCount ? "todo" : "done"}`}>
                                            {qaErrorCount ? `${qaErrorCount} ERROR` : "NO BLOCKING ERRORS"}
                                        </span>
                                        <span className="pill in-progress">{qaIssues.length} TOTAL CHECKS</span>
                                    </div>
                                </div>
                                <div className="history-list mt-2">
                                    {qaIssues.length === 0 && (
                                        <p className="muted">No QA issues detected.</p>
                                    )}
                                    {qaIssues.map((issue) => (
                                        <article className="history-item" key={issue.id}>
                                            <div className="row-between">
                                                <strong>{issue.message}</strong>
                                                <div className="flex items-center gap-2">
                                                    <span className={`pill ${issue.level === "error" ? "todo" : "in-progress"}`}>
                                                        {String(issue.level || "info").toUpperCase()}
                                                    </span>
                                                    {issue.blockId && (
                                                        <button
                                                            type="button"
                                                            className="button-secondary"
                                                            onClick={() => setFocusBlockId(issue.blockId)}
                                                        >
                                                            Jump to block
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                            <div className="card">
                                <div className="row-between">
                                    <div>
                                        <h4>Canvas (sections)</h4>
                                        <p className="muted">Temporarily hidden while we validate click-to-edit workflow.</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="button-secondary"
                                        onClick={() => setShowCanvasSections((current) => !current)}
                                    >
                                        {showCanvasSections ? "Hide canvas" : "Show canvas"}
                                    </button>
                                </div>
                            </div>
                            {showCanvasSections ? (
                                (builderModel?.layout || builderDraft?.layoutJson?.layout) ? (
                                    <div>
                                        <Step2Canvas
                                            model={builderModel || builderDraft?.layoutJson}
                                            onChange={handleBuilderModelChange}
                                            disabled={foundationSaving}
                                            onStatusMessage={setStepStatus}
                                            onErrorMessage={setError}
                                            tokenOptions={PERSONALIZATION_TOKENS}
                                            validationIssues={qaIssues}
                                            focusBlockId={focusBlockId}
                                        />
                                    </div>
                                ) : (
                                    <p className="muted">Load Template HTML, then click Convert HTML to editable blocks to initialize drag-drop Step 2 canvas.</p>
                                )
                            ) : null}
                            <details className="builder-quick-fill">
                                <summary>Advanced: foundation JSON and HTML source</summary>
                                <div className="card mt-3">
                                    <div className="row-between">
                                        <div>
                                            <h4>Step 2 foundation JSON (DB)</h4>
                                            <p className="muted">
                                                Strict schema with locked header/footer. This is now persisted in PostgreSQL.
                                            </p>
                                        </div>
                                        <span className={`pill ${builderDraft?.id ? "done" : "todo"}`}>
                                            {builderDraft?.id ? "READY" : "TODO"}
                                        </span>
                                    </div>
                                    <div className="grid two mt-2">
                                        <p className="muted">Draft ID: <strong>{builderDraft?.id || "-"}</strong></p>
                                        <p className="muted">DB versions: <strong>{builderVersions.length || 0}</strong></p>
                                    </div>
                                    <textarea
                                        readOnly
                                        value={foundationLayoutPreview || "Convert HTML to editable blocks first to generate Step 2 foundation JSON."}
                                        style={{ minHeight: 220 }}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className={`button-secondary ${(foundationSaving || isActionLoading("save-foundation")) ? "is-loading" : ""}`}
                                            onClick={() => runWithActionLoading("save-foundation", saveNow)}
                                            disabled={foundationSaving || isActionLoading("save-foundation")}
                                        >
                                            {(foundationSaving || isActionLoading("save-foundation")) ? "Saving..." : "Save foundation JSON to DB"}
                                        </button>
                                        <button
                                            type="button"
                                            className={`button-secondary ${isActionLoading("refresh-db") ? "is-loading" : ""}`}
                                            onClick={() => runWithActionLoading("refresh-db", () => builderDraft?.id && loadBuilderDraftById(builderDraft.id))}
                                            disabled={!builderDraft?.id || foundationSaving || isActionLoading("refresh-db")}
                                        >
                                            {isActionLoading("refresh-db") ? "Refreshing..." : "Refresh from DB"}
                                        </button>
                                    </div>
                                </div>
                                <label htmlFor="html-source" className="mt-3">HTML source</label>
                                <textarea id="html-source" value={draft.htmlSource} onChange={(event) => updateDraftField("htmlSource", event.target.value)} />
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className={`button-secondary ${isActionLoading("insert-tokens") ? "is-loading" : ""}`}
                                        onClick={() => runWithActionLoading("insert-tokens", async () => insertPersonalizationTokens())}
                                        disabled={isActionLoading("insert-tokens")}
                                    >
                                        {isActionLoading("insert-tokens") ? "Inserting..." : "Insert personalization tokens"}
                                    </button>
                                </div>
                            </details>
                        </div>
                    </section>

                    <section className="card builder-preview-sticky-panel">
                        <h3>Live preview</h3>
                        <p className="muted">Preview updates live while you edit the canvas.</p>
                        <div className="builder-preview-toolbar">
                            <div className="builder-preview-group">
                                <span className="builder-preview-group-label">Source</span>
                                <button type="button" className={`button-secondary ${previewMode === "working" ? "active" : ""}`} onClick={() => setPreviewMode("working")}>Working draft</button>
                                <button type="button" className={`button-secondary ${previewMode === "latest" ? "active" : ""}`} onClick={() => setPreviewMode("latest")} disabled={!latestDraftVersion}>Latest saved version</button>
                            </div>
                            <div className="builder-preview-group">
                                <span className="builder-preview-group-label">Device</span>
                                <div className="builder-device-switch" role="tablist" aria-label="Preview device">
                                    {Object.entries(PREVIEW_DEVICES).map(([key, config]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            role="tab"
                                            aria-selected={previewDevice === key}
                                            className={previewDevice === key ? "active" : ""}
                                            onClick={() => setPreviewDevice(key)}
                                        >
                                            {config.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="builder-preview-group builder-preview-personalization">
                                <span className="builder-preview-group-label">Personalization</span>
                                <label className="inline-check">
                                    <input type="checkbox" checked={showSamplePersonalization} onChange={(event) => setShowSamplePersonalization(event.target.checked)} />
                                    <span className="inline-check-box" aria-hidden="true"><svg className="inline-check-icon" viewBox="0 0 20 20" fill="none"><path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                                    <span className="inline-check-text">Show sample personalization in preview</span>
                                </label>
                            </div>
                        </div>
                        <div className="builder-preview-edit-layout">
                            <div className="builder-preview-shell builder-preview-shell-split">
                                <div
                                    className="builder-preview-canvas"
                                    style={previewDevice === "desktop" ? undefined : { maxWidth: PREVIEW_DEVICES[previewDevice].width }}
                                >
                                    <iframe
                                        ref={previewFrameRef}
                                        title="preview"
                                        className="preview-frame"
                                        srcDoc={previewFrameHtml}
                                        onLoad={() => {
                                            window.requestAnimationFrame(() => {
                                                restorePreviewScrollPosition();
                                            });
                                            setPreviewFrameNonce((value) => value + 1);
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="builder-quick-edit-panel builder-quick-edit-panel-split">
                                <div className="row-between">
                                    <h4>Click-to-edit (pilot)</h4>
                                    <span className={`pill ${quickEditModeEnabled ? "done" : "todo"}`}>
                                        {quickEditModeEnabled ? "Working draft editable" : "Read-only preview"}
                                    </span>
                                </div>
                                <p className="muted">Right-click (or click) text, link, or image in preview. The editable fields appear below.</p>
                                {!quickEditModeEnabled && (
                                    <p className="muted">
                                        Switch Source to <strong>Working draft</strong> to enable editing.
                                    </p>
                                )}
                                {quickEditModeEnabled && !quickEditSelectedEntry && (
                                    <p className="muted">No element selected yet.</p>
                                )}
                                {quickEditModeEnabled && quickEditSelectedEntry && (
                                    <div className="builder-settings-form">
                                        <p className="muted">
                                            Selected: <strong>{String(quickEditSelectedEntry.kind || "").toUpperCase()}</strong> ({quickEditSelectedEntry.tag})
                                        </p>
                                        {quickEditSelectedEntry.kind === "text" && (
                                            <div>
                                                <label className="builder-settings-label">Text editor</label>
                                                <div className="builder-richtext-quill">
                                                    <ReactQuill
                                                        key={quickEditSelectedEntry.id}
                                                        theme="snow"
                                                        value={String(quickEditForm.textHtml || "")}
                                                        modules={QUICK_TEXT_EDITOR_MODULES}
                                                        formats={QUICK_TEXT_EDITOR_FORMATS}
                                                        onChange={(value, _delta, _source, editor) => {
                                                            const nextText = collapseTextValue(editor.getText ? editor.getText() : "");
                                                            setQuickEditForm((current) => ({
                                                                ...current,
                                                                textHtml: String(value || ""),
                                                                text: nextText
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {quickEditSelectedEntry.kind === "link" && (
                                            <>
                                            <div>
                                                <label className="builder-settings-label" htmlFor="quick-edit-link-label">Link label</label>
                                                <input
                                                    id="quick-edit-link-label"
                                                    value={quickEditForm.label}
                                                    onChange={(event) => setQuickEditForm((current) => ({ ...current, label: event.target.value }))}
                                                />
                                                <p className="muted mt-2">Note: template CSS may display this text in uppercase.</p>
                                            </div>
                                                <div>
                                                    <label className="builder-settings-label" htmlFor="quick-edit-link-href">Link URL</label>
                                                    <input
                                                        id="quick-edit-link-href"
                                                        value={quickEditForm.href}
                                                        onChange={(event) => setQuickEditForm((current) => ({ ...current, href: event.target.value }))}
                                                        placeholder="https://example.com"
                                                    />
                                                </div>
                                            </>
                                        )}
                                        {quickEditSelectedEntry.kind === "image" && (
                                            <>
                                                <div>
                                                    <label className="builder-settings-label" htmlFor="quick-edit-image-src">Image URL</label>
                                                    <input
                                                        id="quick-edit-image-src"
                                                        value={quickEditForm.src}
                                                        onChange={(event) => setQuickEditForm((current) => ({ ...current, src: event.target.value }))}
                                                        placeholder="https://..."
                                                    />
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        className="button-secondary"
                                                        onClick={() => setShowQuickEditMediaPicker(true)}
                                                    >
                                                        Choose from Media / Upload new
                                                    </button>
                                                </div>
                                                <div>
                                                    <label className="builder-settings-label" htmlFor="quick-edit-image-alt">Alt text</label>
                                                    <input
                                                        id="quick-edit-image-alt"
                                                        value={quickEditForm.alt}
                                                        onChange={(event) => setQuickEditForm((current) => ({ ...current, alt: event.target.value }))}
                                                    />
                                                </div>
                                            </>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className={`button-primary ${isActionLoading("quick-edit-apply") ? "is-loading" : ""}`}
                                                onClick={() => runWithActionLoading("quick-edit-apply", async () => applyQuickEditSelection())}
                                                disabled={isActionLoading("quick-edit-apply")}
                                            >
                                                {isActionLoading("quick-edit-apply") ? "Applying..." : "Apply changes"}
                                            </button>
                                            <button
                                                type="button"
                                                className="button-secondary"
                                                onClick={() => setQuickEditSelectionId("")}
                                            >
                                                Clear selection
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                    <MediaPickerModal
                        open={showQuickEditMediaPicker}
                        onClose={() => setShowQuickEditMediaPicker(false)}
                        onSelect={applyQuickEditMediaSelection}
                        title="Select image for quick edit"
                        canUpload
                    />
                        </>
                    )}

                    {activeTab === "versions" && (
                    <section className="card builder-versions-tab">
                        <h3>Draft version history</h3>
                        <div className="card builder-versions-compare">
                            <h4>Compare and restore</h4>
                            <div className="grid two mt-3">
                                <div>
                                    <label htmlFor="compare-base-version">Base version</label>
                                    <SearchSelect
                                        id="compare-base-version"
                                        value={compareBaseVersionKey}
                                        onChange={setCompareBaseVersionKey}
                                        options={proofVersionSelectOptions}
                                        placeholder="Select base version"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="compare-target-version">Compare target</label>
                                    <SearchSelect
                                        id="compare-target-version"
                                        value={compareTargetVersionKey}
                                        onChange={setCompareTargetVersionKey}
                                        options={proofVersionSelectOptions}
                                        placeholder="Select compare target"
                                    />
                                </div>
                            </div>
                            {compareStats && (
                                <div className="grid three mt-3">
                                    <p className="muted">HTML length: <strong>{compareStats.baseLen}</strong> {"->"} <strong>{compareStats.targetLen}</strong></p>
                                    <p className="muted">Delta: <strong>{compareStats.delta >= 0 ? `+${compareStats.delta}` : compareStats.delta}</strong></p>
                                    <p className="muted">Similarity (quick estimate): <strong>{compareStats.similarity}%</strong></p>
                                    <p className="muted">Subject changed: <strong>{String(compareBaseVersion?.subject || "") === String(compareTargetVersion?.subject || "") ? "No" : "Yes"}</strong></p>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-3">
                                <button
                                    type="button"
                                    className={`button-secondary ${isActionLoading("load-compare-target") ? "is-loading" : ""}`}
                                    onClick={() => runWithActionLoading("load-compare-target", async () => compareTargetVersion && loadVersion(compareTargetVersion))}
                                    disabled={!compareTargetVersion || isActionLoading("load-compare-target")}
                                >
                                    {isActionLoading("load-compare-target") ? "Loading..." : "Load compare target to editor"}
                                </button>
                                <button
                                    type="button"
                                    className={`button-primary ${restoringVersion ? "is-loading" : ""}`}
                                    onClick={restoreCompareTarget}
                                    disabled={!compareTargetVersion || restoringVersion}
                                >
                                    {restoringVersion ? "Restoring..." : "Restore compare target"}
                                </button>
                            </div>
                        </div>
                        <div className="history-list builder-versions-history">
                            {combinedVersionHistory.length === 0 && campaignVersionTimeline.length === 0 && <p className="muted">No saved versions yet.</p>}
                            {combinedVersionHistory.map((version, index) => (
                                <article className="history-item" key={version.id || index}>
                                    <div className="row-between">
                                        <strong>{version.versionLabel || version.subject || version.campaignName || "Untitled version"}</strong>
                                        <div className="flex items-center gap-2">
                                            <span className={`pill ${version.source === "db" ? "done" : "todo"}`}>{version.source === "db" ? "DB" : "LOCAL"}</span>
                                            <button
                                                type="button"
                                                className={`button-secondary ${isActionLoading(`use-version-${version.id || index}`) ? "is-loading" : ""}`}
                                                onClick={() => runWithActionLoading(`use-version-${version.id || index}`, async () => loadVersion(version))}
                                                disabled={isActionLoading(`use-version-${version.id || index}`)}
                                            >
                                                {isActionLoading(`use-version-${version.id || index}`) ? "Loading..." : "Use"}
                                            </button>
                                            <button
                                                type="button"
                                                className={`button-secondary ${isActionLoading(`delete-version-${version.source}-${version.id || index}`) ? "is-loading" : ""}`}
                                                onClick={() => runWithActionLoading(`delete-version-${version.source}-${version.id || index}`, async () => deleteDraftVersion(version))}
                                                disabled={isActionLoading(`delete-version-${version.source}-${version.id || index}`)}
                                            >
                                                {isActionLoading(`delete-version-${version.source}-${version.id || index}`) ? "Deleting..." : "Delete"}
                                            </button>
                                        </div>
                                    </div>
                                    <p className="muted">{new Date(version.createdAt).toLocaleString("en-GB")}</p>
                                </article>
                            ))}
                            {campaignVersionTimeline.map((version) => (
                                <article className="history-item" key={`campaign-${version.id}`}>
                                    <div className="row-between">
                                        <strong>Campaign version {version.versionNumber || "-"}</strong>
                                        <div className="flex items-center gap-2">
                                            <span className="pill done">DB</span>
                                            <button
                                                type="button"
                                                className={`button-secondary ${isActionLoading(`use-campaign-version-${version.id}`) ? "is-loading" : ""}`}
                                                onClick={() => runWithActionLoading(`use-campaign-version-${version.id}`, async () => loadVersion({
                                                    id: version.id,
                                                    campaignName: campaignContext?.name || draft.campaignName,
                                                    subject: version.subject || draft.subject,
                                                    preheader: version.preheader || draft.preheader,
                                                    html: version.htmlContent || "",
                                                    layoutJson: version.layoutJson || null
                                                }))}
                                                disabled={isActionLoading(`use-campaign-version-${version.id}`)}
                                            >
                                                {isActionLoading(`use-campaign-version-${version.id}`) ? "Loading..." : "Use"}
                                            </button>
                                            <button
                                                type="button"
                                                className={`button-secondary ${isActionLoading(`delete-campaign-version-${version.id}`) ? "is-loading" : ""}`}
                                                onClick={() => runWithActionLoading(`delete-campaign-version-${version.id}`, async () => deleteCampaignVersion(version))}
                                                disabled={isActionLoading(`delete-campaign-version-${version.id}`)}
                                            >
                                                {isActionLoading(`delete-campaign-version-${version.id}`) ? "Deleting..." : "Delete"}
                                            </button>
                                        </div>
                                    </div>
                                    <p className="muted">{new Date(version.createdAt).toLocaleString("en-GB")}</p>
                                    <p className="muted">Notes: {version.changeNote || "-"}</p>
                                </article>
                            ))}
                        </div>
                    </section>
                    )}

                    {activeTab === "proof" && (
                        <>
                    <section className="card builder-proof-tab">
                        <h3>Step 3 - Proof send</h3>
                        <p className="muted mt-1">Current iteration: {roundCount} / 10 expected</p>
                        <div className="mt-3">
                            <label htmlFor="proof-version-select">Send from version</label>
                            <SearchSelect
                                id="proof-version-select"
                                value={selectedProofVersionKey}
                                onChange={setSelectedProofVersionKey}
                                options={proofVersionSelectOptions}
                                placeholder="Select version for proof send"
                            />
                            <p className="muted mt-2">
                                Selected: <strong>{selectedProofVersion?.label || "Working draft"}</strong>
                                {selectedProofVersion?.campaignVersionId ? ` (Campaign v${selectedProofVersion.versionNumber || "-"})` : ""}
                            </p>
                        </div>
                        <div className="grid two mt-3">
                            <textarea placeholder="Recipients: a@domain.com, b@domain.com" value={draft.recipients} onChange={(event) => setDraft({ ...draft, recipients: event.target.value })} />
                            <input placeholder="From email (optional)" value={draft.fromEmail} onChange={(event) => setDraft({ ...draft, fromEmail: event.target.value })} />
                        </div>
                        <button type="button" className={`button-primary mt-3 ${proofSending ? "is-loading" : ""}`} onClick={sendProof} disabled={proofSending || !selectedProofVersion || qaErrorCount > 0}>
                            {proofSending ? "Sending..." : "Send proof from selected version"}
                        </button>
                        {qaErrorCount > 0 && <p className="msg error mt-2">Fix blocking Step 2 QA errors before sending proof.</p>}
                    </section>

                    <section className="card builder-proof-history-card">
                        <h3>Proof history</h3>
                        <div className="history-list builder-proof-history">
                            {proofLogs.length === 0 && campaignProofTimeline.length === 0 && <p className="muted">No proof history yet.</p>}
                            {proofLogs.map((log, index) => (
                                <article className="history-item" key={`${log.timestamp}-${index}`}>
                                    <div className="row-between"><strong>{log.subject || "No subject"}</strong><span className={`pill ${log.ok ? "done" : "todo"}`}>{log.ok ? "sent" : "failed"}</span></div>
                                    <p className="muted">{new Date(log.timestamp).toLocaleString("en-GB")}</p>
                                    <p className="muted">Recipients: {escapeHtml((log.recipients || []).join(", "))}</p>
                                    {log.selectedVersionLabel && <p className="muted">Version: {log.selectedVersionLabel}</p>}
                                    {log.campaignVersionNumber ? <p className="muted">Campaign version: v{log.campaignVersionNumber}</p> : null}
                                    {log.messageId && <p className="muted">Message ID: {log.messageId}</p>}
                                    {log.error && <p className="msg error">{log.error}</p>}
                                </article>
                            ))}
                            {campaignProofTimeline.map((log) => (
                                <article className="history-item" key={`db-${log.id}`}>
                                    <div className="row-between">
                                        <strong>{log.subject || "No subject"}</strong>
                                        <span className={`pill ${String(log.status || "").toUpperCase() === "SENT" ? "done" : "todo"}`}>
                                            {String(log.status || "UNKNOWN").toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="muted">{new Date(log.createdAt).toLocaleString("en-GB")}</p>
                                    <p className="muted">Iteration: {log.iterationNo || "-"}</p>
                                    {log?.campaignVersion?.versionNumber ? <p className="muted">Campaign version: v{log.campaignVersion.versionNumber}</p> : null}
                                    <p className="muted">Recipients: {Array.isArray(log.recipients) ? log.recipients.join(", ") : "-"}</p>
                                </article>
                            ))}
                        </div>
                    </section>
                        </>
                    )}

                    {activeTab === "approval" && (
                        <section className="card">
                            <h3>Approval</h3>
                            <p className="muted">Step 4-5 controls will live here: mark final, lock edits, and trigger final approval notification.</p>
                            <div className="chip-wrap">
                                <span className="pill in-progress">In Progress</span>
                                <span className="pill todo">Mark final flow pending</span>
                                <span className="pill todo">Final notification pending</span>
                            </div>
                        </section>
                    )}

                    {activeTab === "history" && (
                        <section className="card">
                            <h3>History</h3>
                            <div className="history-list">
                                {campaignActivityTimeline.length === 0 && <p className="muted">No activity log yet.</p>}
                                {campaignActivityTimeline.map((item) => (
                                    <article className="history-item" key={item.id}>
                                        <div className="row-between">
                                            <strong>{item.type || "EVENT"}</strong>
                                            <span className="pill todo">{new Date(item.createdAt).toLocaleString("en-GB")}</span>
                                        </div>
                                        <p className="muted">{item.message || "-"}</p>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}



