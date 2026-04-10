import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../api";
import CodeMirror from "@uiw/react-codemirror";
import { html as htmlLang } from "@codemirror/lang-html";
import MediaPickerModal from "../MediaPickerModal";

const BLOCK_LIBRARY = [
    { type: "text", label: "Text", description: "Headline, paragraph, and tokenized copy blocks." },
    { type: "image", label: "Image", description: "Upload or reference image URLs with alt text." },
    { type: "button", label: "Button", description: "Call-to-action button with link and styling." },
    { type: "spacer", label: "Spacer", description: "Vertical spacing between content sections." },
    { type: "divider", label: "Divider", description: "Horizontal separator line." },
    { type: "html", label: "HTML", description: "Raw custom HTML block (advanced)." }
];

const ALIGN_OPTIONS = ["left", "center", "right"];
const HTML_EDITOR_EXTENSIONS = [htmlLang()];

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function cloneJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return null;
    }
}

function createBlock(type) {
    const t = String(type || "").toLowerCase();
    if (t === "text") return { id: uid("text"), type: "text", locked: false, props: { text: "Edit text...", align: "left", color: "#111827", fontSize: 16 } };
    if (t === "image") return { id: uid("image"), type: "image", locked: false, props: { src: "", alt: "Campaign image", width: 600, align: "center", href: "" } };
    if (t === "button") return { id: uid("button"), type: "button", locked: false, props: { label: "View", href: "", align: "left", bgColor: "#111827", textColor: "#ffffff", radius: 4 } };
    if (t === "spacer") return { id: uid("spacer"), type: "spacer", locked: false, props: { height: 20 } };
    if (t === "divider") return { id: uid("divider"), type: "divider", locked: false, props: { color: "#e5e7eb", thickness: 1 } };
    return { id: uid("html"), type: "html", locked: false, props: { html: "" } };
}

function createSection(name = "") {
    return {
        id: uid("section"),
        type: "section",
        locked: false,
        props: {
            name: name || "New section",
            bgColor: "#ffffff",
            paddingTop: 16,
            paddingBottom: 16,
            blocks: []
        }
    };
}

function normalizeLeafBlock(raw) {
    const type = String(raw?.type || "").toLowerCase();
    if (!type || type === "section") return null;
    const normalizedProps = { ...(raw?.props || {}) };
    if (type === "image" && !String(normalizedProps.alt || "").trim()) {
        normalizedProps.alt = "Campaign image";
    }
    return {
        id: String(raw?.id || uid(type)),
        type,
        locked: false,
        props: normalizedProps
    };
}

function normalizeSections(bodyBlocks) {
    const list = Array.isArray(bodyBlocks) ? bodyBlocks : [];
    const hasSections = list.some((item) => String(item?.type || "").toLowerCase() === "section");

    if (hasSections) {
        const sections = list
            .filter((item) => String(item?.type || "").toLowerCase() === "section")
            .map((section, index) => ({
                id: String(section?.id || uid("section")),
                type: "section",
                locked: false,
                props: {
                    name: String(section?.props?.name || `Section ${index + 1}`),
                    bgColor: String(section?.props?.bgColor || "#ffffff"),
                    paddingTop: Number(section?.props?.paddingTop ?? 16),
                    paddingBottom: Number(section?.props?.paddingBottom ?? 16),
                    blocks: (Array.isArray(section?.props?.blocks) ? section.props.blocks : []).map(normalizeLeafBlock).filter(Boolean)
                }
            }));
        return sections.length ? sections : [createSection("Section 1")];
    }

    return [{
        ...createSection("Section 1"),
        props: {
            name: "Section 1",
            bgColor: "#ffffff",
            paddingTop: 16,
            paddingBottom: 16,
            blocks: list.map(normalizeLeafBlock).filter(Boolean)
        }
    }];
}

function normalizeHeaderFooterBlocks(raw) {
    if (!raw) return [];
    const list = Array.isArray(raw?.props?.blocks) ? raw.props.blocks : null;
    if (Array.isArray(list) && list.length > 0) return list.map(normalizeLeafBlock).filter(Boolean);
    const html = String(raw?.props?.html || "").trim();
    if (html && html !== "<!-- Locked Header -->" && html !== "<!-- Locked Footer -->") {
        return [{ id: uid("html"), type: "html", locked: false, props: { html } }];
    }
    return [];
}

const HEADER_KEY = "__header__";
const FOOTER_KEY = "__footer__";
const HTML_TEXT_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,span,td,th,div";
const HTML_LINK_SELECTOR = "a[href]";
const HTML_IMAGE_SELECTOR = "img[src]";

function cleanInlineText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function parseHtmlForEditor(html) {
    const raw = String(html || "");
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");
    const hasDocumentTag = /<html[\s>]/i.test(raw);
    const hasDoctype = /<!doctype/i.test(raw);
    return { raw, doc, hasDocumentTag, hasDoctype };
}

function isEditableNode(node) {
    if (!node) return false;
    if (node.closest("script,style,head,meta,link,title,noscript")) return false;
    return true;
}

function listTextNodes(doc) {
    return Array.from(doc.querySelectorAll(HTML_TEXT_SELECTOR))
        .filter((node) => isEditableNode(node))
        .filter((node) => {
            const hasMedia = Boolean(node.querySelector("img,video,svg,table,form,button,input,textarea,select"));
            if (hasMedia) return false;
            const directText = cleanInlineText(
                Array.from(node.childNodes || [])
                    .filter((child) => child.nodeType === 3)
                    .map((child) => child.textContent || "")
                    .join(" ")
            );
            return Boolean(directText);
        });
}

function listLinkNodes(doc) {
    return Array.from(doc.querySelectorAll(HTML_LINK_SELECTOR))
        .filter((node) => isEditableNode(node));
}

function listImageNodes(doc) {
    return Array.from(doc.querySelectorAll(HTML_IMAGE_SELECTOR))
        .filter((node) => isEditableNode(node));
}

function listHeadingNodes(doc) {
    return Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .filter((node) => isEditableNode(node));
}

