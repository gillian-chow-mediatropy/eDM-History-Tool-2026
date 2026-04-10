const express = require("express");
const prisma = require("../lib/prisma");
const {
    cleanUser,
    hashPassword,
    requireAuth,
    verifyPassword
} = require("../lib/auth");

const router = express.Router();
const ROLES = new Set(["ADMIN", "EDITOR", "VIEWER", "APPROVER"]);

function normalizeMarkets(value) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || "").trim()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,\n;]+/)
        .map((v) => v.trim())
        .filter(Boolean);
}

router.get("/", requireAuth("settings:manage_users"), async (_req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: [{ createdAt: "asc" }]
        });
        res.json({ users: users.map(cleanUser) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Users API failed." });
    }
});

router.post("/", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const fullName = String(req.body?.fullName || "").trim();
        const password = String(req.body?.password || "");
        const role = String(req.body?.role || "EDITOR").trim().toUpperCase();
        const markets = normalizeMarkets(req.body?.markets);
        const isActive = req.body?.isActive !== false;

        if (!email || !fullName || !password) {
            return res.status(400).json({ error: "email, fullName, and password are required." });
        }
        if (!ROLES.has(role)) return res.status(400).json({ error: "Invalid role." });

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(409).json({ error: "Email is already in use." });

        const user = await prisma.user.create({
            data: {
                email,
                fullName,
                passwordHash: hashPassword(password),
                role,
                isActive,
                markets
            }
        });
        res.json({ user: cleanUser(user) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Users API failed." });
    }
});

router.patch("/", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const userId = String(req.body?.userId || "").trim();
        if (!userId) return res.status(400).json({ error: "userId is required." });

        const target = await prisma.user.findUnique({ where: { id: userId } });
        if (!target) return res.status(404).json({ error: "User not found." });

        const updates = {};
        if (typeof req.body?.fullName === "string") updates.fullName = req.body.fullName.trim();
        if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;
        if (req.body?.markets !== undefined) updates.markets = normalizeMarkets(req.body.markets);
        if (req.body?.role) {
            const nextRole = String(req.body.role).trim().toUpperCase();
            if (!ROLES.has(nextRole)) return res.status(400).json({ error: "Invalid role." });
            updates.role = nextRole;
        }

        if (target.id === currentUser.id && updates.isActive === false) {
            return res.status(400).json({ error: "You cannot deactivate your own account." });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updates
        });

        res.json({ user: cleanUser(user) });
    } catch (error) {
        res.status(500).json({ error: error.message || "Users API failed." });
    }
});

router.post("/password", requireAuth("auth:view_self"), async (req, res) => {
    try {
        const requester = req.auth.user;
        const targetUserId = String(req.body?.userId || requester.id).trim();
        const newPassword = String(req.body?.newPassword || "");
        const currentPassword = String(req.body?.currentPassword || "");

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: "newPassword must be at least 8 characters." });
        }

        const isSelf = targetUserId === requester.id;
        const canManageUsers = requester.role === "ADMIN";

        if (!isSelf && !canManageUsers) {
            return res.status(403).json({ error: "You cannot change another user's password." });
        }

        const target = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!target) return res.status(404).json({ error: "User not found." });

        if (isSelf) {
            if (!currentPassword || !verifyPassword(currentPassword, target.passwordHash)) {
                return res.status(401).json({ error: "Current password is invalid." });
            }
        }

        await prisma.user.update({
            where: { id: targetUserId },
            data: { passwordHash: hashPassword(newPassword) }
        });

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message || "Password update failed." });
    }
});

router.delete("/:id", requireAuth("settings:manage_users"), async (req, res) => {
    try {
        const currentUser = req.auth.user;
        const userId = String(req.params.id || "").trim();
        if (!userId) return res.status(400).json({ error: "user id is required." });

        const target = await prisma.user.findUnique({ where: { id: userId } });
        if (!target) return res.status(404).json({ error: "User not found." });

        if (target.id === currentUser.id) {
            return res.status(400).json({ error: "You cannot delete your own account." });
        }

        await prisma.user.delete({ where: { id: userId } });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message || "User delete failed." });
    }
});

module.exports = router;
