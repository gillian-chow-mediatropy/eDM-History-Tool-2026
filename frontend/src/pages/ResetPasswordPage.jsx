import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api";

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = useMemo(() => String(searchParams.get("token") || "").trim(), [searchParams]);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setMessage("");

        if (!token) {
            setError("Reset token is missing. Please use the link from your email.");
            return;
        }

        if (newPassword.length < 8) {
            setError("New password must be at least 8 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Password confirmation does not match.");
            return;
        }

        try {
            setLoading(true);
            await apiRequest("/api/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({
                    token,
                    newPassword
                })
            });
            setMessage("Password reset successful. Redirecting to sign in...");
            setTimeout(() => navigate("/login", { replace: true }), 1200);
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="center-screen">
            <div className="card narrow">
                <h2>Reset password</h2>
                <p className="muted mt-2">Enter your new password below.</p>
                <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
                    <input
                        type="password"
                        minLength={8}
                        placeholder="New password (min 8 chars)"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                    />
                    <input
                        type="password"
                        minLength={8}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                    />
                    <button type="submit" className="button-primary" disabled={loading}>
                        {loading ? "Updating..." : "Reset password"}
                    </button>
                </form>

                {message && <p className="msg ok mt-3">{message}</p>}
                {error && <p className="msg error mt-3">{error}</p>}
                <p className="mt-4 text-sm">
                    <Link to="/login" className="text-brand-600 hover:text-brand-500">Back to sign in</Link>
                </p>
            </div>
        </div>
    );
}
