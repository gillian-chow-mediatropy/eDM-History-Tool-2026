const prisma = require("./_prisma");
const {
    cleanUser,
    ensureBootstrapAdmin,
    getPermissionList,
    issueSession,
    jsonResponse,
    parseBody,
    verifyPassword
} = require("./_auth");

exports.handler = async function (event) {
    if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    try {
        await ensureBootstrapAdmin();

        const body = parseBody(event);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
            return jsonResponse(400, { error: "Email and password are required." });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return jsonResponse(401, { error: "Invalid credentials." });
        if (!verifyPassword(password, user.passwordHash)) return jsonResponse(401, { error: "Invalid credentials." });

        const session = await issueSession(user, event);
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });

        return jsonResponse(200, {
            ok: true,
            user: cleanUser(user),
            permissions: getPermissionList(user.role),
            expiresAt: session.expiresAt
        }, {
            "Set-Cookie": session.cookie
        });
    } catch (error) {
        return jsonResponse(500, { error: error.message || "Login failed." });
    }
};
