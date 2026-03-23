const https = require("https");
const http = require("http");

exports.handler = async function (event) {
    const url = (event.queryStringParameters || {}).url;
    if (!url) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing url param" }) };
    }

    const client = url.startsWith("https") ? https : http;

    return new Promise((resolve) => {
        const req = client.request(url, { method: "HEAD", timeout: 5000 }, (res) => {
            resolve({
                statusCode: 200,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ status: res.statusCode })
            });
        });

        req.on("timeout", () => {
            req.destroy();
            resolve({
                statusCode: 200,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ status: 0 })
            });
        });

        req.on("error", () => {
            resolve({
                statusCode: 200,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ status: 0 })
            });
        });

        req.end();
    });
};
