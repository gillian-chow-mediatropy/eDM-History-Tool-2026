const prisma = require("./_prisma");
const {
    cleanUser,
    hashPassword,
    jsonResponse,
    parseBody,
    requireAuth
} = require("./_auth");

const ROLES = new Set(["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"]);

function normalizeMarkets(value) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || "").trim()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,\n;]+/)
        .map((v) => v.trim())
        .filter(Boolean);
}

exports.handler = async function (event) {
    if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });

    try {
        const auth = await requireAuth(event, "settings:manage_users");
        if (auth.error) return auth.error;

        const currentUser = auth.ctx.user;

        if (event.httpMethod === "GET") {
            const users = await prisma.user.findMany({
                orderBy: [{ createdAt: "asc" }]
            });
            return jsonResponse(200, { users: users.map(cleanUser) });
        }

        if (event.httpMethod === "POST") {
            const body = parseBody(event);
            const email = String(body.email || "").trim().toLowerCase();
            const fullName = String(body.fullName || "").trim();
            const password = String(body.password || "");
            const role = String(body.role || "EDITOR").trim().toUpperCase();
            const markets = normalizeMarkets(body.markets);
            const isActive = body.isActive !== false;

            if (!email || !fullName || !password) {
                return jsonResponse(400, { error: "email, fullName, and password are required." });
            }
            if (!ROLES.has(role)) return jsonResponse(400, { error: "Invalid role." });
            if (role === "SUPER_ADMIN" && currentUser.role !== "SUPER_ADMIN") {
                return jsonResponse(403, { error: "Only SUPER_ADMIN can create SUPER_ADMIN users." });
            }

            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) return jsonResponse(409, { error: "Email is already in use." });

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
            return jsonResponse(200, { user: cleanUser(user) });
        }

        if (event.httpMethod === "PATCH") {
            const body = parseBody(event);
            const userId = String(body.userId || "").trim();
            if (!userId) return jsonResponse(400, { error: "userId is required." });

            const target = await prisma.user.findUnique({ where: { id: userId } });
            if (!target) return jsonResponse(404, { error: "User not found." });

            const updates = {};
            if (typeof body.fullName === "string") updates.fullName = body.fullName.trim();
            if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
            if (body.markets !== undefined) updates.markets = normalizeMarkets(body.markets);
            if (body.role) {
                const nextRole = String(body.role).trim().toUpperCase();
                if (!ROLES.has(nextRole)) return jsonResponse(400, { error: "Invalid role." });
                if (nextRole === "SUPER_ADMIN" && currentUser.role !== "SUPER_ADMIN") {
                    return jsonResponse(403, { error: "Only SUPER_ADMIN can assign SUPER_ADMIN role." });
                }
                updates.role = nextRole;
            }

            if (target.id === currentUser.id && updates.isActive === false) {
                return jsonResponse(400, { error: "You cannot deactivate your own account." });
            }

            const user = await prisma.user.update({
                where: { id: userId },
                data: updates
            });
            return jsonResponse(200, { user: cleanUser(user) });
        }

        return jsonResponse(405, { error: "Method not allowed" });
    } catch (error) {
        return jsonResponse(500, { error: error.message || "Users API failed." });
    }
};
