const crypto = require("crypto");
const prisma = require("./prisma");

const SESSION_COOKIE_NAME = "edm_admin_session";
const SESSION_DURATION_DAYS = 7;
const ADMIN_PERMISSIONS = [
    "auth:view_self",
    "settings:view",
    "settings:manage_users",
    "builder:view",
    "builder:edit",
    "proof:send"
];

const ROLE_PERMISSIONS = {
    SUPER_ADMIN: ADMIN_PERMISSIONS,
    ADMIN: ADMIN_PERMISSIONS,
    EDITOR: [
        "auth:view_self",
        "settings:view",
        "builder:view",
        "builder:edit",
        "proof:send"
    ],
    VIEWER: [
        "auth:view_self",
        "settings:view",
        "builder:view"
    ],
    APPROVER: [
        "auth:view_self",
        "settings:view",
        "builder:view",
        "proof:send"
    ]
};

function normalizeRole(userRole) {
    const role = String(userRole || "").trim().toUpperCase();
    if (role === "SUPER_ADMIN") return "ADMIN";
    return ROLE_PERMISSIONS[role] ? role : "VIEWER";
}

function hasPermission(userRole, permission) {
    const perms = ROLE_PERMISSIONS[normalizeRole(userRole)] || [];
    return perms.includes("*") || perms.includes(permission);
}

function getPermissionList(userRole) {
    return ROLE_PERMISSIONS[normalizeRole(userRole)] || [];
}

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== "string") return false;
    const parts = storedHash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const salt = parts[1];
    const expectedHex = parts[2];
    const actualHex = crypto.scryptSync(password, salt, 64).toString("hex");
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
}

function cleanUser(user) {
    const normalizedRole = normalizeRole(user.role);
    return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: normalizedRole,
        isActive: user.isActive,
        markets: Array.isArray(user.markets) ? user.markets : [],
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

function setSessionCookie(res, token, maxAgeSeconds) {
    res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: maxAgeSeconds * 1000
    });
}

function clearSessionCookie(res) {
    res.cookie(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 0
    });
}

async function issueSession(req, user) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const xff = req.headers["x-forwarded-for"] || "";
    const ip = String(Array.isArray(xff) ? xff[0] : xff || req.socket?.remoteAddress || "").slice(0, 120);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 255);

    await prisma.userSession.create({
        data: {
            userId: user.id,
            tokenHash,
            expiresAt,
            ip,
            userAgent
        }
    });

    return { token, expiresAt };
}

async function revokeSessionByToken(token) {
    if (!token) return;
    const tokenHash = hashSessionToken(token);
    await prisma.userSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
    });
}

async function getAuthContext(req) {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;

    const tokenHash = hashSessionToken(token);
    const session = await prisma.userSession.findUnique({
        where: { tokenHash },
        include: { user: true }
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    if (!session.user || !session.user.isActive) return null;

    const normalizedRole = normalizeRole(session.user.role);
    const normalizedUser = normalizedRole === session.user.role
        ? session.user
        : { ...session.user, role: normalizedRole };

    return { token, session, user: normalizedUser };
}

function requireAuth(permission) {
    return async (req, res, next) => {
        try {
            const ctx = await getAuthContext(req);
            if (!ctx) return res.status(401).json({ error: "Unauthorized" });
            if (permission && !hasPermission(ctx.user.role, permission)) {
                return res.status(403).json({ error: "Forbidden" });
            }
            req.auth = ctx;
            next();
        } catch (error) {
            res.status(500).json({ error: error.message || "Authorization failed." });
        }
    };
}

async function ensureBootstrapAdmin() {
    const totalUsers = await prisma.user.count();
    if (totalUsers > 0) {
        await prisma.user.updateMany({
            where: { role: "SUPER_ADMIN" },
            data: { role: "ADMIN" }
        });
        return;
    }

    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || "").trim();
    const name = String(process.env.ADMIN_NAME || "System Admin").trim();

    if (!email || !password) return;

    await prisma.user.create({
        data: {
            email,
            fullName: name,
            role: "ADMIN",
            isActive: true,
            passwordHash: hashPassword(password),
            markets: []
        }
    });
}

module.exports = {
    SESSION_COOKIE_NAME,
    ROLE_PERMISSIONS,
    cleanUser,
    clearSessionCookie,
    ensureBootstrapAdmin,
    getAuthContext,
    getPermissionList,
    hashPassword,
    hasPermission,
    issueSession,
    requireAuth,
    revokeSessionByToken,
    setSessionCookie,
    verifyPassword
};
