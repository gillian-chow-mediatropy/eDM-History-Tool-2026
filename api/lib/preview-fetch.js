const http = require("http");
const https = require("https");

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

function fetchPreviewHtml(url, redirectDepth = 0) {
    if (redirectDepth > 3) {
        return Promise.resolve({ html: null, error: "Too many redirects", broken: true, status: 0 });
    }

    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl) {
        return Promise.resolve({ html: null, error: "Missing URL", broken: true, status: 0 });
    }

    const client = normalizedUrl.startsWith("https") ? https : http;

    return new Promise((resolve) => {
        const req = client.get(normalizedUrl, {
            timeout: 8000,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; EDM-Archive-Fetcher/1.0)",
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "identity"
            }
        }, (res) => {
            const status = Number(res.statusCode || 0);
            if (status >= 300 && status < 400 && res.headers.location) {
                const redirectedUrl = new URL(res.headers.location, normalizedUrl).toString();
                resolve(fetchPreviewHtml(redirectedUrl, redirectDepth + 1));
                return;
            }

            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                const contentType = String(res.headers["content-type"] || "").toLowerCase();
                const isStatusBroken = !status || status >= 400;
                const isContentBroken = BROKEN_PATTERNS.some((pattern) => pattern.test(body));
                const isUrlBroken = /[?&]rc=400\b/i.test(normalizedUrl) || /bad[\-_ ]mirror/i.test(normalizedUrl);
                const isPlainTextError = contentType.includes("text/plain") && isContentBroken;
                const broken = isStatusBroken || isContentBroken || isUrlBroken || isPlainTextError;

                resolve({
                    html: broken ? null : body,
                    status,
                    broken,
                    error: broken ? "Preview HTML unavailable." : null
                });
            });
        });

        req.on("timeout", () => {
            req.destroy();
            resolve({ html: null, error: "Timeout", broken: true, status: 0 });
        });

        req.on("error", () => {
            resolve({ html: null, error: "Fetch failed", broken: true, status: 0 });
        });
    });
}

module.exports = {
    BROKEN_PATTERNS,
    fetchPreviewHtml
};
