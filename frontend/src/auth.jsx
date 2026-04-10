import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    async function refreshSession() {
        try {
            const session = await apiRequest("/api/auth/me");
            setUser(session.user || null);
            setPermissions(session.permissions || []);
            return session;
        } catch (_error) {
            setUser(null);
            setPermissions([]);
            return null;
        } finally {
            setLoading(false);
        }
    }

    async function login(email, password) {
        const session = await apiRequest("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });
        setUser(session.user || null);
        setPermissions(session.permissions || []);
        return session;
    }

    async function logout() {
        try {
            await apiRequest("/api/auth/logout", { method: "POST" });
        } catch (_error) {
            // keep UI logout path resilient even if API fails
        } finally {
            setUser(null);
            setPermissions([]);
        }
    }

    useEffect(() => {
        refreshSession();
    }, []);

    const value = useMemo(() => ({
        user,
        permissions,
        loading,
        login,
        logout,
        refreshSession
    }), [user, permissions, loading]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}
