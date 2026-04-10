import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { apiRequest } from "../api";

function EyeIcon({ closed = false }) {
    if (closed) {
        return (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M2.5 10C3.8 7.15 6.65 5.25 10 5.25C13.35 5.25 16.2 7.15 17.5 10C16.2 12.85 13.35 14.75 10 14.75C6.65 14.75 3.8 12.85 2.5 10Z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7.9 9.98C7.9 11.13 8.84 12.07 10 12.07C11.16 12.07 12.1 11.13 12.1 9.98" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M3 3L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        );
    }

    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M2.5 10C3.8 7.15 6.65 5.25 10 5.25C13.35 5.25 16.2 7.15 17.5 10C16.2 12.85 13.35 14.75 10 14.75C6.65 14.75 3.8 12.85 2.5 10Z" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    );
}

export default function LoginPage() {
    const [email, setEmail] = useState("devops@mediatropy.com");
    const [password, setPassword] = useState("");
    const [keepLoggedIn, setKeepLoggedIn] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [forgotOpen, setForgotOpen] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("devops@mediatropy.com");
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotMessage, setForgotMessage] = useState("");
    const [forgotError, setForgotError] = useState("");
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(email.trim(), password);
            const next = params.get("next");
            navigate(next && next.startsWith("/") ? next : "/dashboard", { replace: true });
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleForgotPassword(event) {
        event.preventDefault();
        setForgotLoading(true);
        setForgotError("");
        setForgotMessage("");
        try {
            const payload = await apiRequest("/api/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({ email: forgotEmail.trim() })
            });
            setForgotMessage(payload.message || "If this email exists, a reset link has been sent.");
        } catch (apiError) {
            setForgotError(apiError.message);
        } finally {
            setForgotLoading(false);
        }
    }

    return (
        <div className="relative p-6 bg-white sm:p-0">
            <div className="relative flex flex-col justify-center w-full min-h-screen lg:flex-row">
                <div className="flex flex-col flex-1 w-full lg:w-1/2">
                    <div className="flex flex-col justify-start lg:justify-center flex-1 w-full max-w-md mx-auto px-1 py-8 lg:py-10">
                        <div
                            className="relative mb-8 h-48 w-full overflow-hidden rounded-2xl lg:hidden"
                            style={{
                                backgroundImage: "url('https://www.marriott.com/content/dam/marriott-digital/eb/emea/hws/m/mille/en_us/photo/unlimited/assets/eb-mille-edition-floating-pool-17083.jpg')",
                                backgroundPosition: "center",
                                backgroundSize: "cover"
                            }}
                        >
                            <div
                                className="absolute inset-0"
                                style={{
                                    background: "linear-gradient(180deg, rgba(16, 41, 60, 0.72) 0%, rgba(16, 41, 60, 0.62) 45%, rgba(16, 41, 60, 0.78) 100%)"
                                }}
                            />
                            <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center text-white">
                                <img src="/images/logo/auth-logo.svg" alt="eDM Marriott Email Tools" className="h-9 w-auto" />
                                <h2 className="mt-3 text-2xl font-semibold leading-tight">eDM Marriott Email Tools</h2>
                            </div>
                        </div>

                        <div className="mb-5 sm:mb-8">
                            <h1 className="mb-2 text-4xl font-semibold text-gray-900">Sign in</h1>
                            <p className="text-sm text-gray-500">Enter your email and password to continue.</p>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="space-y-6">
                                <div>
                                    <label htmlFor="email" className="block mb-1.5 text-sm font-medium text-gray-700">
                                        Email <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        autoComplete="username"
                                        placeholder="info@gmail.com"
                                        required
                                        className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-800 outline-none transition focus:border-[#ff8d6b] focus:ring-3 focus:ring-[#ff8d6b]/20"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="password" className="block mb-1.5 text-sm font-medium text-gray-700">
                                        Password <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(event) => setPassword(event.target.value)}
                                            autoComplete="current-password"
                                            placeholder="Enter your password"
                                            required
                                            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 pr-12 text-sm text-gray-800 outline-none transition focus:border-[#ff8d6b] focus:ring-3 focus:ring-[#ff8d6b]/20"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((value) => !value)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            <EyeIcon closed={!showPassword} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="inline-flex items-center gap-3 text-sm text-gray-700 select-none cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={keepLoggedIn}
                                            onChange={(event) => setKeepLoggedIn(event.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <span className="grid h-5 w-5 place-items-center rounded-md border border-gray-300 bg-white text-white transition peer-checked:border-[#ff8d6b] peer-checked:bg-[#ff8d6b]">
                                            <svg
                                                className={`h-3.5 w-3.5 transition ${keepLoggedIn ? "opacity-100" : "opacity-0"}`}
                                                viewBox="0 0 20 20"
                                                fill="none"
                                                aria-hidden="true"
                                            >
                                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </span>
                                        Keep me logged in
                                    </label>
                                    <button
                                        type="button"
                                        className="text-sm text-[#ff8d6b] hover:text-[#f47852]"
                                        onClick={() => {
                                            setForgotOpen(true);
                                            setForgotMessage("");
                                            setForgotError("");
                                            setForgotEmail(email.trim() || "devops@mediatropy.com");
                                        }}
                                    >
                                        Forgot password?
                                    </button>
                                </div>

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#ff8d6b] px-4 text-sm font-semibold text-white transition hover:bg-[#f47852] disabled:opacity-70"
                                >
                                    {loading ? "Signing in..." : "Sign in"}
                                </button>
                            </div>
                        </form>

                        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
                    </div>
                </div>

                <div
                    className="relative hidden w-full overflow-hidden lg:block lg:w-1/2"
                    style={{
                        backgroundImage: "url('https://www.marriott.com/content/dam/marriott-digital/eb/emea/hws/m/mille/en_us/photo/unlimited/assets/eb-mille-edition-floating-pool-17083.jpg')",
                        backgroundPosition: "center",
                        backgroundSize: "cover"
                    }}
                >
                    <div
                        className="absolute inset-0"
                        style={{
                            background: "linear-gradient(180deg, rgba(16, 41, 60, 0.72) 0%, rgba(16, 41, 60, 0.62) 45%, rgba(16, 41, 60, 0.78) 100%)"
                        }}
                    />

                    <div className="relative z-10 mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center px-14 text-center text-white">
                        <img src="/images/logo/auth-logo.svg" alt="eDM Marriott Email Tools" className="h-12 w-auto" />
                        <div className="mt-14">
                            <h2 className="text-5xl font-semibold leading-tight">eDM Marriott<br />Email Tools</h2>
                            <p className="mt-8 max-w-md text-base text-white/90">
                                Workflow management for archive selection, template building, and proof approval cycles.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {forgotOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
                    <button
                        type="button"
                        className="absolute inset-0 bg-gray-900/45"
                        onClick={() => setForgotOpen(false)}
                        aria-label="Close forgot password modal"
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-md">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-xl font-semibold text-gray-900">Forgot password</h3>
                            <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
                                onClick={() => setForgotOpen(false)}
                                aria-label="Close modal"
                            >
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                                    <path d="M5 5L15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    <path d="M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>

                        <p className="text-sm text-gray-500">Enter your email and we will send you a reset link.</p>

                        <form className="mt-4 grid gap-3" onSubmit={handleForgotPassword}>
                            <input
                                type="email"
                                value={forgotEmail}
                                onChange={(event) => setForgotEmail(event.target.value)}
                                placeholder="you@company.com"
                                required
                            />
                            <button type="submit" className="button-primary" disabled={forgotLoading}>
                                {forgotLoading ? "Sending..." : "Send reset link"}
                            </button>
                        </form>

                        {forgotMessage && <p className="msg ok mt-3">{forgotMessage}</p>}
                        {forgotError && <p className="msg error mt-3">{forgotError}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}
