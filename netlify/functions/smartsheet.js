const https = require("https");

const SHEET_ID = process.env.SMARTSHEET_SHEET_ID || "36354399725444";
const API_TOKEN = process.env.SMARTSHEET_API_TOKEN;

// Only request the columns we need
const COLUMN_IDS = [
    1156879576524676, 6252542022707076, 4347810907639684,
    2300228855457668, 6803828482828164, 5420736035743620,
    2122264081551236, 7623657374568324, 3187176543309700,
    3371405229746052, 3395746991918980, 3496432308014980,
    5596505414258564, 2831053281775492, 5195369913995140,
    4126278054793092
].join(",");

exports.handler = async function (event) {
    if (!API_TOKEN) {
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Missing SMARTSHEET_API_TOKEN" })
        };
    }

    const params = event.queryStringParameters || {};
    const page = params.page || "1";
    const pageSize = params.pageSize || "500";

    const path = `/2.0/sheets/${SHEET_ID}?pageSize=${pageSize}&page=${page}&columnIds=${COLUMN_IDS}`;

    return new Promise((resolve) => {
        const req = https.request({
            hostname: "api.smartsheet.com",
            path: path,
            method: "GET",
            headers: { "Authorization": "Bearer " + API_TOKEN }
        }, (res) => {
            let body = "";
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "public, max-age=300"
                    },
                    body: body
                });
            });
        });

        req.on("error", (err) => {
            resolve({
                statusCode: 500,
                body: JSON.stringify({ error: err.message })
            });
        });

        req.end();
    });
};
