const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();
const PROGRESS_FILES = [
    path.resolve(__dirname, "..", "data", "progress.json"),
    path.resolve(__dirname, "..", "..", "dashboard", "data", "progress.json")
];

async function readProgressFile() {
    for (const filePath of PROGRESS_FILES) {
        try {
            return await fs.readFile(filePath, "utf8");
        } catch (error) {
            if (error?.code !== "ENOENT") throw error;
        }
    }
    throw new Error("Progress data file not found. Expected api/data/progress.json.");
}

router.get("/progress", async (_req, res) => {
    try {
        const raw = await readProgressFile();
        const data = JSON.parse(raw);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message || "Failed to load progress dashboard data." });
    }
});

module.exports = router;
