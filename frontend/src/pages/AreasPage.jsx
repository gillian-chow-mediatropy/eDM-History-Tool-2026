import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import { useAuth } from "../auth";
import SettingsModal from "../components/SettingsModal";
import DataTableControls, { DataTablePagination } from "../components/DataTableControls";

const INITIAL_FORM = {
    code: "",
    name: "",
    isActive: true
};
const PAGE_SIZE = 8;

export default function AreasPage() {
    const { permissions } = useAuth();
    const canManage = useMemo(
        () => permissions.includes("*") || permissions.includes("settings:manage_users"),
        [permissions]
    );

    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ key: "code", direction: "asc" });

    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [selectedArea, setSelectedArea] = useState(null);
    const [form, setForm] = useState(INITIAL_FORM);

    const filteredAreas = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return areas;
        return areas.filter((area) => {
            const haystack = [area.code, area.name, area.isActive ? "yes" : "no"]
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [areas, search]);

    const sortedAreas = useMemo(() => {
        const list = [...filteredAreas];
        list.sort((a, b) => {
            const valueA = String(a?.[sort.key] ?? "").toLowerCase();
            const valueB = String(b?.[sort.key] ?? "").toLowerCase();
            if (valueA < valueB) return sort.direction === "asc" ? -1 : 1;
            if (valueA > valueB) return sort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredAreas, sort]);

    const pageCount = Math.max(1, Math.ceil(sortedAreas.length / PAGE_SIZE));
    const pagedAreas = useMemo(() => {
        const safePage = Math.min(page, pageCount);
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedAreas.slice(start, start + PAGE_SIZE);
    }, [sortedAreas, page, pageCount]);

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

    async function loadAreas() {
        try {
            setLoading(true);
            const payload = await apiRequest("/api/settings/areas");
            setAreas(payload.areas || []);
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAreas();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [search]);

    useEffect(() => {
        setPage((current) => Math.min(current, pageCount));
    }, [pageCount]);

    function resetFeedback() {
        setMessage("");
        setError("");
    }

    function openCreate() {
        resetFeedback();
        setForm(INITIAL_FORM);
        setCreateOpen(true);
    }

    function openEdit(area) {
        resetFeedback();
        setSelectedArea(area);
        setForm({
            code: area.code || "",
            name: area.name || "",
            isActive: Boolean(area.isActive)
        });
        setEditOpen(true);
    }

    function closeModal() {
        if (saving) return;
        setCreateOpen(false);
        setEditOpen(false);
        setSelectedArea(null);
    }

    async function createArea(event) {
        event.preventDefault();
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/settings/areas", {
                method: "POST",
                body: JSON.stringify(form)
            });
            setMessage("Area created.");
            setCreateOpen(false);
            await loadAreas();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function updateArea(event) {
        event.preventDefault();
        if (!selectedArea?.id) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/areas/${selectedArea.id}`, {
                method: "PATCH",
                body: JSON.stringify(form)
            });
            setMessage("Area updated.");
            setEditOpen(false);
            setSelectedArea(null);
            await loadAreas();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function deleteArea(area) {
        if (!area?.id) return;
        if (!window.confirm(`Delete area "${area.code} - ${area.name}"?`)) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/areas/${area.id}`, {
                method: "DELETE"
            });
            setMessage("Area deleted.");
            await loadAreas();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>Areas</h2>
                <p>Manage area master list for campaign segmentation.</p>
            </div>

            {message && <section className="card"><p className="msg ok">{message}</p></section>}
            {error && <section className="card"><p className="msg error">{error}</p></section>}

            <section className="card">
                <div className="row-between">
                    <h3>Area settings</h3>
                    {canManage && (
                        <button type="button" className="button-primary" onClick={openCreate}>
                            Create area
                        </button>
                    )}
                </div>

                {!canManage && <p className="msg error mt-3">You do not have permission to manage areas.</p>}
                {loading && <p className="muted mt-3">Loading areas...</p>}

                {!loading && (
                    <div className="mt-4">
                        <DataTableControls
                            searchValue={search}
                            onSearchChange={setSearch}
                            searchPlaceholder="Search code, name, active status..."
                            resultCount={filteredAreas.length}
                            totalCount={areas.length}
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                        />
                    </div>
                )}

                {!loading && (
                    <div className="table-wrap mt-3">
                        <table>
                            <thead>
                                <tr>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("code")}>{sortLabel("code", "Code")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("name")}>{sortLabel("name", "Name")}</button></th>
                                    <th><button type="button" className="th-sort-btn" onClick={() => onSort("isActive")}>{sortLabel("isActive", "Active")}</button></th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!filteredAreas.length && (
                                    <tr>
                                        <td colSpan={4} className="text-center text-gray-500">No areas yet.</td>
                                    </tr>
                                )}
                                {pagedAreas.map((area) => (
                                    <tr key={area.id}>
                                        <td>{area.code}</td>
                                        <td>{area.name}</td>
                                        <td>{area.isActive ? "Yes" : "No"}</td>
                                        <td>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className="button-secondary"
                                                    onClick={() => openEdit(area)}
                                                    disabled={!canManage}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="button-secondary text-error-500"
                                                    onClick={() => deleteArea(area)}
                                                    disabled={!canManage || saving}
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

                {!loading && (
                    <div className="mt-3">
                        <DataTablePagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </section>

            <SettingsModal title="Create Area" open={createOpen} onClose={closeModal}>
                <form className="grid gap-3" onSubmit={createArea}>
                    <input
                        placeholder="Code (example: SKPV)"
                        value={form.code}
                        onChange={(event) => setForm({ ...form, code: event.target.value })}
                        required
                    />
                    <input
                        placeholder="Area name"
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        required
                    />
                    <label className="inline-check">
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                        />
                        <span className="inline-check-box" aria-hidden="true">
                            <svg className="inline-check-icon" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        Active
                    </label>
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Creating..." : "Create area"}
                        </button>
                    </div>
                </form>
            </SettingsModal>

            <SettingsModal title="Edit Area" open={editOpen} onClose={closeModal}>
                <form className="grid gap-3" onSubmit={updateArea}>
                    <input
                        placeholder="Code"
                        value={form.code}
                        onChange={(event) => setForm({ ...form, code: event.target.value })}
                        required
                    />
                    <input
                        placeholder="Area name"
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        required
                    />
                    <label className="inline-check">
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                        />
                        <span className="inline-check-box" aria-hidden="true">
                            <svg className="inline-check-icon" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        Active
                    </label>
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save changes"}
                        </button>
                    </div>
                </form>
            </SettingsModal>
        </div>
    );
}
