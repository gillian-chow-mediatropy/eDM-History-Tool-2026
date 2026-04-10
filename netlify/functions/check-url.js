const https = require("https");
const http = require("http");

const BROKEN_PATTERNS = [
    /technical error has occurred/i,
    /technical error has occured/i,
    /bad mirror page/i,
    /rc=400/i,
    /com\.neolane/i
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
                "User-Agent": "Mozilla/5.0 (compatible; EDM-Archive-Checker/1.0)"
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

                finish({
                    status,
                    broken: brokenByStatus || brokenByPattern,
                    reason: brokenByStatus ? `status-${status || 0}` : (brokenByPattern ? "mirror-error-content" : "ok"),
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

exports.handler = async function (event) {
    const url = (event.queryStringParameters || {}).url;
    if (!url) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing url param" }) };
    }

    const payload = await inspectUrl(url);

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(payload)
    };
};
