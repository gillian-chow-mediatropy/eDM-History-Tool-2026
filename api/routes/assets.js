const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");

const router = express.Router();

const ALLOWED_MIME = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"],
    ["image/svg+xml", ".svg"],
    ["video/mp4", ".mp4"],
    ["video/webm", ".webm"],
    ["video/quicktime", ".mov"],
    ["video/x-m4v", ".m4v"],
    ["application/pdf", ".pdf"],
    ["text/plain", ".txt"],
    ["text/csv", ".csv"],
    ["application/msword", ".doc"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
    ["application/vnd.ms-excel", ".xls"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
    ["application/vnd.ms-powerpoint", ".ppt"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"]
]);
const MIME_BY_EXT = new Map([
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".gif", "image/gif"],
    [".webp", "image/webp"],
    [".svg", "image/svg+xml"],
    [".mp4", "video/mp4"],
    [".webm", "video/webm"],
    [".mov", "video/quicktime"],
    [".m4v", "video/x-m4v"],
    [".pdf", "application/pdf"],
    [".txt", "text/plain"],
    [".csv", "text/csv"],
    [".doc", "application/msword"],
    [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    [".xls", "application/vnd.ms-excel"],
    [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    [".ppt", "application/vnd.ms-powerpoint"],
    [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]
]);
const UPLOADS_ROOT_DIR = path.resolve(__dirname, "..", "..", "uploads", "builder");
const PROJECT_ROOT_DIR = path.resolve(__dirname, "..", "..");
let mediaTableReadyPromise = null;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 40 * 1024 * 1024
    }
});

function toSafeApiError(error, fallbackMessage) {
    const message = String(error?.message || "");
    if (
        message.includes("Can't reach database server") ||
        message.includes("Authentication failed against database server") ||
        message.includes("prisma.")
    ) {
        return "Database connection failed. Please verify docker postgres is running and DATABASE_URL is correct.";
    }
    return fallbackMessage;
}

function getPublicBaseUrl(req) {
    const configured = String(process.env.API_PUBLIC_BASE_URL || "").trim();
    if (configured) return configured.replace(/\/+$/, "");
    return `${req.protocol}://${req.get("host")}`;
}

function createMediaId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `media-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function defaultAssetTitle(fileName = "") {
    return String(path.parse(String(fileName || "")).name || "media")
        .replace(/[-_]+/g, " ")
        .trim();
}

function toRelativeUploadPath(absolutePath) {
    const rel = path.relative(PROJECT_ROOT_DIR, absolutePath).replace(/\\/g, "/");
    return `/${rel.replace(/^\/+/, "")}`;
}

function toAbsolutePathFromRelative(relativePath) {
    const normalized = String(relativePath || "").replace(/^\/+/, "");
    return path.resolve(PROJECT_ROOT_DIR, normalized);
}

function mapAssetRow(row, req) {
    const relativePath = String(row?.relativePath || "");
    return {
        id: String(row?.id || ""),
        fileName: String(row?.fileName || ""),
        relativePath,
        url: `${getPublicBaseUrl(req)}${relativePath}`,
        mimeType: String(row?.mimeType || "application/octet-stream"),
        size: Number(row?.size || 0),
        title: String(row?.title || ""),
        altText: String(row?.altText || ""),
        storageProvider: String(row?.storageProvider || "local"),
        createdAt: row?.createdAt || null,
        updatedAt: row?.updatedAt || null
    };
}

async function saveUploadedFileToStorage(file, req, createdById = null) {
    const extension = ALLOWED_MIME.get(String(file?.mimetype || "").toLowerCase());
    if (!extension) {
        const error = new Error("Unsupported media format. Use images, videos, PDF, and Office docs (DOC/DOCX/XLS/XLSX/PPT/PPTX/TXT/CSV).");
        error.statusCode = 400;
        throw error;
    }

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const uploadsDir = path.resolve(__dirname, "..", "..", "uploads", "builder", yyyy, mm);
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeBaseName = String(path.parse(file?.originalname || "image").name || "image")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 60) || "image";
    const uniquePart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const fileName = `${safeBaseName}-${uniquePart}${extension}`;
    const filePath = path.join(uploadsDir, fileName);

    await fs.writeFile(filePath, file.buffer);

    const relativePath = `/uploads/builder/${yyyy}/${mm}/${fileName}`;
    const assetRow = await upsertMediaAssetRecord({
        fileName,
        relativePath,
        mimeType: file.mimetype,
        size: file.size,
        title: defaultAssetTitle(fileName),
        altText: defaultAssetTitle(fileName),
        createdById
    });
    const mapped = assetRow ? mapAssetRow(assetRow, req) : null;

    return {
        item: mapped,
        id: mapped?.id || null,
        url: mapped?.url || `${getPublicBaseUrl(req)}${relativePath}`,
        relativePath,
        fileName,
        size: file.size,
        mimeType: file.mimetype,
        title: mapped?.title || defaultAssetTitle(fileName),
        altText: mapped?.altText || defaultAssetTitle(fileName)
    };
}

async function ensureMediaStoreTable() {
    if (mediaTableReadyPromise) return mediaTableReadyPromise;

    mediaTableReadyPromise = (async () => {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS media_asset_store (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                relative_path TEXT NOT NULL UNIQUE,
                storage_provider TEXT NOT NULL DEFAULT 'local',
                mime_type TEXT,
                size_bytes BIGINT NOT NULL DEFAULT 0,
                title TEXT,
                alt_text TEXT,
                created_by_id TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ
            )
        `);
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS media_asset_store_deleted_idx
            ON media_asset_store(deleted_at)
        `);
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS media_asset_store_updated_idx
            ON media_asset_store(updated_at DESC)
        `);
        return true;
    })().catch((error) => {
        // Allow subsequent requests to retry table initialization after a failure.
        mediaTableReadyPromise = null;
        throw error;
    });

    return mediaTableReadyPromise;
}