function listParagraphNodes(doc) {
    return Array.from(doc.querySelectorAll("p"))
        .filter((node) => isEditableNode(node));
}

function listSubtitleNodes(doc) {
    return Array.from(doc.querySelectorAll("em,i"))
        .filter((node) => isEditableNode(node))
        .filter((node) => cleanInlineText(node.textContent || "").length > 0);
}

function serializeEditedHtml(doc, { raw, hasDocumentTag, hasDoctype }) {
    if (hasDocumentTag && doc?.documentElement) {
        const serialized = doc.documentElement.outerHTML;
        return hasDoctype ? `<!DOCTYPE html>\n${serialized}` : serialized;
    }
    return doc?.body?.innerHTML ?? raw;
}

function extractQuickHtmlFields(html) {
    const parsed = parseHtmlForEditor(html);
    const textNodes = listTextNodes(parsed.doc).slice(0, 60);
    const linkNodes = listLinkNodes(parsed.doc).slice(0, 60);
    const imageNodes = listImageNodes(parsed.doc).slice(0, 60);

    return {
        textFields: textNodes.map((node, index) => ({
            index,
            tag: String(node.tagName || "TEXT").toUpperCase(),
            value: cleanInlineText(
                Array.from(node.childNodes || [])
                    .filter((child) => child.nodeType === 3)
                    .map((child) => child.textContent || "")
                    .join(" ")
            )
        })),
        linkFields: linkNodes.map((node, index) => ({
            index,
            label: cleanInlineText(node.textContent || "") || `Link ${index + 1}`,
            href: String(node.getAttribute("href") || "")
        })),
        imageFields: imageNodes.map((node, index) => ({
            index,
            src: String(node.getAttribute("src") || ""),
            alt: String(node.getAttribute("alt") || "")
        }))
    };
}

function extractSmartHtmlModule(html) {
    const parsed = parseHtmlForEditor(html);
    const headings = listHeadingNodes(parsed.doc);
    const subtitles = listSubtitleNodes(parsed.doc);
    const paragraphs = listParagraphNodes(parsed.doc);
    const links = listLinkNodes(parsed.doc);
    const images = listImageNodes(parsed.doc);

    const headingText = (index) => cleanInlineText(headings[index]?.textContent || "");
    const paragraphText = (index) => cleanInlineText(paragraphs[index]?.textContent || "");
    const subtitleText = (index) => cleanInlineText(subtitles[index]?.textContent || "");
    const linkLabel = (index) => cleanInlineText(links[index]?.textContent || "") || `Link ${index + 1}`;
    const linkHref = (index) => String(links[index]?.getAttribute("href") || "");
    const imageSrc = (index) => String(images[index]?.getAttribute("src") || "");

    const isThreeCol = images.length >= 3 && links.length >= 3 && paragraphs.length >= 3 && headings.length >= 4;
    if (isThreeCol) {
        const hasSubtitleNode = subtitleText(0).length > 0;
        const headingOffset = hasSubtitleNode ? 1 : 2;
        const topSubtitle = hasSubtitleNode ? subtitleText(0) : headingText(1);
        return {
            type: "three_col",
            title: { kind: "heading", index: 0, value: headingText(0) },
            subtitle: topSubtitle
                ? { kind: hasSubtitleNode ? "subtitle" : "heading", index: hasSubtitleNode ? 0 : 1, value: topSubtitle }
                : null,
            columns: [0, 1, 2].map((idx) => ({
                index: idx,
                title: { kind: "heading", index: idx + headingOffset, value: headingText(idx + headingOffset) },
                body: { kind: "paragraph", index: idx, value: paragraphText(idx) },
                button: { kind: "link", index: idx, label: linkLabel(idx), href: linkHref(idx) },
                image: { kind: "image", index: idx, src: imageSrc(idx) }
            }))
        };
    }

    const isImageText = images.length >= 1 && headings.length >= 1 && paragraphs.length >= 1 && links.length >= 1;
    if (isImageText) {
        return {
            type: "image_text",
            image: { kind: "image", index: 0, src: imageSrc(0) },
            title: { kind: "heading", index: 0, value: headingText(0) },
            body: { kind: "paragraph", index: 0, value: paragraphText(0) },
            button: { kind: "link", index: 0, label: linkLabel(0), href: linkHref(0) }
        };
    }

    const isHero = headings.length >= 1 && paragraphs.length >= 1 && links.length >= 1;
    if (isHero) {
        const hasSubtitleNode = subtitleText(0).length > 0;
        const fallbackSubtitle = headingText(1);
        return {
            type: "hero",
            title: { kind: "heading", index: 0, value: headingText(0) },
            subtitle: hasSubtitleNode
                ? { kind: "subtitle", index: 0, value: subtitleText(0) }
                : (fallbackSubtitle ? { kind: "heading", index: 1, value: fallbackSubtitle } : null),
            body: { kind: "paragraph", index: 0, value: paragraphText(0) },
            button: { kind: "link", index: 0, label: linkLabel(0), href: linkHref(0) }
        };
    }

    return null;
}

