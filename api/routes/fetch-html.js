const express = require("express");
const { fetchPreviewHtml } = require("../lib/preview-fetch");

const router = express.Router();

router.get("/", async (req, res) => {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ error: "Missing url param" });

    const data = await fetchPreviewHtml(url);
    res.json(data);
});

module.exports = router;