async function listMediaFilesRecursive(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
        const absolutePath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            const nested = await listMediaFilesRecursive(absolutePath);
            results.push(...nested);
            continue;
        }
        if (!entry.isFile()) continue;

        const extension = String(path.extname(entry.name || "") || "").toLowerCase();
        if (!MIME_BY_EXT.has(extension)) continue;

        const stats = await fs.stat(absolutePath);
        results.push({
            absolutePath,
            fileName: String(entry.name || ""),
            extension,
            size: Number(stats.size || 0),
            createdAt: stats.birthtime ? stats.birthtime.toISOString() : new Date(stats.ctimeMs).toISOString(),
            updatedAt: stats.mtime ? stats.mtime.toISOString() : new Date(stats.mtimeMs).toISOString()
        });
    }

    return results;
}

async function upsertMediaAssetRecord({
    fileName = "",
    relativePath = "",
    mimeType = "",
    size = 0,
    title = "",
    altText = "",
    createdById = null
}) {
    await ensureMediaStoreTable();
    const insertId = createMediaId();
    const rows = await prisma.$queryRaw`
        INSERT INTO media_asset_store (
            id, file_name, relative_path, storage_provider, mime_type, size_bytes, title, alt_text, created_by_id, created_at, updated_at, deleted_at
        )
        VALUES (
            ${insertId},
            ${String(fileName || "")},
            ${String(relativePath || "")},
            'local',
            ${String(mimeType || "")},
            ${Number(size || 0)},
            ${String(title || "")},
            ${String(altText || "")},
            ${createdById ? String(createdById) : null},
            NOW(),
            NOW(),
            NULL
        )
        ON CONFLICT (relative_path)
        DO UPDATE SET
            file_name = EXCLUDED.file_name,
            mime_type = EXCLUDED.mime_type,
            size_bytes = EXCLUDED.size_bytes,
            storage_provider = EXCLUDED.storage_provider,
            title = COALESCE(NULLIF(media_asset_store.title, ''), EXCLUDED.title),
            alt_text = COALESCE(NULLIF(media_asset_store.alt_text, ''), EXCLUDED.alt_text),
            updated_at = NOW(),
            deleted_at = NULL
        RETURNING
            id AS "id",
            file_name AS "fileName",
            relative_path AS "relativePath",
            storage_provider AS "storageProvider",
            mime_type AS "mimeType",
            size_bytes AS "size",
            title AS "title",
            alt_text AS "altText",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
    `;

    return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function listMediaAssetRows() {
    await ensureMediaStoreTable();
    return prisma.$queryRaw`
        SELECT
            id AS "id",
            file_name AS "fileName",
            relative_path AS "relativePath",
            storage_provider AS "storageProvider",
            mime_type AS "mimeType",
            size_bytes AS "size",
            title AS "title",
            alt_text AS "altText",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM media_asset_store
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
    `;
}

async function findMediaAssetById(id) {
    await ensureMediaStoreTable();
    const rows = await prisma.$queryRaw`
        SELECT
            id AS "id",
            file_name AS "fileName",
            relative_path AS "relativePath",
            storage_provider AS "storageProvider",
            mime_type AS "mimeType",
            size_bytes AS "size",
            title AS "title",
            alt_text AS "altText",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM media_asset_store
        WHERE id = ${String(id || "")} AND deleted_at IS NULL
        LIMIT 1
    `;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function syncMediaTableWithFilesystem() {
    await ensureMediaStoreTable();

    let files = [];
    try {
        files = await listMediaFilesRecursive(UPLOADS_ROOT_DIR);
    } catch (error) {
        if (String(error?.code || "") !== "ENOENT") throw error;
        files = [];
    }

    const fsRelativePaths = new Set();
    for (const file of files) {
        const relativePath = toRelativeUploadPath(file.absolutePath);
        fsRelativePaths.add(relativePath);
        const title = defaultAssetTitle(file.fileName);
        // eslint-disable-next-line no-await-in-loop
        await upsertMediaAssetRecord({
            fileName: file.fileName,
            relativePath,
            mimeType: MIME_BY_EXT.get(file.extension) || "application/octet-stream",
            size: file.size,
            title,
            altText: title,
            createdById: null
        });
    }

    const existingRows = await listMediaAssetRows();
    const staleRows = (Array.isArray(existingRows) ? existingRows : [])
        .filter((row) => !fsRelativePaths.has(String(row?.relativePath || "")));

    for (const stale of staleRows) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.$executeRaw`
            UPDATE media_asset_store
            SET deleted_at = NOW(), updated_at = NOW()
            WHERE id = ${String(stale.id || "")}
        `;
    }
}

router.get("/library", requireAuth("settings:view"), async (req, res) => {
    try {
        await syncMediaTableWithFilesystem();
        const rows = await listMediaAssetRows();
        const items = (Array.isArray(rows) ? rows : []).map((row) => mapAssetRow(row, req));

        res.json({
            ok: true,
            total: items.length,
            items
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to load media library.") });
    }
});

router.post("/upload", requireAuth("builder:edit"), upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No file uploaded." });
        const payload = await saveUploadedFileToStorage(file, req, req?.auth?.user?.id || null);
        res.json({ ok: true, ...payload });
    } catch (error) {
        if (Number(error?.statusCode || 0) === 400) {
            return res.status(400).json({ error: String(error.message || "Invalid file upload.") });
        }
        res.status(500).json({ error: toSafeApiError(error, "Image upload failed.") });
    }
});

router.post("/upload-multi", requireAuth("builder:edit"), upload.array("files", 30), async (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        if (!files.length) return res.status(400).json({ error: "No files uploaded." });

        const uploaded = [];
        const failed = [];

        for (const file of files) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const item = await saveUploadedFileToStorage(file, req, req?.auth?.user?.id || null);
                uploaded.push(item);
            } catch (error) {
                failed.push({
                    fileName: String(file?.originalname || ""),
                    error: String(error?.message || "Upload failed.")
                });
            }
        }

        res.json({
            ok: true,
            total: files.length,
            uploadedCount: uploaded.length,
            failedCount: failed.length,
            uploaded,
            failed
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Image upload failed.") });
    }
});

