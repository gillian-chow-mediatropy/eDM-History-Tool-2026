const express = require("express");
const http = require("http");
const https = require("https");

const router = express.Router();
const BROKEN_PATTERNS = [
    /technical error has occurred/i,
    /technical error has occured/i,
    /a technical error has occurred/i,
    /bad mirror page/i,
    /rc=400/i,
    /com\.neolane/i,
    /nlexception/i,
    /org\.apache\.jsp\.m_jsp/i,
    /org\.apache\.jasper/i,
    /exception:/i,
    /stacktrace/i,
    /error page/i
];

function inspectUrl(rawUrl, depth = 0) {
    if (depth > 3) {
        return Promise.resolve({ status: 0, broken: true, reason: "too-many-redirects", finalUrl: rawUrl });
    }

    const client = rawUrl.startsWith("https") ? https : http;

    return new Promise((resolve) => {
        let settled = false;
        const finish = (payload) => {
            if (settled) return;
            settled = true;
            resolve(payload);
        };

        const request = client.get(rawUrl, {
            timeout: 8000,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; EDM-Archive-Checker/1.0)",
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "identity"
            }
        }, (response) => {
            const status = response.statusCode || 0;

            if (status >= 300 && status < 400 && response.headers.location) {
                const nextUrl = new URL(response.headers.location, rawUrl).toString();
                response.resume();
                inspectUrl(nextUrl, depth + 1).then(finish);
                return;
            }

            let body = "";
            const maxChars = 20000;
            const contentType = String(response.headers["content-type"] || "").toLowerCase();
            response.setEncoding("utf8");

            response.on("data", (chunk) => {
                if (body.length < maxChars) {
                    body += chunk;
                }
            });

            response.on("end", () => {
                const bodySnippet = body.slice(0, maxChars);
                const brokenByStatus = !status || status >= 400;
                const brokenByPattern = BROKEN_PATTERNS.some((pattern) => pattern.test(bodySnippet));
                const brokenByFinalUrl = /[?&]rc=400\b/i.test(rawUrl) || /bad[\-_ ]mirror/i.test(rawUrl);
                const brokenByContentType = contentType.includes("text/plain") && brokenByPattern;
                finish({
                    status,
                    broken: brokenByStatus || brokenByPattern || brokenByFinalUrl || brokenByContentType,
                    reason: brokenByStatus
                        ? `status-${status || 0}`
                        : brokenByFinalUrl
                            ? "mirror-error-url"
                            : brokenByPattern
                                ? "mirror-error-content"
                                : brokenByContentType
                                    ? "plain-text-error"
                                    : "ok",
                    finalUrl: rawUrl
                });
            });
        });

        request.on("timeout", () => {
            request.destroy();
            finish({ status: 0, broken: true, reason: "timeout", finalUrl: rawUrl });
        });

        request.on("error", () => {
            finish({ status: 0, broken: true, reason: "request-error", finalUrl: rawUrl });
        });
    });
}

router.get("/", async (req, res) => {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ error: "Missing url param" });

    const payload = await inspectUrl(url);
    res.json(payload);
});

module.exports = router;
