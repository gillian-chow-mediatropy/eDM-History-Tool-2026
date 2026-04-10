function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildPasswordResetEmail({ fullName, resetUrl, expiresMinutes = 30 }) {
    const safeName = escapeHtml(fullName || "User");
    const safeUrl = escapeHtml(resetUrl || "");
    const safeExpires = Number.isFinite(Number(expiresMinutes)) ? Number(expiresMinutes) : 30;
    const previewText = "Reset your eDM Marriott Email Tools password";

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Password Reset</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1d2939;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fa;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e7ec;">
            <tr>
              <td style="padding:0;">
                <div style="background:#10293c;">
                  <img
                    src="https://www.marriott.com/content/dam/marriott-digital/eb/emea/hws/m/mille/en_us/photo/unlimited/assets/eb-mille-edition-floating-pool-17083.jpg"
                    alt="Marriott"
                    style="display:block;width:100%;height:180px;object-fit:cover;opacity:0.82;"
                  />
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 14px;">
                <p style="margin:0 0 8px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#667085;font-weight:700;">eDM Marriott Email Tools</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;color:#101828;">Reset Your Password</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px;">
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#344054;">Hello ${safeName},</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#344054;">
                  We received a request to reset your password for <strong>eDM Marriott Email Tools</strong>.
                </p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#344054;">
                  This secure link will expire in <strong>${safeExpires} minutes</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="border-radius:10px;background:#ff8d6b;">
                      <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 22px;">
                <p style="margin:0 0 8px;font-size:13px;color:#667085;">If the button doesn’t work, copy and paste this link into your browser:</p>
                <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;color:#344054;">${safeUrl}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#667085;">
                  If you did not request this reset, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    const text = [
        "eDM Marriott Email Tools",
        "",
        `Hello ${fullName || "User"},`,
        "",
        "We received a request to reset your password.",
        `This link will expire in ${safeExpires} minutes.`,
        "",
        `Reset password: ${resetUrl}`,
        "",
        "If you did not request this reset, you can ignore this email."
    ].join("\n");

    return {
        subject: "Reset your eDM Marriott Email Tools password",
        html,
        text
    };
}

module.exports = {
    buildPasswordResetEmail
};