router.delete("/bulk-delete", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const idsInput = Array.isArray(req.body?.ids) ? req.body.ids : [];
        const ids = [...new Set(idsInput.map((id) => String(id || "").trim()).filter(Boolean))];
        if (!ids.length) {
            return res.status(400).json({ error: "At least one media id is required." });
        }
        if (ids.length > 200) {
            return res.status(400).json({ error: "Bulk delete limit is 200 items per request." });
        }

        const deletedIds = [];
        const notFoundIds = [];
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            const found = await findMediaAssetById(id);
            if (!found) {
                notFoundIds.push(id);
                // eslint-disable-next-line no-continue
                continue;
            }

            const absolutePath = toAbsolutePathFromRelative(found.relativePath);
            if (absolutePath.startsWith(PROJECT_ROOT_DIR)) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await fs.unlink(absolutePath);
                } catch (error) {
                    if (String(error?.code || "") !== "ENOENT") throw error;
                }
            }

            // eslint-disable-next-line no-await-in-loop
            await prisma.$executeRaw`
                DELETE FROM media_asset_store
                WHERE id = ${id}
            `;
            deletedIds.push(id);
        }

        res.json({
            ok: true,
            requestedCount: ids.length,
            deletedCount: deletedIds.length,
            deletedIds,
            notFoundIds
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to bulk delete media assets.") });
    }
});

router.patch("/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Media id is required." });

        const found = await findMediaAssetById(id);
        if (!found) return res.status(404).json({ error: "Media asset not found." });

        const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, "title");
        const hasAlt = Object.prototype.hasOwnProperty.call(req.body || {}, "altText");
        if (!hasTitle && !hasAlt) {
            return res.status(400).json({ error: "At least one field (title, altText) is required." });
        }

        const nextTitle = hasTitle ? String(req.body?.title || "").trim() : String(found.title || "");
        const nextAlt = hasAlt ? String(req.body?.altText || "").trim() : String(found.altText || "");

        await prisma.$executeRaw`
            UPDATE media_asset_store
            SET title = ${nextTitle}, alt_text = ${nextAlt}, updated_at = NOW()
            WHERE id = ${id} AND deleted_at IS NULL
        `;

        const updated = await findMediaAssetById(id);
        if (!updated) return res.status(404).json({ error: "Media asset not found." });
        res.json({ ok: true, item: mapAssetRow(updated, req) });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to update media metadata.") });
    }
});

router.delete("/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Media id is required." });

        const found = await findMediaAssetById(id);
        if (!found) return res.status(404).json({ error: "Media asset not found." });

        const absolutePath = toAbsolutePathFromRelative(found.relativePath);
        if (absolutePath.startsWith(PROJECT_ROOT_DIR)) {
            try {
                await fs.unlink(absolutePath);
            } catch (error) {
                if (String(error?.code || "") !== "ENOENT") throw error;
            }
        }

        await prisma.$executeRaw`
            DELETE FROM media_asset_store
            WHERE id = ${id}
        `;

        res.json({ ok: true, deletedId: id });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to delete media asset.") });
    }
});

module.exports = router;