function updateHtmlQuickField(html, kind, index, payload = {}) {
    const parsed = parseHtmlForEditor(html);
    if (kind === "heading") {
        const target = listHeadingNodes(parsed.doc)[Number(index)];
        if (!target) return String(html || "");
        target.textContent = String(payload.value ?? "");
        return serializeEditedHtml(parsed.doc, parsed);
    }
    if (kind === "paragraph") {
        const target = listParagraphNodes(parsed.doc)[Number(index)];
        if (!target) return String(html || "");
        target.textContent = String(payload.value ?? "");
        return serializeEditedHtml(parsed.doc, parsed);
    }
    if (kind === "subtitle") {
        const target = listSubtitleNodes(parsed.doc)[Number(index)];
        if (!target) return String(html || "");
        target.textContent = String(payload.value ?? "");
        return serializeEditedHtml(parsed.doc, parsed);
    }
    if (kind === "text") {
        const target = listTextNodes(parsed.doc)[Number(index)];
        if (!target) return String(html || "");
        const nextText = String(payload.value ?? "");
        Array.from(target.childNodes || [])
            .filter((child) => child.nodeType === 3)
            .forEach((child) => child.remove());
        target.prepend(parsed.doc.createTextNode(nextText));
        return serializeEditedHtml(parsed.doc, parsed);
    }
    if (kind === "link") {
        const target = listLinkNodes(parsed.doc)[Number(index)];
        if (!target) return String(html || "");
        if (payload.href !== undefined) {
            target.setAttribute("href", String(payload.href || ""));
        }
        if (payload.label !== undefined) {
            target.textContent = String(payload.label || "");
        }
        return serializeEditedHtml(parsed.doc, parsed);
    }
    if (kind === "image") {
        const target = listImageNodes(parsed.doc)[Number(index)];
        if (!target) return String(html || "");
        if (payload.src !== undefined) {
            target.setAttribute("src", String(payload.src || ""));
        }
        if (payload.alt !== undefined) {
            target.setAttribute("alt", String(payload.alt || ""));
        }
        return serializeEditedHtml(parsed.doc, parsed);
    }
    return String(html || "");
}

function blockTitle(block) {
    const type = String(block?.type || "").toLowerCase();
    if (!type) return "Block";
    return `${type.charAt(0).toUpperCase()}${type.slice(1)} Block`;
}

function SettingLabel({ children }) {
    return <label className="builder-settings-label">{children}</label>;
}

