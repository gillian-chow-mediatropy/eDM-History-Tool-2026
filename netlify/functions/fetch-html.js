const https = require("https");
const http = require("http");

exports.handler = async function (event) {
    const url = (event.queryStringParameters || {}).url;
    if (!url) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing url param" }) };
    }

    const client = url.startsWith("https") ? https : http;

    return new Promise((resolve) => {
        const req = client.get(url, { timeout: 8000 }, (res) => {
            // Follow redirects (up to 3)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectClient = res.headers.location.startsWith("https") ? https : http;
                redirectClient.get(res.headers.location, { timeout: 8000 }, (res2) => {
                    let body = "";
                    res2.on("data", (chunk) => { body += chunk; });
                    res2.on("end", () => {
                        resolve({
                            statusCode: 200,
                            headers: {
                                "Content-Type": "application/json",
                                "Access-Control-Allow-Origin": "*"
                            },
                            body: JSON.stringify({ html: body })
                        });
                    });
                }).on("error", () => {
                    resolve({
                        statusCode: 200,
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                        body: JSON.stringify({ html: null, error: "Redirect failed" })
                    });
                });
                return;
            }

            let body = "";
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                resolve({
                    statusCode: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    },
                    body: JSON.stringify({ html: body })
                });
            });
        });

        req.on("timeout", () => {
            req.destroy();
            resolve({
                statusCode: 200,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ html: null, error: "Timeout" })
            });
        });

        req.on("error", () => {
            resolve({
                statusCode: 200,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ html: null, error: "Fetch failed" })
            });
        });
    });
};
