const https = require("https");

const PROVIDER = (process.env.PROOF_EMAIL_PROVIDER || "resend").toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const DEFAULT_FROM_EMAIL = process.env.PROOF_FROM_EMAIL || "";

function sendViaResend({ from, to, subject, html, text }) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            from,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            ...(text ? { text } : {})
        });

        const request = https.request({
            hostname: "api.resend.com",
            path: "/emails",
            method: "POST",
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            },
            timeout: 12000
        }, (response) => {
            let body = "";
            response.on("data", (chunk) => { body += chunk; });
            response.on("end", () => {
                let parsed = {};
                try {
                    parsed = body ? JSON.parse(body) : {};
                } catch (_error) {
                    parsed = { raw: body };
                }

                if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve({
                        ok: true,
                        provider: "resend",
                        messageId: parsed.id || "",
                        raw: parsed
                    });
                    return;
                }

                resolve({
                    ok: false,
                    provider: "resend",
                    error: parsed.message || parsed.error || `Resend API error (${response.statusCode})`,
                    raw: parsed
                });
            });
        });

        request.on("timeout", () => {
            request.destroy();
            reject(new Error("Email provider request timed out."));
        });

        request.on("error", reject);
        request.write(payload);
        request.end();
    });
}

async function sendEmail({ to, subject, html, text, fromEmail }) {
    const from = String(fromEmail || DEFAULT_FROM_EMAIL).trim();
    if (!from) throw new Error("Missing PROOF_FROM_EMAIL configuration.");
    if (!to || (Array.isArray(to) && to.length === 0)) throw new Error("Recipient is required.");
    if (!subject) throw new Error("Email subject is required.");
    if (!html && !text) throw new Error("Email body is required.");

    if (PROVIDER === "resend") {
        if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY configuration.");
        const result = await sendViaResend({ from, to, subject, html, text });
        if (!result.ok) throw new Error(result.error || "Email provider send failed.");
        return result;
    }

    throw new Error(`Unsupported PROOF_EMAIL_PROVIDER: ${PROVIDER}`);
}

module.exports = {
    sendEmail
};
