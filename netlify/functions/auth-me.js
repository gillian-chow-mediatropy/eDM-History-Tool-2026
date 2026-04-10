const { cleanUser, getPermissionList, jsonResponse, requireAuth } = require("./_auth");

exports.handler = async function (event) {
    if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
    if (event.httpMethod !== "GET") return jsonResponse(405, { error: "Method not allowed" });

    try {
        const auth = await requireAuth(event, "auth:view_self");
        if (auth.error) return auth.error;

        return jsonResponse(200, {
            ok: true,
            user: cleanUser(auth.ctx.user),
            permissions: getPermissionList(auth.ctx.user.role)
        });
    } catch (error) {
        return jsonResponse(500, { error: error.message || "Failed to get session." });
    }
};