export default function Step2Canvas({
    model,
    onChange,
    disabled = false,
    onStatusMessage,
    onErrorMessage,
    tokenOptions = [],
    validationIssues = [],
    focusBlockId = ""
}) {
    const [selectedSurface, setSelectedSurface] = useState("section");
    const [selectedSectionId, setSelectedSectionId] = useState("");
    const [selectedBlockId, setSelectedBlockId] = useState("");
    const [librarySearch, setLibrarySearch] = useState("");
    const [armedBlockType, setArmedBlockType] = useState("");
    const [tokenTargetField, setTokenTargetField] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadInputKey, setUploadInputKey] = useState(0);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const fileInputRef = useRef(null);
    const migrationDoneRef = useRef(false);

    const sections = useMemo(() => normalizeSections(model?.layout?.bodyBlocks), [model?.layout?.bodyBlocks]);
    const headerBlocks = useMemo(() => normalizeHeaderFooterBlocks(model?.layout?.header), [model?.layout?.header]);
    const footerBlocks = useMemo(() => normalizeHeaderFooterBlocks(model?.layout?.footer), [model?.layout?.footer]);
    const selectedSection = useMemo(() => sections.find((item) => item.id === selectedSectionId) || sections[0] || null, [sections, selectedSectionId]);
    const activeSurfaceKey = useMemo(() => {
        if (selectedSurface === "header") return HEADER_KEY;
        if (selectedSurface === "footer") return FOOTER_KEY;
        return selectedSection?.id || "";
    }, [selectedSurface, selectedSection]);
    const selectedBlock = useMemo(() => {
        if (selectedSurface === "header" || activeSurfaceKey === HEADER_KEY) {
            return headerBlocks.find((item) => item.id === selectedBlockId) || null;
        }
        if (selectedSurface === "footer" || activeSurfaceKey === FOOTER_KEY) {
            return footerBlocks.find((item) => item.id === selectedBlockId) || null;
        }
        return selectedSection?.props?.blocks?.find((item) => item.id === selectedBlockId) || null;
    }, [selectedSurface, activeSurfaceKey, selectedSection, selectedBlockId, headerBlocks, footerBlocks]);

    const filteredLibrary = useMemo(() => {
        const q = String(librarySearch || "").trim().toLowerCase();
        if (!q) return BLOCK_LIBRARY;
        return BLOCK_LIBRARY.filter((item) => (`${item.label} ${item.description} ${item.type}`).toLowerCase().includes(q));
    }, [librarySearch]);

    const issueCountsByBlock = useMemo(() => {
        const map = new Map();
        (Array.isArray(validationIssues) ? validationIssues : []).forEach((issue) => {
            const id = String(issue?.blockId || "");
            if (!id) return;
            map.set(id, Number(map.get(id) || 0) + 1);
        });
        return map;
    }, [validationIssues]);

    const tokenTargetOptions = useMemo(() => {
        if (!selectedBlock) return [];
        if (selectedBlock.type === "text") return [{ value: "text", label: "Text content" }];
        if (selectedBlock.type === "button") return [{ value: "label", label: "Button label" }, { value: "href", label: "Button URL" }];
        if (selectedBlock.type === "image") return [{ value: "alt", label: "Image alt text" }, { value: "href", label: "Image link URL" }];
        if (selectedBlock.type === "html") return [{ value: "html", label: "HTML content" }];
        return [];
    }, [selectedBlock]);

    const htmlQuickFields = useMemo(() => {
        if (!selectedBlock || selectedBlock.type !== "html") return null;
        return extractQuickHtmlFields(String(selectedBlock.props?.html || ""));
    }, [selectedBlock?.id, selectedBlock?.type, selectedBlock?.props?.html]);

    const htmlSmartModule = useMemo(() => {
        if (!selectedBlock || selectedBlock.type !== "html") return null;
        return extractSmartHtmlModule(String(selectedBlock.props?.html || ""));
    }, [selectedBlock?.id, selectedBlock?.type, selectedBlock?.props?.html]);
    const isStructuredEditorMode = useMemo(() => {
        const mode = String(model?.metadata?.editorMode || "").trim().toLowerCase();
        return mode === "structured_blocks";
    }, [model?.metadata?.editorMode]);

    useEffect(() => {
        if (!selectedSection && sections.length) {
            setSelectedSectionId(sections[0].id);
            setSelectedSurface("section");
            setSelectedBlockId("");
        }
    }, [sections, selectedSection]);

    useEffect(() => {
        if (!tokenTargetOptions.length) setTokenTargetField("");
        else if (!tokenTargetOptions.some((x) => x.value === tokenTargetField)) setTokenTargetField(tokenTargetOptions[0].value);
    }, [tokenTargetField, tokenTargetOptions]);

    useEffect(() => {
        if (!focusBlockId) return;
        const target = String(focusBlockId).trim();
        if (!target) return;
        for (const section of sections) {
            const match = (section.props?.blocks || []).find((b) => String(b.id) === target);
            if (match) {
                setSelectedSectionId(section.id);
                setSelectedBlockId(match.id);
                setSelectedSurface("block");
                break;
            }
        }
    }, [focusBlockId, sections]);

    useEffect(() => {
        if (!showMediaPicker) return;
        if (!selectedBlock || selectedBlock.type !== "image") {
            setShowMediaPicker(false);
        }
    }, [showMediaPicker, selectedBlock]);

    useEffect(() => {
        if (!model?.layout || migrationDoneRef.current) return;
        const raw = Array.isArray(model.layout.bodyBlocks) ? model.layout.bodyBlocks : [];
        const hasSection = raw.some((item) => String(item?.type || "").toLowerCase() === "section");
        if (hasSection) return;
        migrationDoneRef.current = true;
        const next = cloneJson(model);
        if (!next?.layout) return;
        next.layout.bodyBlocks = normalizeSections(raw);
        onChange?.(next);
        onStatusMessage?.("Canvas migrated to section-based layout.");
    }, [model, onChange, onStatusMessage]);

    function updateModel(mutator) {
        if (!model?.layout) return;
        const next = cloneJson(model);
        if (!next?.layout) return;
        mutator(next);
        onChange?.(next);
    }

    function updateSections(updater) {
        updateModel((next) => {
            next.layout.bodyBlocks = updater(normalizeSections(next.layout.bodyBlocks));
        });
    }

    function updateHeaderFooter(which, html) {
        updateModel((next) => {
            next.layout[which].props = { ...(next.layout?.[which]?.props || {}), html };
        });
    }

    function updateSurfaceBlocks(targetKey, updater) {
        if (targetKey === HEADER_KEY || targetKey === FOOTER_KEY) {
            const slot = targetKey === HEADER_KEY ? "header" : "footer";
            updateModel((next) => {
                const existing = next.layout?.[slot] || { id: `locked-${slot}`, type: slot };
                const currentBlocks = normalizeHeaderFooterBlocks(existing);
                const nextBlocks = updater(currentBlocks);
                const firstHtmlBlock = nextBlocks.find((block) => String(block?.type || "").toLowerCase() === "html");
                const syncedHtml = String(firstHtmlBlock?.props?.html || "").trim();
                next.layout[slot] = {
                    ...existing,
                    id: existing.id || `locked-${slot}`,
                    type: slot,
                    lockedPosition: true,
                    locked: true,
                    props: {
                        ...(existing.props || {}),
                        editable: true,
                        blocks: nextBlocks,
                        ...(syncedHtml ? { html: syncedHtml } : {})
                    }
                };
            });
            return;
        }
        updateSections((current) => current.map((section) => {
            if (section.id !== targetKey) return section;
            const nextBlocks = updater(Array.isArray(section.props?.blocks) ? section.props.blocks : []);
            return { ...section, props: { ...(section.props || {}), blocks: nextBlocks } };
        }));
    }

    function addSection() {
        const section = createSection(`Section ${sections.length + 1}`);
        updateSections((current) => [...current, section]);
        setSelectedSectionId(section.id);
        setSelectedSurface("section");
    }

    function addBlockToSection(targetKey, type, atEnd = true, index = 0) {
        const block = createBlock(type);
        updateSurfaceBlocks(targetKey, (blocks) => {
            const next = [...blocks];
            const safeIndex = atEnd ? next.length : Math.max(0, Math.min(index, next.length));
            next.splice(safeIndex, 0, block);
            return next;
        });
        if (targetKey === HEADER_KEY) {
            setSelectedSurface("header");
            setSelectedSectionId("");
        } else if (targetKey === FOOTER_KEY) {
            setSelectedSurface("footer");
            setSelectedSectionId("");
        } else {
            setSelectedSectionId(targetKey);
            setSelectedSurface("block");
        }
        setSelectedBlockId(block.id);
        setArmedBlockType("");
    }

    function moveSection(sectionId, direction) {
        updateSections((current) => {
            const fromIndex = current.findIndex((item) => item.id === sectionId);
            if (fromIndex < 0) return current;
            const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
            if (toIndex < 0 || toIndex >= current.length) return current;
            const next = [...current];
            const [item] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, item);
            return next;
        });
    }

    function duplicateSection(sectionId) {
        let duplicatedId = "";
        updateSections((current) => {
            const fromIndex = current.findIndex((item) => item.id === sectionId);
            if (fromIndex < 0) return current;
            const source = current[fromIndex];
            const duplicated = cloneJson(source);
            duplicated.id = uid("section");
            duplicated.props = {
                ...(duplicated.props || {}),
                name: `${String(source?.props?.name || "Section")} (Copy)`,
                blocks: (Array.isArray(duplicated?.props?.blocks) ? duplicated.props.blocks : []).map((block) => ({
                    ...(block || {}),
                    id: uid(String(block?.type || "block"))
                }))
            };
            duplicatedId = duplicated.id;
            const next = [...current];
            next.splice(fromIndex + 1, 0, duplicated);
            return next;
        });
        if (duplicatedId) {
            setSelectedSectionId(duplicatedId);
            setSelectedSurface("section");
            setSelectedBlockId("");
        }
    }

    function deleteSection(sectionId) {
        if (sections.length <= 1) {
            onErrorMessage?.("At least one section is required.");
            return;
        }
        if (!window.confirm("Delete this section and all its blocks?")) return;
        let fallbackId = "";
        updateSections((current) => {
            const index = current.findIndex((item) => item.id === sectionId);
            if (index < 0) return current;
            const next = current.filter((item) => item.id !== sectionId);
            fallbackId = next[Math.max(0, index - 1)]?.id || next[0]?.id || "";
            return next;
        });
        setSelectedSectionId(fallbackId);
        setSelectedSurface("section");
        setSelectedBlockId("");
    }

    function updateSelectedBlock(partial) {
        if (!selectedBlock) return;
        const target = activeSurfaceKey;
        if (!target) return;
        updateSurfaceBlocks(target, (blocks) => blocks.map((block) => (
            block.id === selectedBlock.id
                ? { ...block, props: { ...(block.props || {}), ...partial } }
                : block
        )));
    }

    function updateSelectedHtmlQuickField(kind, index, payload) {
        if (!selectedBlock || selectedBlock.type !== "html") return;
        const currentHtml = String(selectedBlock.props?.html || "");
        const nextHtml = updateHtmlQuickField(currentHtml, kind, index, payload);
        if (nextHtml !== currentHtml) {
            updateSelectedBlock({ html: nextHtml });
        }
    }

    function moveBlock(targetKey, blockId, direction) {
        if (!targetKey || !blockId) return;
        updateSurfaceBlocks(targetKey, (blocks) => {
            const next = [...blocks];
            const fromIndex = next.findIndex((block) => block.id === blockId);
            if (fromIndex < 0) return next;
            const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
            if (toIndex < 0 || toIndex >= next.length) return next;
            const [item] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, item);
            return next;
        });
    }

    function duplicateBlock(targetKey, blockId) {
        if (!targetKey || !blockId) return;
        let duplicatedId = "";
        updateSurfaceBlocks(targetKey, (blocks) => {
            const next = [...blocks];
            const index = next.findIndex((block) => block.id === blockId);
            if (index < 0) return next;
            const source = next[index];
            const duplicated = cloneJson(source);
            duplicated.id = uid(String(source?.type || "block"));
            duplicatedId = duplicated.id;
            next.splice(index + 1, 0, duplicated);
            return next;
        });
        if (duplicatedId) {
            setSelectedBlockId(duplicatedId);
            if (targetKey === HEADER_KEY) setSelectedSurface("header");
            else if (targetKey === FOOTER_KEY) setSelectedSurface("footer");
            else setSelectedSurface("block");
        }
    }

    function deleteBlock(targetKey, blockId) {
        if (!targetKey || !blockId) return;
        if (!window.confirm("Delete selected block?")) return;
        let fallbackId = "";
        updateSurfaceBlocks(targetKey, (blocks) => {
            const next = [...blocks];
            const index = next.findIndex((block) => block.id === blockId);
            if (index < 0) return next;
            next.splice(index, 1);
            fallbackId = next[Math.max(0, index - 1)]?.id || "";
            return next;
        });
        setSelectedBlockId(fallbackId);
        if (!fallbackId && targetKey !== HEADER_KEY && targetKey !== FOOTER_KEY) {
            setSelectedSurface("section");
        }
    }

    async function uploadSelectedImage(file) {
        if (!file || selectedBlock?.type !== "image") return;
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append("file", file);
            const payload = await apiRequest("/api/assets/upload", { method: "POST", body: formData });
            updateSelectedBlock({ src: String(payload?.url || "") });
            onStatusMessage?.("Image uploaded and applied to block.");
            onErrorMessage?.("");
            setUploadInputKey((v) => v + 1);
        } catch (error) {
            onErrorMessage?.(error.message || "Image upload failed.");
        } finally {
            setUploading(false);
        }
    }

    function applyPickedMedia(item) {
        if (!item || selectedBlock?.type !== "image") return;
        updateSelectedBlock({
            src: String(item?.url || ""),
            alt: String(selectedBlock?.props?.alt || "").trim() || String(item?.altText || "")
        });
        setShowMediaPicker(false);
        onStatusMessage?.("Image selected from Media library.");
        onErrorMessage?.("");
    }

    function insertToken(token) {
        if (!selectedBlock || !tokenTargetField) return;
        const currentValue = String(selectedBlock?.props?.[tokenTargetField] || "");
        const next = `${currentValue}${currentValue && !/\s$/.test(currentValue) ? " " : ""}${token}`;
        updateSelectedBlock({ [tokenTargetField]: next });
    }

    return (
        <div className="builder-step2-layout">
            <section className="builder-step2-panel">
                <div className="row-between"><h4>Block library</h4><button type="button" className="button-secondary" onClick={addSection} disabled={disabled}>Add section</button></div>
                <p className="muted">Insert into selected section.</p>
                <input className="builder-library-search" placeholder="Search block..." value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} disabled={disabled} />
                <div className="builder-block-library">
                    {filteredLibrary.map((item) => (
                        <article key={item.type} className={`builder-library-card ${armedBlockType === item.type ? "is-active" : ""}`}>
                            <p className="builder-library-card-title">{item.label}</p>
                            <p className="builder-library-card-desc">{item.description}</p>
                            <div className="builder-library-card-actions">
                                <button type="button" className="button-secondary" onClick={() => setArmedBlockType(item.type)} disabled={disabled}>{armedBlockType === item.type ? "Armed" : "Insert"}</button>
                                <button type="button" className="button-secondary" onClick={() => activeSurfaceKey && addBlockToSection(activeSurfaceKey, item.type, true)} disabled={disabled || !activeSurfaceKey}>Add end</button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="builder-step2-panel">
                <div className="row-between"><h4>Canvas (sections)</h4><span className="pill done">Header/Footer locked position</span></div>

                {(() => {
                    const blocks = headerBlocks;
                    const targetKey = HEADER_KEY;
                    return (
                        <article className={`builder-section-card ${selectedSurface === "header" ? "is-selected" : ""}`}>
                            <div className="row-between gap-2">
                                <div className="builder-section-title-wrap">
                                    <button type="button" className="button-secondary" onClick={() => { setSelectedSurface("header"); setSelectedSectionId(""); setSelectedBlockId(""); }} disabled={disabled}>Header</button>
                                </div>
                                <span className="pill in-progress">Locked position</span>
                            </div>
                            {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(targetKey, armedBlockType, false, 0)} disabled={disabled}>Insert {armedBlockType.toUpperCase()} at top</button>}
                            {!blocks.length && <div className="builder-canvas-empty mt-2">No blocks in header.</div>}
                            <div className="builder-canvas-list">
                                {blocks.map((block, bIndex) => (
                                    <div key={block.id}>
                                        {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(targetKey, armedBlockType, false, bIndex)} disabled={disabled}>Insert block here</button>}
                                        <div className={`builder-canvas-block ${selectedSurface === "header" && selectedBlock?.id === block.id ? "is-selected" : ""}`}>
                                            <button type="button" className="builder-canvas-main" onClick={() => { setSelectedSurface("header"); setSelectedSectionId(""); setSelectedBlockId(block.id); }} disabled={disabled}>
                                                <span className="builder-canvas-block-title">{blockTitle(block)}</span>
                                                <span className="builder-canvas-block-meta">
                                                    <span className="pill todo">{String(block.type || "").toUpperCase()}</span>
                                                    {Number(issueCountsByBlock.get(block.id) || 0) > 0 && <span className="pill issue">ISSUES {Number(issueCountsByBlock.get(block.id) || 0)}</span>}
                                                </span>
                                            </button>
                                            <div className="builder-canvas-controls">
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("header"); setSelectedBlockId(block.id); moveBlock(targetKey, block.id, "up"); }} disabled={disabled || bIndex === 0}>Up</button>
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("header"); setSelectedBlockId(block.id); moveBlock(targetKey, block.id, "down"); }} disabled={disabled || bIndex === blocks.length - 1}>Down</button>
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("header"); setSelectedBlockId(block.id); duplicateBlock(targetKey, block.id); }} disabled={disabled}>Dup</button>
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("header"); setSelectedBlockId(block.id); deleteBlock(targetKey, block.id); }} disabled={disabled}>Delete</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(targetKey, armedBlockType, true)} disabled={disabled}>Insert block at end</button>}
                            </div>
                        </article>
                    );
                })()}

                {sections.map((section, sIndex) => {
                    const blocks = section.props?.blocks || [];
                    const canMoveUp = sIndex > 0;
                    const canMoveDown = sIndex < sections.length - 1;
                    return (
                        <article key={section.id} className={`builder-section-card ${selectedSurface === "section" && selectedSection?.id === section.id ? "is-selected" : ""}`}>
                            <div className="row-between gap-2">
                                <div className="builder-section-title-wrap">
                                    <button type="button" className="button-secondary" onClick={() => { setSelectedSectionId(section.id); setSelectedSurface("section"); setSelectedBlockId(""); }} disabled={disabled}>Section {sIndex + 1}</button>
                                    <input value={String(section.props?.name || "")} onChange={(e) => updateSections((current) => current.map((item) => item.id === section.id ? { ...item, props: { ...(item.props || {}), name: e.target.value } } : item))} disabled={disabled} />
                                </div>
                                <div className="builder-canvas-controls">
                                    <button type="button" className="builder-action-btn" onClick={() => moveSection(section.id, "up")} disabled={disabled || !canMoveUp}>Up</button>
                                    <button type="button" className="builder-action-btn" onClick={() => moveSection(section.id, "down")} disabled={disabled || !canMoveDown}>Down</button>
                                    <button type="button" className="builder-action-btn" onClick={() => duplicateSection(section.id)} disabled={disabled}>Dup</button>
                                    <button type="button" className="builder-action-btn" onClick={() => deleteSection(section.id)} disabled={disabled || sections.length <= 1}>Delete</button>
                                </div>
                            </div>
                            {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(section.id, armedBlockType, false, 0)} disabled={disabled}>Insert {armedBlockType.toUpperCase()} at top</button>}
                            {!blocks.length && <div className="builder-canvas-empty mt-2">No blocks in this section.</div>}
                            <div className="builder-canvas-list">
                                {blocks.map((block, bIndex) => (
                                    <div key={block.id}>
                                        {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(section.id, armedBlockType, false, bIndex)} disabled={disabled}>Insert block here</button>}
                                        <div className={`builder-canvas-block ${selectedSurface === "block" && selectedBlock?.id === block.id ? "is-selected" : ""}`}>
                                            <button type="button" className="builder-canvas-main" onClick={() => { setSelectedSectionId(section.id); setSelectedBlockId(block.id); setSelectedSurface("block"); }} disabled={disabled}>
                                                <span className="builder-canvas-block-title">{blockTitle(block)}</span>
                                                <span className="builder-canvas-block-meta">
                                                    <span className="pill todo">{String(block.type || "").toUpperCase()}</span>
                                                    {Number(issueCountsByBlock.get(block.id) || 0) > 0 && <span className="pill issue">ISSUES {Number(issueCountsByBlock.get(block.id) || 0)}</span>}
                                                </span>
                                            </button>
                                            <div className="builder-canvas-controls">
                                                <button
                                                    type="button"
                                                    className="builder-action-btn"
                                                    onClick={() => {
                                                        setSelectedSectionId(section.id);
                                                        setSelectedBlockId(block.id);
                                                        setSelectedSurface("block");
                                                        moveBlock(section.id, block.id, "up");
                                                    }}
                                                    disabled={disabled || bIndex === 0}
                                                >
                                                    Up
                                                </button>
                                                <button
                                                    type="button"
                                                    className="builder-action-btn"
                                                    onClick={() => {
                                                        setSelectedSectionId(section.id);
                                                        setSelectedBlockId(block.id);
                                                        setSelectedSurface("block");
                                                        moveBlock(section.id, block.id, "down");
                                                    }}
                                                    disabled={disabled || bIndex === blocks.length - 1}
                                                >
                                                    Down
                                                </button>
                                                <button
                                                    type="button"
                                                    className="builder-action-btn"
                                                    onClick={() => {
                                                        setSelectedSectionId(section.id);
                                                        setSelectedBlockId(block.id);
                                                        setSelectedSurface("block");
                                                        duplicateBlock(section.id, block.id);
                                                    }}
                                                    disabled={disabled}
                                                >
                                                    Dup
                                                </button>
                                                <button
                                                    type="button"
                                                    className="builder-action-btn"
                                                    onClick={() => {
                                                        setSelectedSectionId(section.id);
                                                        setSelectedBlockId(block.id);
                                                        setSelectedSurface("block");
                                                        deleteBlock(section.id, block.id);
                                                    }}
                                                    disabled={disabled}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(section.id, armedBlockType, true)} disabled={disabled}>Insert block at end</button>}
                            </div>
                        </article>
                    );
                })}

                {(() => {
                    const blocks = footerBlocks;
                    const targetKey = FOOTER_KEY;
                    return (
                        <article className={`builder-section-card ${selectedSurface === "footer" ? "is-selected" : ""}`}>
                            <div className="row-between gap-2">
                                <div className="builder-section-title-wrap">
                                    <button type="button" className="button-secondary" onClick={() => { setSelectedSurface("footer"); setSelectedSectionId(""); setSelectedBlockId(""); }} disabled={disabled}>Footer</button>
                                </div>
                                <span className="pill in-progress">Locked position</span>
                            </div>
                            {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(targetKey, armedBlockType, false, 0)} disabled={disabled}>Insert {armedBlockType.toUpperCase()} at top</button>}
                            {!blocks.length && <div className="builder-canvas-empty mt-2">No blocks in footer.</div>}
                            <div className="builder-canvas-list">
                                {blocks.map((block, bIndex) => (
                                    <div key={block.id}>
                                        {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(targetKey, armedBlockType, false, bIndex)} disabled={disabled}>Insert block here</button>}
                                        <div className={`builder-canvas-block ${selectedSurface === "footer" && selectedBlock?.id === block.id ? "is-selected" : ""}`}>
                                            <button type="button" className="builder-canvas-main" onClick={() => { setSelectedSurface("footer"); setSelectedSectionId(""); setSelectedBlockId(block.id); }} disabled={disabled}>
                                                <span className="builder-canvas-block-title">{blockTitle(block)}</span>
                                                <span className="builder-canvas-block-meta">
                                                    <span className="pill todo">{String(block.type || "").toUpperCase()}</span>
                                                    {Number(issueCountsByBlock.get(block.id) || 0) > 0 && <span className="pill issue">ISSUES {Number(issueCountsByBlock.get(block.id) || 0)}</span>}
                                                </span>
                                            </button>
                                            <div className="builder-canvas-controls">
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("footer"); setSelectedBlockId(block.id); moveBlock(targetKey, block.id, "up"); }} disabled={disabled || bIndex === 0}>Up</button>
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("footer"); setSelectedBlockId(block.id); moveBlock(targetKey, block.id, "down"); }} disabled={disabled || bIndex === blocks.length - 1}>Down</button>
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("footer"); setSelectedBlockId(block.id); duplicateBlock(targetKey, block.id); }} disabled={disabled}>Dup</button>
                                                <button type="button" className="builder-action-btn" onClick={() => { setSelectedSurface("footer"); setSelectedBlockId(block.id); deleteBlock(targetKey, block.id); }} disabled={disabled}>Delete</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {armedBlockType && <button type="button" className="builder-drop-zone is-armed" onClick={() => addBlockToSection(targetKey, armedBlockType, true)} disabled={disabled}>Insert block at end</button>}
                            </div>
                        </article>
                    );
                })()}
            </section>

            <section className="builder-step2-panel">
                <h4>Block settings</h4>
                {(selectedSurface === "header" || selectedSurface === "footer") && !selectedBlock && (
                    <p className="muted">{selectedSurface === "header" ? "Header" : "Footer"} is locked in position. Add or select a block inside to edit.</p>
                )}
                {selectedSurface === "section" && selectedSection && (
                    <div className="builder-settings-form">
                        <SettingLabel>Section name</SettingLabel>
                        <input value={String(selectedSection.props?.name || "")} onChange={(e) => updateSections((current) => current.map((item) => item.id === selectedSection.id ? { ...item, props: { ...(item.props || {}), name: e.target.value } } : item))} disabled={disabled} />
                        <div className="builder-prop-grid">
                            <div>
                                <SettingLabel>Background color</SettingLabel>
                                <input type="color" value={String(selectedSection.props?.bgColor || "#ffffff")} onChange={(e) => updateSections((current) => current.map((item) => item.id === selectedSection.id ? { ...item, props: { ...(item.props || {}), bgColor: e.target.value } } : item))} disabled={disabled} />
                            </div>
                            <div>
                                <SettingLabel>Top padding</SettingLabel>
                                <input type="number" min={0} max={80} value={String(selectedSection.props?.paddingTop ?? 16)} onChange={(e) => updateSections((current) => current.map((item) => item.id === selectedSection.id ? { ...item, props: { ...(item.props || {}), paddingTop: Number(e.target.value || 0) } } : item))} disabled={disabled} />
                            </div>
                            <div>
                                <SettingLabel>Bottom padding</SettingLabel>
                                <input type="number" min={0} max={80} value={String(selectedSection.props?.paddingBottom ?? 16)} onChange={(e) => updateSections((current) => current.map((item) => item.id === selectedSection.id ? { ...item, props: { ...(item.props || {}), paddingBottom: Number(e.target.value || 0) } } : item))} disabled={disabled} />
                            </div>
                        </div>
                    </div>
                )}

                {(selectedSurface === "block" || selectedSurface === "header" || selectedSurface === "footer") && selectedBlock && (
                    <div className="builder-settings-form">
                        <p className="muted">{blockTitle(selectedBlock)}</p>
                        {!!tokenTargetOptions.length && !!tokenOptions.length && (
                            <div className="card">
                                <p className="muted">Token picker</p>
                                <SettingLabel>Insert token into</SettingLabel>
                                <select value={tokenTargetField} onChange={(e) => setTokenTargetField(e.target.value)} disabled={disabled}>
                                    {tokenTargetOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                </select>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {tokenOptions.map((item) => <button key={item.token} type="button" className="button-secondary" onClick={() => insertToken(item.token)} disabled={disabled}>{item.label}</button>)}
                                </div>
                            </div>
                        )}

                        {selectedBlock.type === "text" && (
                            <>
                                <SettingLabel>Text content</SettingLabel>
                                <textarea value={String(selectedBlock.props?.text || "")} onChange={(e) => updateSelectedBlock({ text: e.target.value })} style={{ minHeight: 140 }} disabled={disabled} />
                                <div className="builder-prop-grid">
                                    <div>
                                        <SettingLabel>Alignment</SettingLabel>
                                        <select value={String(selectedBlock.props?.align || "left")} onChange={(e) => updateSelectedBlock({ align: e.target.value })} disabled={disabled}>{ALIGN_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                                    </div>
                                    <div>
                                        <SettingLabel>Text color</SettingLabel>
                                        <input type="color" value={String(selectedBlock.props?.color || "#111827")} onChange={(e) => updateSelectedBlock({ color: e.target.value })} disabled={disabled} />
                                    </div>
                                    <div>
                                        <SettingLabel>Font size</SettingLabel>
                                        <input type="number" min={12} max={48} value={String(selectedBlock.props?.fontSize || 16)} onChange={(e) => updateSelectedBlock({ fontSize: Number(e.target.value || 16) })} disabled={disabled} />
                                    </div>
                                </div>
                            </>
                        )}

                        {selectedBlock.type === "image" && (
                            <>
                                <div className="builder-image-preview-card">
                                    {String(selectedBlock.props?.src || "").trim() ? <img src={String(selectedBlock.props?.src || "")} alt={String(selectedBlock.props?.alt || "")} className="builder-image-preview" /> : <div className="builder-image-preview-empty">No image selected</div>}
                                </div>
                                <SettingLabel>Image URL</SettingLabel>
                                <input placeholder="Image URL" value={String(selectedBlock.props?.src || "")} onChange={(e) => updateSelectedBlock({ src: e.target.value })} disabled={disabled} />
                                <SettingLabel>Link URL (optional)</SettingLabel>
                                <input placeholder="Link URL" value={String(selectedBlock.props?.href || "")} onChange={(e) => updateSelectedBlock({ href: e.target.value })} disabled={disabled} />
                                <SettingLabel>Alt text</SettingLabel>
                                <input placeholder="Alt text" value={String(selectedBlock.props?.alt || "")} onChange={(e) => updateSelectedBlock({ alt: e.target.value })} disabled={disabled} />
                                <div className="builder-prop-grid">
                                    <div>
                                        <SettingLabel>Alignment</SettingLabel>
                                        <select value={String(selectedBlock.props?.align || "center")} onChange={(e) => updateSelectedBlock({ align: e.target.value })} disabled={disabled}>{ALIGN_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                                    </div>
                                    <div>
                                        <SettingLabel>Max width</SettingLabel>
                                        <input type="number" min={120} max={1200} value={String(selectedBlock.props?.width || 600)} onChange={(e) => updateSelectedBlock({ width: Number(e.target.value || 600) })} disabled={disabled} />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input key={uploadInputKey} ref={fileInputRef} type="file" accept="image/*" onChange={(e) => uploadSelectedImage(e.target.files?.[0])} disabled={disabled || uploading} style={{ display: "none" }} />
                                    <button type="button" className="button-secondary" onClick={() => fileInputRef.current?.click()} disabled={disabled || uploading}>{uploading ? "Uploading..." : "Upload image"}</button>
                                    <button type="button" className="button-secondary" onClick={() => setShowMediaPicker(true)} disabled={disabled}>
                                        Choose from Media
                                    </button>
                                </div>
                            </>
                        )}

                        {selectedBlock.type === "button" && (
                            <>
                                <SettingLabel>Button label</SettingLabel>
                                <input placeholder="Button label" value={String(selectedBlock.props?.label || "")} onChange={(e) => updateSelectedBlock({ label: e.target.value })} disabled={disabled} />
                                <SettingLabel>Button link</SettingLabel>
                                <input placeholder="Button link" value={String(selectedBlock.props?.href || "")} onChange={(e) => updateSelectedBlock({ href: e.target.value })} disabled={disabled} />
                            </>
                        )}

                        {selectedBlock.type === "spacer" && (
                            <>
                                <SettingLabel>Spacer height</SettingLabel>
                                <input type="number" min={4} max={400} value={String(selectedBlock.props?.height || 20)} onChange={(e) => updateSelectedBlock({ height: Number(e.target.value || 20) })} disabled={disabled} />
                            </>
                        )}
                        {selectedBlock.type === "divider" && (
                            <div className="builder-prop-grid">
                                <div>
                                    <SettingLabel>Divider color</SettingLabel>
                                    <input type="color" value={String(selectedBlock.props?.color || "#e5e7eb")} onChange={(e) => updateSelectedBlock({ color: e.target.value })} disabled={disabled} />
                                </div>
                                <div>
                                    <SettingLabel>Divider thickness</SettingLabel>
                                    <input type="number" min={1} max={12} value={String(selectedBlock.props?.thickness || 1)} onChange={(e) => updateSelectedBlock({ thickness: Number(e.target.value || 1) })} disabled={disabled} />
                                </div>
                            </div>
                        )}
                        {selectedBlock.type === "html" && (
                            <>
                                <p className="muted">HTML block customization</p>
                                <SettingLabel>HTML content</SettingLabel>
                                <div className="builder-code-editor-wrap">
                                    <CodeMirror
                                        value={String(selectedBlock.props?.html || "")}
                                        extensions={HTML_EDITOR_EXTENSIONS}
                                        basicSetup={{
                                            lineNumbers: true,
                                            foldGutter: true,
                                            highlightActiveLine: true,
                                            autocompletion: true
                                        }}
                                        editable={!disabled}
                                        onChange={(value) => updateSelectedBlock({ html: value })}
                                        height="320px"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {!selectedBlock && selectedSurface === "block" && <p className="muted">Select a block to edit.</p>}
            </section>
            <MediaPickerModal
                open={showMediaPicker}
                onClose={() => setShowMediaPicker(false)}
                onSelect={applyPickedMedia}
                title="Select image for block"
                canUpload={!disabled}
            />
        </div>
    );
}
