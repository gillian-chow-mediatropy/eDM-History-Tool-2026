const PERSONALIZATION_TOKENS = [
    { key: "member_name", label: "Member Name", token: "{{member_name}}" },
    { key: "bonvoy_tier", label: "Bonvoy Tier Level", token: "{{bonvoy_tier}}" },
    { key: "points_balance", label: "Points Balance", token: "{{points_balance}}" }
];

const ALLOWED_BLOCK_TYPES = new Set([
    "section",
    "text",
    "image",
    "button",
    "spacer",
    "divider",
    "html"
]);

const LOCKED_HEADER_ID = "locked-header";
const LOCKED_FOOTER_ID = "locked-footer";

function asString(value) {
    return String(value || "").trim();
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

function sanitizeColor(value, fallback = "#111827") {
    const raw = asString(value);
    if (!raw) return fallback;
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return raw;
    if (/^rgba?\([\d\s.,%]+\)$/i.test(raw)) return raw;
    return fallback;
}

function sanitizeUrl(value, { allowDataImage = false } = {}) {
    const raw = asString(value);
    if (!raw) return "";
    if (/^\{\{.+\}\}$/.test(raw)) return raw;
    if (raw.startsWith("#")) return raw;
    if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return raw;
    if (/^(mailto:|tel:)/i.test(raw)) return raw;
    if (allowDataImage && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
    if (/^\s*javascript:/i.test(raw)) return "#";

    try {
        const parsed = new URL(raw);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return raw;
        return "#";
    } catch (_error) {
        return raw;
    }
}

function sanitizeHtmlFragment(html) {
    let output = String(html || "");
    output = output.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "");
    output = output.replace(/<\s*(iframe|object|embed|applet|form|input|button|textarea|select)\b[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    output = output.replace(/<\s*(iframe|object|embed|applet|form|input|button|textarea|select)\b[^>]*\/?>/gi, "");
    output = output.replace(/\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)/gi, "");
    output = output.replace(/\sstyle\s*=\s*(\"[^\"]*expression\s*\([^\"]*\"|'[^']*expression\s*\([^']*'|[^\s>]*expression\s*\([^\s>]*)/gi, "");

    output = output.replace(
        /\s(href|src)\s*=\s*(\"([^\"]*)\"|'([^']*)'|([^\s>]+))/gi,
        (_match, attr, _quoted, doubleQuoted, singleQuoted, unquoted) => {
            const raw = String(doubleQuoted || singleQuoted || unquoted || "");
            const safe = sanitizeUrl(raw, { allowDataImage: String(attr).toLowerCase() === "src" });
            return ` ${String(attr).toLowerCase()}="${escapeHtml(safe)}"`;
        }
    );

    return output;
}

function sanitizeHtmlDocument(html) {
    const cleaned = sanitizeHtmlFragment(html);
    if (/<html[\s>]/i.test(cleaned) && /<body[\s>]/i.test(cleaned)) {
        return cleaned;
    }

    return [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "<meta charset=\"utf-8\" />",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
        "</head>",
        "<body>",
        cleaned,
        "</body>",
        "</html>"
    ].join("\n");
}

function generateBlockId(type, index) {
    return `${type}-${Date.now()}-${index}`;
}

function createLockedHeader() {
    return {
        id: LOCKED_HEADER_ID,
        type: "header",
        locked: true,
        props: {
            html: "<!-- Locked Header -->",
            editable: true
        }
    };
}

function createLockedFooter() {
    return {
        id: LOCKED_FOOTER_ID,
        type: "footer",
        locked: true,
        props: {
            html: "<!-- Locked Footer -->",
            editable: true
        }
    };
}

function createInitialBuilderModel({
    template,
    sourceCampaign,
    campaignName,
    subject,
    preheader,
    htmlSource
}) {
    const now = new Date().toISOString();
    const safeCampaignName = asString(campaignName) || asString(sourceCampaign?.name) || "";
    const safeSubject = asString(subject) || safeCampaignName;
    const safePreheader = asString(preheader);
    const starterHtml = String(htmlSource || "");

    return {
        schemaVersion: 1,
        metadata: {
            createdAt: now,
            templateMasterId: template?.id || "",
            templateCode: template?.code || null,
            templateName: template?.name || "",
            sourceCampaignMasterId: sourceCampaign?.id || null,
            sourceCampaignName: sourceCampaign?.name || "",
            sourceRequestId: sourceCampaign?.requestId || "",
            campaignName: safeCampaignName,
            subject: safeSubject,
            preheader: safePreheader
        },
        personalization: {
            tokens: PERSONALIZATION_TOKENS,
            samples: {
                member_name: "Alex Johnson",
                bonvoy_tier: "Gold Elite",
                points_balance: "128,500"
            }
        },
        layout: {
            header: createLockedHeader(),
            bodyBlocks: [
                {
                    id: generateBlockId("section", 1),
                    type: "section",
                    locked: false,
                    props: {
                        name: "Section 1",
                        bgColor: "#ffffff",
                        paddingTop: 16,
                        paddingBottom: 16,
                        blocks: [
                            {
                                id: generateBlockId("html", 2),
                                type: "html",
                                locked: false,
                                props: {
                                    html: starterHtml
                                }
                            }
                        ]
                    }
                }
            ],
            footer: createLockedFooter()
        }
    };
}

function validateBuilderModel(model) {
    if (!model || typeof model !== "object") {
        return "Layout JSON must be an object.";
    }

    if (Number(model.schemaVersion) !== 1) {
        return "Unsupported schemaVersion. Expected 1.";
    }

    if (!model.layout || typeof model.layout !== "object") {
        return "layout is required.";
    }

    const { header, footer, bodyBlocks } = model.layout;
    if (!header || header.type !== "header" || header.locked !== true) {
        return "Locked header block is required and cannot be changed.";
    }
    if (!footer || footer.type !== "footer" || footer.locked !== true) {
        return "Locked footer block is required and cannot be changed.";
    }
    if (header.id !== LOCKED_HEADER_ID || footer.id !== LOCKED_FOOTER_ID) {
        return "Locked header/footer IDs are invalid.";
    }
    if (!Array.isArray(bodyBlocks)) {
        return "layout.bodyBlocks must be an array.";
    }
    if (bodyBlocks.length > 200) {
        return "Too many blocks. Max 200.";
    }

    const seenIds = new Set();
    function validateLeafBlock(block, pathPrefix = "") {
        if (!block || typeof block !== "object") {
            return `${pathPrefix}Invalid block item.`;
        }
        const id = asString(block.id);
        const type = asString(block.type).toLowerCase();
        if (!id) return `${pathPrefix}Each block must have an id.`;
        if (!ALLOWED_BLOCK_TYPES.has(type) || type === "section") {
            return `${pathPrefix}Unsupported block type: ${block.type}`;
        }
        if (seenIds.has(id)) return `${pathPrefix}Duplicate block id: ${id}`;
        seenIds.add(id);

        const props = block.props && typeof block.props === "object" ? block.props : {};
        if (type === "image") {
            const src = asString(props.src);
            const alt = asString(props.alt);
            if (!src) return `${pathPrefix}Image block "${id}" is missing src URL.`;
            if (!alt) return `${pathPrefix}Image block "${id}" requires alt text.`;
        }
        return "";
    }

    for (const block of bodyBlocks) {
        if (!block || typeof block !== "object") {
            return "Invalid block item in bodyBlocks.";
        }
        const id = asString(block.id);
        const type = asString(block.type).toLowerCase();
        if (!id) return "Each block must have an id.";
        if (!ALLOWED_BLOCK_TYPES.has(type)) {
            return `Unsupported block type: ${block.type}`;
        }

        if (type === "section") {
            if (seenIds.has(id)) return `Duplicate block id: ${id}`;
            seenIds.add(id);
            const props = block.props && typeof block.props === "object" ? block.props : {};
            const sectionBlocks = Array.isArray(props.blocks) ? props.blocks : [];
            if (sectionBlocks.length > 100) return `Section "${id}" has too many child blocks (max 100).`;
            for (const childBlock of sectionBlocks) {
                const childError = validateLeafBlock(childBlock, `Section "${id}": `);
                if (childError) return childError;
            }
            continue;
        }

        const leafError = validateLeafBlock(block);
        if (leafError) return leafError;
    }

    return "";
}

function renderLeafBlock(block) {
    const type = asString(block?.type).toLowerCase();
    const props = block?.props || {};

    if (type === "html") {
        return sanitizeHtmlFragment(props.html || "");
    }

    if (type === "text") {
        const text = escapeHtml(props.text || "").replace(/\n/g, "<br/>");
        const align = ["left", "center", "right"].includes(String(props.align || "").toLowerCase())
            ? String(props.align).toLowerCase()
            : "left";
        const color = sanitizeColor(props.color, "#111827");
        const fontSize = Math.max(12, Math.min(48, Number(props.fontSize || 16)));
        const lineHeight = Math.round(fontSize * 1.5);
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${align}" style="padding: 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: ${fontSize}px; line-height: ${lineHeight}px; color: ${color};">${text}</td></tr></table>`;
    }

    if (type === "image") {
        const src = escapeHtml(sanitizeUrl(props.src || "", { allowDataImage: true }));
        const alt = escapeHtml(props.alt || "");
        const width = Number(props.width || 600);
        const align = ["left", "center", "right"].includes(String(props.align || "").toLowerCase())
            ? String(props.align).toLowerCase()
            : "center";
        const href = sanitizeUrl(props.href || "");
        const imageTag = `<img src="${src}" alt="${alt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;" />`;
        const content = href ? `<a href="${escapeHtml(href)}" style="text-decoration:none;">${imageTag}</a>` : imageTag;
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding: 12px 0;" align="${align}">${content}</td></tr></table>`;
    }

    if (type === "button") {
        const label = escapeHtml(props.label || "View");
        const href = escapeHtml(sanitizeUrl(props.href || "#"));
        const align = ["left", "center", "right"].includes(String(props.align || "").toLowerCase())
            ? String(props.align).toLowerCase()
            : "left";
        const bgColor = sanitizeColor(props.bgColor, "#111827");
        const textColor = sanitizeColor(props.textColor, "#ffffff");
        const radius = Math.max(0, Math.min(40, Number(props.radius || 4)));
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${align}" style="padding: 8px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bgColor}" style="border-radius:${radius}px;"><a href="${href}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${textColor};text-decoration:none;">${label}</a></td></tr></table></td></tr></table>`;
    }

    if (type === "spacer") {
        const height = Math.max(4, Number(props.height || 16));
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="line-height:${height}px;font-size:${height}px;">&nbsp;</td></tr></table>`;
    }

    if (type === "divider") {
        const color = sanitizeColor(props.color, "#e5e7eb");
        const thickness = Math.max(1, Math.min(12, Number(props.thickness || 1)));
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 0;border-top:${thickness}px solid ${color};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
    }

    return "";
}

function renderBlock(block) {
    const type = asString(block?.type).toLowerCase();
    if (type !== "section") return renderLeafBlock(block);

    const props = block?.props || {};
    const bgColor = sanitizeColor(props.bgColor, "#ffffff");
    const paddingTop = Math.max(0, Math.min(80, Number(props.paddingTop ?? 16)));
    const paddingBottom = Math.max(0, Math.min(80, Number(props.paddingBottom ?? 16)));
    const sectionBlocks = Array.isArray(props.blocks) ? props.blocks : [];
    const renderedChildren = sectionBlocks.map((child) => renderLeafBlock(child)).join("\n");

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${bgColor};padding:${paddingTop}px 0 ${paddingBottom}px 0;">${renderedChildren}</td></tr></table>`;
}

function renderHtmlFromModel(model) {
    const validationError = validateBuilderModel(model);
    if (validationError) throw new Error(validationError);

    const bodyBlocks = model.layout.bodyBlocks || [];
    let singleHtmlBlock = "";
    if (bodyBlocks.length === 1 && asString(bodyBlocks[0]?.type).toLowerCase() === "html") {
        singleHtmlBlock = String(bodyBlocks[0]?.props?.html || "");
    } else if (bodyBlocks.length === 1 && asString(bodyBlocks[0]?.type).toLowerCase() === "section") {
        const sectionBlocks = Array.isArray(bodyBlocks[0]?.props?.blocks) ? bodyBlocks[0].props.blocks : [];
        if (sectionBlocks.length === 1 && asString(sectionBlocks[0]?.type).toLowerCase() === "html") {
            singleHtmlBlock = String(sectionBlocks[0]?.props?.html || "");
        }
    }

    if (singleHtmlBlock && /<html[\s>]/i.test(singleHtmlBlock)) {
        return sanitizeHtmlDocument(singleHtmlBlock);
    }

    const preheader = escapeHtml(String(model?.metadata?.preheader || ""));
    const headerHtml = sanitizeHtmlFragment(String(model.layout.header?.props?.html || ""));
    const footerHtml = sanitizeHtmlFragment(String(model.layout.footer?.props?.html || ""));
    const renderedBlocks = bodyBlocks.map(renderBlock).join("\n");

    return [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "<meta charset=\"utf-8\" />",
        "<meta http-equiv=\"x-ua-compatible\" content=\"ie=edge\" />",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
        "<!--[if mso]>",
        "<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>",
        "<![endif]-->",
        "<style>",
        "body,table,td,p,a{font-family:Arial,Helvetica,sans-serif;}",
        "table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}",
        "img{-ms-interpolation-mode:bicubic;}",
        "a{text-decoration:none;}",
        "@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-pad{padding:16px!important}}",
        "</style>",
        "</head>",
        "<body style=\"margin:0;padding:0;background:#f5f7fa;\">",
        preheader
            ? `<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</div>`
            : "",
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#f5f7fa;\">",
        "<tr><td align=\"center\" style=\"padding:20px;\">",
        "<!--[if mso]><table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td><![endif]-->",
        "<table role=\"presentation\" class=\"email-shell\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:100%;background:#ffffff;\">",
        `<tr><td class=\"email-pad\">${headerHtml}</td></tr>`,
        `<tr><td class=\"email-pad\" style=\"padding:24px;\">${renderedBlocks}</td></tr>`,
        `<tr><td class=\"email-pad\">${footerHtml}</td></tr>`,
        "</table>",
        "<!--[if mso]></td></tr></table><![endif]-->",
        "</td></tr>",
        "</table>",
        "</body>",
        "</html>"
    ].join("\n");
}

module.exports = {
    LOCKED_FOOTER_ID,
    LOCKED_HEADER_ID,
    PERSONALIZATION_TOKENS,
    createInitialBuilderModel,
    renderHtmlFromModel,
    sanitizeHtmlDocument,
    sanitizeHtmlFragment,
    validateBuilderModel
};
