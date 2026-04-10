const express = require("express");
const https = require("https");

const router = express.Router();

const SHEET_ID = process.env.SMARTSHEET_SHEET_ID || "36354399725444";
const API_TOKEN = process.env.SMARTSHEET_API_TOKEN;

const COLUMN_IDS = [
    1156879576524676, 6252542022707076, 4347810907639684,
    2300228855457668, 6803828482828164, 5420736035743620,
    2122264081551236, 7623657374568324, 3187176543309700,
    3371405229746052, 3395746991918980, 3496432308014980,
    5596505414258564, 2831053281775492, 5195369913995140,
    4126278054793092
].join(",");

router.get("/", async (req, res) => {
    if (!API_TOKEN) {
        return res.status(500).json({ error: "Missing SMARTSHEET_API_TOKEN" });
    }

    const page = String(req.query.page || "1");
    const pageSize = String(req.query.pageSize || "500");
    const path = `/2.0/sheets/${SHEET_ID}?pageSize=${pageSize}&page=${page}&columnIds=${COLUMN_IDS}`;

    const request = https.request({
        hostname: "api.smartsheet.com",
        path,
        method: "GET",
        headers: { Authorization: `Bearer ${API_TOKEN}` }
    }, (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
            res.status(response.statusCode || 500);
            res.setHeader("Cache-Control", "public, max-age=300");
            try {
                const parsed = JSON.parse(body || "{}");
                res.json(parsed);
            } catch (_e) {
                res.send(body);
            }
        });
    });

    request.on("error", (error) => {
        res.status(500).json({ error: error.message });
    });

    request.end();
});

module.exports = router;
