import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import { useAuth } from "../auth";
import DataTableControls, { DataTablePagination } from "../components/DataTableControls";
import SearchSelect from "../components/SearchSelect";

const ROLES = ["ADMIN", "EDITOR", "VIEWER", "APPROVER"];
const PAGE_SIZE = 8;

function normalizeMarkets(value) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || "").trim()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,\n;]+/)
        .map((v) => v.trim())
        .filter(Boolean);
}

function marketsToInput(value) {
    if (!Array.isArray(value) || !value.length) return "";
    return value.join(", ");
}

function UserModal({ title, open, onClose, children }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
            <button
                type="button"
                className="absolute inset-0 bg-gray-900/45"
                onClick={onClose}
                aria-label="Close modal backdrop"
            />
            <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-md">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
                    <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                            <path d="M5 5L15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            <path d="M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export default function AdminPage() {
    const { permissions } = useAuth();
    const [users, setUsers] = useState([]);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ key: "fullName", direction: "asc" });

    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [roleOpen, setRoleOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    const [createData, setCreateData] = useState({
        fullName: "",
        email: "",
        password: "",
        role: "EDITOR",
        markets: "",
        isActive: true
    });

    const [editData, setEditData] = useState({
        fullName: "",
        markets: "",
        isActive: true
    });

    const [roleData, setRoleData] = useState({ role: "EDITOR" });
    const [passwordData, setPasswordData] = useState({ newPassword: "" });

    const canManageUsers = useMemo(
        () => permissions.includes("*") || permissions.includes("settings:manage_users"),
        [permissions]
    );
    const roleOptionsForModal = useMemo(() => {
        if (!selectedUser?.role) return ROLES;
        return ROLES.includes(selectedUser.role)
            ? ROLES
            : [selectedUser.role, ...ROLES];
    }, [selectedUser]);

    const filteredUsers = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return users;
        return users.filter((user) => {
            const haystack = [
                user.fullName,
                user.email,
                user.role,
                user.isActive ? "yes" : "no",
                Array.isArray(user.markets) && user.markets.length ? user.markets.join(", ") : "all markets"
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [users, search]);

    const sortedUsers = useMemo(() => {
        const list = [...filteredUsers];
        list.sort((a, b) => {
            let valueA = "";
            let valueB = "";
            if (sort.key === "markets") {
                valueA = Array.isArray(a.markets) ? a.markets.join(", ").toLowerCase() : "";
                valueB = Array.isArray(b.markets) ? b.markets.join(", ").toLowerCase() : "";
            } else if (sort.key === "isActive") {
                valueA = a.isActive ? "yes" : "no";
                valueB = b.isActive ? "yes" : "no";
            } else {
                valueA = String(a?.[sort.key] ?? "").toLowerCase();
                valueB = String(b?.[sort.key] ?? "").toLowerCase();
            }
            if (valueA < valueB) return sort.direction === "asc" ? -1 : 1;
            if (valueA > valueB) return sort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredUsers, sort]);

    const pageCount = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE));
    const pagedUsers = useMemo(() => {
        const safePage = Math.min(page, pageCount);
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedUsers.slice(start, start + PAGE_SIZE);
    }, [sortedUsers, page, pageCount]);

    useEffect(() => {
        setPage(1);
    }, [search]);

    useEffect(() => {
        setPage((current) => Math.min(current, pageCount));
    }, [pageCount]);

    function onSort(nextKey) {
        setSort((current) => {
            if (current.key === nextKey) {
                return { key: nextKey, direction: current.direction === "asc" ? "desc" : "asc" };
            }
            return { key: nextKey, direction: "asc" };
        });
    }

    function sortLabel(key, label) {
        if (sort.key !== key) return label;
        return `${label} ${sort.direction === "asc" ? "↑" : "↓"}`;
    }

    async function loadUsers() {
        if (!canManageUsers) return;
        try {
            setLoading(true);
            const payload = await apiRequest("/api/users");
            setUsers(payload.users || []);
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadUsers();
    }, [canManageUsers]);

    function resetFeedback() {
        setMessage("");
        setError("");
    }

    function openCreateModal() {
        resetFeedback();
        setCreateData({
            fullName: "",
            email: "",
            password: "",
            role: "EDITOR",
            markets: "",
            isActive: true
        });
        setCreateOpen(true);
    }

    function openEditModal(user) {
        resetFeedback();
        setSelectedUser(user);
        setEditData({
            fullName: user.fullName || "",
            markets: marketsToInput(user.markets),
            isActive: Boolean(user.isActive)
        });
        setEditOpen(true);
    }

    function openRoleModal(user) {
        resetFeedback();
        setSelectedUser(user);
        setRoleData({ role: user.role || "EDITOR" });
        setRoleOpen(true);
    }

    function openPasswordModal(user) {
        resetFeedback();
        setSelectedUser(user);
        setPasswordData({ newPassword: "" });
        setPasswordOpen(true);
    }

    function closeAllModals() {
        if (saving) return;
        setCreateOpen(false);
        setEditOpen(false);
        setRoleOpen(false);
        setPasswordOpen(false);
        setSelectedUser(null);
    }

    async function createUser(event) {
        event.preventDefault();
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/users", {
                method: "POST",
                body: JSON.stringify({
                    ...createData,
                    markets: normalizeMarkets(createData.markets)
                })
            });
            setMessage("User created.");
            setCreateOpen(false);
            await loadUsers();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function editUser(event) {
        event.preventDefault();
        if (!selectedUser?.id) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/users", {
                method: "PATCH",
                body: JSON.stringify({
                    userId: selectedUser.id,
                    fullName: editData.fullName,
                    markets: normalizeMarkets(editData.markets),
                    isActive: editData.isActive
                })
            });
            setMessage("User updated.");
            setEditOpen(false);
            setSelectedUser(null);
            await loadUsers();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function changeRole(event) {
        event.preventDefault();
        if (!selectedUser?.id) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/users", {
                method: "PATCH",
                body: JSON.stringify({
                    userId: selectedUser.id,
                    role: roleData.role
                })
            });
            setMessage("Role updated.");
            setRoleOpen(false);
            setSelectedUser(null);
            await loadUsers();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function resetPassword(event) {
        event.preventDefault();
        if (!selectedUser?.id) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/users/password", {
                method: "POST",
                body: JSON.stringify({
                    userId: selectedUser.id,
                    newPassword: passwordData.newPassword
                })
            });
            setMessage("Password updated.");
            setPasswordOpen(false);
            setSelectedUser(null);
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function deleteUser(user) {
        if (!user?.id) return;
        if (!window.confirm(`Delete user "${user.email}"? This action cannot be undone.`)) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/users/${user.id}`, {
                method: "DELETE"
            });
            setMessage("User deleted.");
            await loadUsers();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>Users</h2>
                <p>User management settings only.</p>
            </div>

            {message && <section className="card"><p className="msg ok">{message}</p></section>}
            {error && <section className="card"><p className="msg error">{error}</p></section>}

            <section className="card">
                <div className="row-between">
                    <h3>Users settings</h3>
                    {canManageUsers && (
                        <button type="button" className="button-primary" onClick={openCreateModal}>
                            Create user
                        </button>
                    )}
                </div>

                {!canManageUsers && <p className="msg error mt-3">You do not have permission to manage users.</p>}

                {canManageUsers && loading && <p className="muted mt-3">Loading users...</p>}

                {canManageUsers && !loading && (
                    <div className="mt-4">
                        <DataTableControls
                            searchValue={search}
                            onSearchChange={setSearch}
                            searchPlaceholder="Search name, email, role, market..."
                            resultCount={filteredUsers.length}
                            totalCount={users.length}
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                        />
                    </div>
                )}

                {canManageUsers && !loading && (
                    <div className="table-wrap mt-3">
                        <table>
                            <thead>
                                <tr>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("fullName")}>{sortLabel("fullName", "Name")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("email")}>{sortLabel("email", "Email")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("role")}>{sortLabel("role", "Role")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("isActive")}>{sortLabel("isActive", "Active")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("markets")}>{sortLabel("markets", "Markets")}</button></th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center text-gray-500">No users created yet.</td>
                                    </tr>
                                )}
                                {pagedUsers.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.fullName}</td>
                                        <td>{row.email}</td>
                                        <td>{row.role}</td>
                                        <td>{row.isActive ? "Yes" : "No"}</td>
                                        <td>{Array.isArray(row.markets) && row.markets.length ? row.markets.join(", ") : "All markets"}</td>
                                        <td>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" className="button-secondary" onClick={() => openEditModal(row)}>
                                                    Edit
                                                </button>
                                                <button type="button" className="button-secondary" onClick={() => openRoleModal(row)}>
                                                    Change role
                                                </button>
                                                <button type="button" className="button-secondary" onClick={() => openPasswordModal(row)}>
                                                    Reset password
                                                </button>
                                                <button
                                                    type="button"
                                                    className="button-secondary text-error-500"
                                                    onClick={() => deleteUser(row)}
                                                    disabled={saving}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {canManageUsers && !loading && (
                    <div className="mt-3">
                        <DataTablePagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </section>

            <UserModal title="Create User" open={createOpen} onClose={closeAllModals}>
                <form className="grid two gap-3" onSubmit={createUser}>
                    <input
                        placeholder="Full name"
                        value={createData.fullName}
                        onChange={(event) => setCreateData({ ...createData, fullName: event.target.value })}
                        required
                    />
                    <input
                        placeholder="Email"
                        type="email"
                        value={createData.email}
                        onChange={(event) => setCreateData({ ...createData, email: event.target.value })}
                        required
                    />
                    <input
                        placeholder="Temporary password"
                        type="password"
                        minLength={8}
                        value={createData.password}
                        onChange={(event) => setCreateData({ ...createData, password: event.target.value })}
                        required
                    />
                    <SearchSelect
                        value={createData.role}
                        onChange={(nextRole) => setCreateData({ ...createData, role: nextRole })}
                        options={ROLES.map((role) => ({ value: role, label: role }))}
                    />
                    <input
                        className="md:col-span-2"
                        placeholder="Markets (comma separated)"
                        value={createData.markets}
                        onChange={(event) => setCreateData({ ...createData, markets: event.target.value })}
                    />
                    <label className="inline-check md:col-span-2">
                        <input
                            type="checkbox"
                            checked={createData.isActive}
                            onChange={(event) => setCreateData({ ...createData, isActive: event.target.checked })}
                        />
                        <span className="inline-check-box" aria-hidden="true">
                            <svg className="inline-check-icon" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        Active
                    </label>
                    <div className="md:col-span-2 mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeAllModals} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Creating..." : "Create user"}
                        </button>
                    </div>
                </form>
            </UserModal>

            <UserModal title="Edit User" open={editOpen} onClose={closeAllModals}>
                <form className="grid two gap-3" onSubmit={editUser}>
                    <input
                        className="md:col-span-2"
                        placeholder="Full name"
                        value={editData.fullName}
                        onChange={(event) => setEditData({ ...editData, fullName: event.target.value })}
                        required
                    />
                    <input
                        className="md:col-span-2"
                        placeholder="Markets (comma separated)"
                        value={editData.markets}
                        onChange={(event) => setEditData({ ...editData, markets: event.target.value })}
                    />
                    <label className="inline-check md:col-span-2">
                        <input
                            type="checkbox"
                            checked={editData.isActive}
                            onChange={(event) => setEditData({ ...editData, isActive: event.target.checked })}
                        />
                        <span className="inline-check-box" aria-hidden="true">
                            <svg className="inline-check-icon" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        Active
                    </label>
                    <div className="md:col-span-2 mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeAllModals} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save changes"}
                        </button>
                    </div>
                </form>
            </UserModal>

            <UserModal title="Change Role" open={roleOpen} onClose={closeAllModals}>
                <form className="grid gap-3" onSubmit={changeRole}>
                    <p className="muted">User: {selectedUser?.email || "-"}</p>
                    <SearchSelect
                        value={roleData.role}
                        onChange={(nextRole) => setRoleData({ role: nextRole })}
                        options={roleOptionsForModal.map((role) => ({ value: role, label: role }))}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeAllModals} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Updating..." : "Update role"}
                        </button>
                    </div>
                </form>
            </UserModal>

            <UserModal title="Reset Password" open={passwordOpen} onClose={closeAllModals}>
                <form className="grid gap-3" onSubmit={resetPassword}>
                    <p className="muted">User: {selectedUser?.email || "-"}</p>
                    <input
                        placeholder="New password (min 8 chars)"
                        type="password"
                        minLength={8}
                        value={passwordData.newPassword}
                        onChange={(event) => setPasswordData({ newPassword: event.target.value })}
                        required
                    />
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeAllModals} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Updating..." : "Reset password"}
                        </button>
                    </div>
                </form>
            </UserModal>
        </div>
    );
}
