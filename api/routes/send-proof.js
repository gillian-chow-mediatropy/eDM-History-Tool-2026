const express = require("express");
const { requireAuth } = require("../lib/auth");
const { sendEmail } = require("../lib/mailer");

const router = express.Router();

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

router.post("/", requireAuth("proof:send"), async (req, res) => {
    const recipients = toRecipients(req.body?.recipients);
    const recipientError = validateRecipients(recipients);
    if (recipientError) return res.status(400).json({ error: recipientError });

    const subject = String(req.body?.subject || "").trim();
    const html = String(req.body?.html || "").trim();
    const text = String(req.body?.text || "").trim();
    const from = String(req.body?.fromEmail || DEFAULT_FROM_EMAIL).trim();

    if (!subject) return res.status(400).json({ error: "Subject is required." });
    if (!html) return res.status(400).json({ error: "HTML content is required." });
    if (!from) return res.status(500).json({ error: "Missing PROOF_FROM_EMAIL configuration." });

    try {
        const result = await sendEmail({ fromEmail: from, to: recipients, subject, html, text });
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ error: error.message || "Proof send failed." });
    }
});

module.exports = router;
