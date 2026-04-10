const https = require("https");
const { jsonResponse, parseBody, requireAuth } = require("./_auth");

const PROVIDER = (process.env.PROOF_EMAIL_PROVIDER || "resend").toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const DEFAULT_FROM_EMAIL = process.env.PROOF_FROM_EMAIL || "";
const MAX_RECIPIENTS = 10;

function toRecipients(value) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || "").trim()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,\n;]+/)
        .map((v) => v.trim())
        .filter(Boolean);
}

function validateRecipients(recipients) {
    if (!recipients.length) return "At least one recipient email is required.";
    if (recipients.length > MAX_RECIPIENTS) return `Maximum ${MAX_RECIPIENTS} recipients per proof send.`;
    const bad = recipients.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (bad) return `Invalid email address: ${bad}`;
    return "";
}

function sendViaResend({ from, to, subject, html, text }) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            from,
            to,
            subject,
            html,
            ...(text ? { text } : {})
        });

        const req = https.request({
            hostname: "api.resend.com",
            path: "/emails",
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            },
            timeout: 12000
        }, (res) => {
            let body = "";
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                let parsed = {};
                try { parsed = body ? JSON.parse(body) : {}; } catch (e) { parsed = { raw: body }; }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        ok: true,
                        provider: "resend",
                        messageId: parsed.id || "",
                        raw: parsed
                    });
                } else {
                    resolve({
                        ok: false,
                        provider: "resend",
                        error: parsed.message || parsed.error || `Resend API error (${res.statusCode})`,
                        raw: parsed
                    });
                }
            });
        });

        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Proof send request timed out."));
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
}

exports.handler = async function (event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, { ok: true });
    }

    if (event.httpMethod !== "POST") {
        return jsonResponse(405, { error: "Method not allowed. Use POST." });
    }

    const auth = await requireAuth(event, "proof:send");
    if (auth.error) return auth.error;

    const body = parseBody(event);
    const recipients = toRecipients(body.recipients);
    const recipientError = validateRecipients(recipients);
    if (recipientError) return jsonResponse(400, { error: recipientError });

    const subject = String(body.subject || "").trim();
    const html = String(body.html || "").trim();
    const text = String(body.text || "").trim();
    const from = String(body.fromEmail || DEFAULT_FROM_EMAIL).trim();

    if (!subject) return jsonResponse(400, { error: "Subject is required." });
    if (!html) return jsonResponse(400, { error: "HTML content is required." });
    if (!from) return jsonResponse(500, { error: "Missing PROOF_FROM_EMAIL configuration." });

    try {
        if (PROVIDER === "resend") {
            if (!RESEND_API_KEY) {
                return jsonResponse(500, { error: "Missing RESEND_API_KEY configuration." });
            }
            const result = await sendViaResend({ from, to: recipients, subject, html, text });
            if (!result.ok) return jsonResponse(502, result);
            return jsonResponse(200, result);
        }

        return jsonResponse(500, { error: `Unsupported PROOF_EMAIL_PROVIDER: ${PROVIDER}` });
    } catch (error) {
        return jsonResponse(500, { error: error.message || "Proof send failed." });
    }
};
