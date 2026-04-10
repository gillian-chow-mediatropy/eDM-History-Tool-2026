const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { sendEmail } = require("../lib/mailer");
const {
    cleanUser,
    clearSessionCookie,
    ensureBootstrapAdmin,
    getAuthContext,
    getPermissionList,
    hashPassword,
    issueSession,
    requireAuth,
    revokeSessionByToken,
    setSessionCookie,
    verifyPassword
} = require("../lib/auth");

const router = express.Router();
const RESET_TOKEN_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 30);
const PASSWORD_RESET_FROM_EMAIL = process.env.PASSWORD_RESET_FROM_EMAIL || process.env.PROOF_FROM_EMAIL || "";

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

function hashResetToken(token) {
    return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function buildResetUrl(rawToken) {
    const frontendBase = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
    return `${frontendBase}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

router.post("/login", async (req, res) => {
    try {
        await ensureBootstrapAdmin();

        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials." });
        if (!verifyPassword(password, user.passwordHash)) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const session = await issueSession(req, user);
        setSessionCookie(res, session.token, 7 * 24 * 60 * 60);

        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });

        res.json({
            ok: true,
            user: cleanUser(user),
            permissions: getPermissionList(user.role),
            expiresAt: session.expiresAt
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Login failed. Please try again.") });
    }
});

router.post("/forgot-password", async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json({
                ok: true,
                message: "If this email exists, a reset link has been sent."
            });
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (user && user.isActive) {
            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = hashResetToken(rawToken);
            const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000);

            await prisma.passwordResetToken.create({
                data: {
                    userId: user.id,
                    tokenHash,
                    expiresAt
                }
            });

            const resetUrl = buildResetUrl(rawToken);
            const subject = "Reset your eDM Marriott Email Tools password";
            const html = `
                <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1d2939;">
                    <p>Hello ${user.fullName || "User"},</p>
                    <p>We received a request to reset your password.</p>
                    <p>This link will expire in ${RESET_TOKEN_MINUTES} minutes.</p>
                    <p><a href="${resetUrl}" style="display:inline-block;background:#ff8d6b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Reset password</a></p>
                    <p>If the button does not work, copy this link:</p>
                    <p>${resetUrl}</p>
                    <p>If you did not request this, you can ignore this email.</p>
                </div>
            `;
            const text = [
                `Hello ${user.fullName || "User"},`,
                "",
                "We received a request to reset your password.",
                `This link will expire in ${RESET_TOKEN_MINUTES} minutes.`,
                "",
                `Reset link: ${resetUrl}`,
                "",
                "If you did not request this, you can ignore this email."
            ].join("\n");

            await sendEmail({
                fromEmail: PASSWORD_RESET_FROM_EMAIL,
                to: [email],
                subject,
                html,
                text
            });
        }

        return res.json({
            ok: true,
            message: "If this email exists, a reset link has been sent."
        });
    } catch (error) {
        return res.status(500).json({ error: toSafeApiError(error, "Failed to send reset email.") });
    }
});

router.post("/reset-password", async (req, res) => {
    try {
        const token = String(req.body?.token || "").trim();
        const newPassword = String(req.body?.newPassword || "");

        if (!token) return res.status(400).json({ error: "Reset token is required." });
        if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });

        const tokenHash = hashResetToken(token);

        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { tokenHash },
            include: { user: true }
        });

        if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now() || !resetToken.user?.isActive) {
            return res.status(400).json({ error: "Reset link is invalid or expired." });
        }

        await prisma.$transaction([
            prisma.user.update({
                where: { id: resetToken.userId },
                data: { passwordHash: hashPassword(newPassword) }
            }),
            prisma.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { usedAt: new Date() }
            }),
            prisma.userSession.updateMany({
                where: { userId: resetToken.userId, revokedAt: null },
                data: { revokedAt: new Date() }
            })
        ]);

        return res.json({ ok: true, message: "Password has been reset. Please sign in." });
    } catch (error) {
        return res.status(500).json({ error: toSafeApiError(error, "Failed to reset password.") });
    }
});

router.post("/logout", async (req, res) => {
    try {
        const auth = await getAuthContext(req);
        if (auth?.token) {
            await revokeSessionByToken(auth.token);
        }
        clearSessionCookie(res);
        res.json({ ok: true });
    } catch (error) {
        clearSessionCookie(res);
        res.status(500).json({ error: toSafeApiError(error, "Logout failed.") });
    }
});

router.get("/me", requireAuth("auth:view_self"), (req, res) => {
    try {
        const user = req.auth.user;
        res.json({
            ok: true,
            user: cleanUser(user),
            permissions: getPermissionList(user.role)
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to get session.") });
    }
});

router.patch("/me", requireAuth("auth:view_self"), async (req, res) => {
    try {
        const user = req.auth.user;
        const firstName = String(req.body?.firstName || "").trim();
        const lastName = String(req.body?.lastName || "").trim();

        if (!firstName) {
            return res.status(400).json({ error: "First name is required." });
        }

        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName.length > 120) {
            return res.status(400).json({ error: "Name is too long." });
        }

        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { fullName }
        });

        res.json({
            ok: true,
            user: cleanUser(updated),
            permissions: getPermissionList(updated.role)
        });
    } catch (error) {
        res.status(500).json({ error: toSafeApiError(error, "Failed to update profile.") });
    }
});

module.exports = router;
