const crypto = require("crypto");
const prisma = require("./_prisma");

const SESSION_COOKIE_NAME = "edm_admin_session";
const SESSION_DURATION_DAYS = 7;

const ROLE_PERMISSIONS = {
    SUPER_ADMIN: ["*"],
    ADMIN: [
        "auth:view_self",
        "settings:view",
        "settings:manage_users",
        "builder:view",
        "builder:edit",
        "proof:send"
    ],
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
    ]
};

function jsonResponse(statusCode, body, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
            ...extraHeaders
        },
        body: JSON.stringify(body)
    };
}

function parseBody(event) {
    if (!event || !event.body) return {};
    try {
        return JSON.parse(event.body);
    } catch (err) {
        return {};
    }
}

function getCookies(event) {
    const header = event?.headers?.cookie || event?.headers?.Cookie || "";
    const out = {};
    header.split(";").forEach((part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key) out[key] = decodeURIComponent(value);
    });
    return out;
}

function hasPermission(userRole, permission) {
    const perms = ROLE_PERMISSIONS[userRole] || [];
    return perms.includes("*") || perms.includes(permission);
}

function getPermissionList(userRole) {
    return ROLE_PERMISSIONS[userRole] || [];
}

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function makeSessionCookie(token, maxAgeSeconds) {
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${maxAgeSeconds}`
    ];
    return parts.join("; ");
}

function clearSessionCookie() {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
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

async function issueSession(user, event) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const ip = event?.headers?.["x-forwarded-for"] || event?.headers?.["client-ip"] || "";
    const userAgent = event?.headers?.["user-agent"] || "";

    await prisma.userSession.create({
        data: {
            userId: user.id,
            tokenHash,
            expiresAt,
            ip: String(ip).slice(0, 120),
            userAgent: String(userAgent).slice(0, 255)
        }
    });

    return {
        token,
        expiresAt,
        cookie: makeSessionCookie(token, SESSION_DURATION_DAYS * 24 * 60 * 60)
    };
}

async function revokeSessionByToken(token) {
    if (!token) return;
    const tokenHash = hashSessionToken(token);
    await prisma.userSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
    });
}

async function getAuthContext(event) {
    const cookies = getCookies(event);
    const token = cookies[SESSION_COOKIE_NAME];
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

    return {
        token,
        session,
        user: session.user
    };
}

async function requireAuth(event, permission) {
    const ctx = await getAuthContext(event);
    if (!ctx) return { error: jsonResponse(401, { error: "Unauthorized" }) };

    if (permission && !hasPermission(ctx.user.role, permission)) {
        return { error: jsonResponse(403, { error: "Forbidden" }) };
    }

    return { ctx };
}

function cleanUser(user) {
    return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        markets: Array.isArray(user.markets) ? user.markets : [],
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

async function ensureBootstrapAdmin() {
    const totalUsers = await prisma.user.count();
    if (totalUsers > 0) return;

    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || "").trim();
    const name = String(process.env.ADMIN_NAME || "System Admin").trim();

    if (!email || !password) return;

    await prisma.user.create({
        data: {
            email,
            fullName: name,
            role: "SUPER_ADMIN",
            isActive: true,
            passwordHash: hashPassword(password),
            markets: []
        }
    });
}

module.exports = {
    SESSION_COOKIE_NAME,
    ROLE_PERMISSIONS,
    clearSessionCookie,
    cleanUser,
    ensureBootstrapAdmin,
    getPermissionList,
    hashPassword,
    issueSession,
    jsonResponse,
    parseBody,
    requireAuth,
    revokeSessionByToken,
    verifyPassword
};
