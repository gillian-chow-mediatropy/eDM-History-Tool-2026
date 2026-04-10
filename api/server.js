require("dotenv").config({ override: true });

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const { ensureBootstrapAdmin } = require("./lib/auth");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const smartsheetRoutes = require("./routes/smartsheet");
const fetchHtmlRoutes = require("./routes/fetch-html");
const checkUrlRoutes = require("./routes/check-url");
const sendProofRoutes = require("./routes/send-proof");
const dashboardRoutes = require("./routes/dashboard");
const settingsRoutes = require("./routes/settings");
const builderRoutes = require("./routes/builder");
const assetsRoutes = require("./routes/assets");
const campaignsRoutes = require("./routes/campaigns");

const app = express();
const port = Number(process.env.API_PORT || 3001);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({
    origin: frontendUrl,
    credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "api", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/smartsheet", smartsheetRoutes);
app.use("/api/fetch-html", fetchHtmlRoutes);
app.use("/api/check-url", checkUrlRoutes);
app.use("/api/send-proof", sendProofRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/builder", builderRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/uploads", express.static(path.resolve(__dirname, "..", "uploads")));

if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "..", "frontend", "dist");
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get("*", (_req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
        });
    }
}

ensureBootstrapAdmin().catch(() => {
    // Intentionally ignore startup bootstrap failures; login will retry.
});

app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
});
