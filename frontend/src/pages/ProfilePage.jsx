import { useState } from "react";
import { apiRequest } from "../api";
import { useAuth } from "../auth";

function splitFullName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ")
    };
}

export default function ProfilePage() {
    const { user, refreshSession } = useAuth();
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isEditingPersonal, setIsEditingPersonal] = useState(false);
    const [savingPersonal, setSavingPersonal] = useState(false);
    const [personalInfo, setPersonalInfo] = useState(() => splitFullName(user?.fullName));

    const fullName = String(user?.fullName || "").trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ");
    const markets = Array.isArray(user?.markets) && user.markets.length ? user.markets.join(", ") : "All markets";

    function beginEditPersonal() {
        setPersonalInfo(splitFullName(user?.fullName));
        setIsEditingPersonal(true);
    }

    function cancelEditPersonal() {
        setPersonalInfo(splitFullName(user?.fullName));
        setIsEditingPersonal(false);
    }

    async function savePersonalInfo(event) {
        event.preventDefault();
        setMessage("");
        setError("");
        try {
            setSavingPersonal(true);
            await apiRequest("/api/auth/me", {
                method: "PATCH",
                body: JSON.stringify({
                    firstName: String(personalInfo.firstName || "").trim(),
                    lastName: String(personalInfo.lastName || "").trim()
                })
            });
            await refreshSession();
            setIsEditingPersonal(false);
            setMessage("Personal information updated.");
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSavingPersonal(false);
        }
    }

    async function changeMyPassword(event) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setMessage("");
        setError("");
        try {
            await apiRequest("/api/users/password", {
                method: "POST",
                body: JSON.stringify({
                    currentPassword: String(formData.get("currentPassword") || ""),
                    newPassword: String(formData.get("newPassword") || "")
                })
            });
            event.currentTarget.reset();
            setMessage("Your password has been updated.");
            await refreshSession();
        } catch (apiError) {
            setError(apiError.message);
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>Profile</h2>
                <p>Personal account settings.</p>
            </div>

            {message && <section className="card"><p className="msg ok">{message}</p></section>}
            {error && <section className="card"><p className="msg error">{error}</p></section>}

            <section className="card">
                <div className="row-between">
                    <h3>Personal Information</h3>
                    {!isEditingPersonal ? (
                        <button type="button" className="button-secondary" onClick={beginEditPersonal}>
                            Edit
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button type="button" className="button-secondary" onClick={cancelEditPersonal} disabled={savingPersonal}>
                                Cancel
                            </button>
                            <button type="submit" form="personal-info-form" className="button-primary" disabled={savingPersonal}>
                                {savingPersonal ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    )}
                </div>

                <form id="personal-info-form" className="grid two mt-3" onSubmit={savePersonalInfo}>
                    <div>
                        <label htmlFor="profile-first-name">First Name</label>
                        <input
                            id="profile-first-name"
                            value={isEditingPersonal ? personalInfo.firstName : firstName}
                            onChange={(event) => setPersonalInfo({ ...personalInfo, firstName: event.target.value })}
                            readOnly={!isEditingPersonal}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="profile-last-name">Last Name</label>
                        <input
                            id="profile-last-name"
                            value={isEditingPersonal ? personalInfo.lastName : lastName}
                            onChange={(event) => setPersonalInfo({ ...personalInfo, lastName: event.target.value })}
                            readOnly={!isEditingPersonal}
                        />
                    </div>
                    <div>
                        <label>Email Address</label>
                        <input value={String(user?.email || "-")} readOnly />
                    </div>
                    <div>
                        <label>Role</label>
                        <input value={String(user?.role || "-")} readOnly />
                    </div>
                    <div className="md:col-span-2">
                        <label>Markets</label>
                        <input value={markets} readOnly />
                    </div>
                </form>
            </section>

            <section className="card">
                <h3>Change my password</h3>
                <form className="grid two" onSubmit={changeMyPassword}>
                    <input name="currentPassword" type="password" placeholder="Current password" required />
                    <input name="newPassword" type="password" placeholder="New password (min 8 chars)" minLength={8} required />
                    <button type="submit" className="button-primary">Update password</button>
                </form>
            </section>
        </div>
    );
}
