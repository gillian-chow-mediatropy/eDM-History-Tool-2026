import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

export default function ProtectedRoute({ children, permission }) {
    const { user, permissions, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="center-screen">Loading session...</div>;
    }

    if (!user) {
        return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
    }

    if (permission) {
        const ok = permissions.includes("*") || permissions.includes(permission);
        if (!ok) {
            return (
                <div className="center-screen">
                    <div className="card narrow">
                        <h2>Access limited</h2>
                        <p>Your account does not have permission: <code>{permission}</code></p>
                    </div>
                </div>
            );
        }
    }

    return children;
}
