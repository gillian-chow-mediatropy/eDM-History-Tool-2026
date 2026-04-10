const { clearSessionCookie, jsonResponse, requireAuth, revokeSessionByToken } = require("./_auth");

exports.handler = async function (event) {
    if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    try {
        const auth = await requireAuth(event);
        if (!auth.error && auth.ctx?.token) {
            await revokeSessionByToken(auth.ctx.token);
        }

        return jsonResponse(200, { ok: true }, {
            "Set-Cookie": clearSessionCookie()
        });
    } catch (error) {
        return jsonResponse(500, { error: error.message || "Logout failed." }, {
            "Set-Cookie": clearSessionCookie()
        });
    }
};
