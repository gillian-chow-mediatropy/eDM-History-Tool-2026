import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ArchivePage from "./pages/ArchivePage";
import BuilderPage from "./pages/BuilderPage";
import DashboardPage from "./pages/DashboardPage";
import ProgressPage from "./pages/ProgressPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import PreviewPage from "./pages/PreviewPage";
import MarketsPage from "./pages/MarketsPage";
import AreasPage from "./pages/AreasPage";
import TemplatesPage from "./pages/TemplatesPage";
import SourceCampaignsPage from "./pages/SourceCampaignsPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import CampaignsPage from "./pages/CampaignsPage";
import MediaPage from "./pages/MediaPage";

function NotFoundPage() {
    return (
        <div className="center-screen">
            <div className="card narrow">
                <h2>Page not found</h2>
            </div>
        </div>
    );
}

function AuthenticatedApp() {
    return (
        <AppLayout>
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/progress" element={
                    <ProtectedRoute permission="settings:view">
                        <ProgressPage />
                    </ProtectedRoute>
                } />
                <Route path="/archive" element={<ArchivePage />} />
                <Route path="/builder" element={<Navigate to="/campaigns" replace />} />
                <Route path="/campaigns" element={
                    <ProtectedRoute permission="builder:view">
                        <CampaignsPage />
                    </ProtectedRoute>
                } />
                <Route path="/campaigns/:campaignId/manage" element={
                    <ProtectedRoute permission="builder:view">
                        <BuilderPage />
                    </ProtectedRoute>
                } />
                <Route path="/users" element={
                    <ProtectedRoute permission="settings:view">
                        <AdminPage />
                    </ProtectedRoute>
                } />
                <Route path="/admin" element={<Navigate to="/users" replace />} />
                <Route path="/settings/markets" element={
                    <ProtectedRoute permission="settings:view">
                        <MarketsPage />
                    </ProtectedRoute>
                } />
                <Route path="/settings/areas" element={
                    <ProtectedRoute permission="settings:view">
                        <AreasPage />
                    </ProtectedRoute>
                } />
                <Route path="/settings/templates" element={
                    <ProtectedRoute permission="settings:view">
                        <TemplatesPage />
                    </ProtectedRoute>
                } />
                <Route path="/settings/source-campaigns" element={
                    <ProtectedRoute permission="settings:view">
                        <SourceCampaignsPage />
                    </ProtectedRoute>
                } />
                <Route path="/settings/media" element={
                    <ProtectedRoute permission="settings:view">
                        <MediaPage />
                    </ProtectedRoute>
                } />
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </AppLayout>
    );
}

export default function App() {
    const { loading, user } = useAuth();

    if (loading) return <div className="center-screen">Loading...</div>;

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/preview" element={user ? <PreviewPage /> : <Navigate to="/login" replace />} />
            <Route path="/*" element={user ? <AuthenticatedApp /> : <Navigate to="/login" replace />} />
        </Routes>
    );
}
