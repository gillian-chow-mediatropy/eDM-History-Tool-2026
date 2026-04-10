const prisma = require("./_prisma");
const { hashPassword, jsonResponse, parseBody, requireAuth, verifyPassword } = require("./_auth");

exports.handler = async function (event) {
    if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    try {
        const auth = await requireAuth(event, "auth:view_self");
        if (auth.error) return auth.error;

        const body = parseBody(event);
        const requester = auth.ctx.user;
        const targetUserId = String(body.userId || requester.id).trim();
        const newPassword = String(body.newPassword || "");
        const currentPassword = String(body.currentPassword || "");

        if (!newPassword || newPassword.length < 8) {
            return jsonResponse(400, { error: "newPassword must be at least 8 characters." });
        }

        const isSelf = targetUserId === requester.id;
        const canManageUsers = requester.role === "SUPER_ADMIN" || requester.role === "ADMIN";

        if (!isSelf && !canManageUsers) {
            return jsonResponse(403, { error: "You cannot change another user's password." });
        }

        const target = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!target) return jsonResponse(404, { error: "User not found." });

        if (isSelf) {
            if (!currentPassword || !verifyPassword(currentPassword, target.passwordHash)) {
                return jsonResponse(401, { error: "Current password is invalid." });
            }
        }

        await prisma.user.update({
            where: { id: targetUserId },
            data: { passwordHash: hashPassword(newPassword) }
        });

        return jsonResponse(200, { ok: true });
    } catch (error) {
        return jsonResponse(500, { error: error.message || "Password update failed." });
    }
};
