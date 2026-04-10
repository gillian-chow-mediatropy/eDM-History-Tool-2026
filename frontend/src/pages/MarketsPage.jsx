import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import { useAuth } from "../auth";
import SettingsModal from "../components/SettingsModal";
import DataTableControls, { DataTablePagination } from "../components/DataTableControls";
import SearchSelect from "../components/SearchSelect";

const INITIAL_FORM = {
    code: "",
    name: "",
    type: "MARKET",
    areaId: "",
    isActive: true
};
const PAGE_SIZE = 8;

function getMarketTypeLabel(type) {
    return type === "ADDITIONAL_MARKET" ? "Additional Market" : "Market";
}

export default function MarketsPage() {
    const { permissions } = useAuth();
    const canManage = useMemo(
        () => permissions.includes("*") || permissions.includes("settings:manage_users"),
        [permissions]
    );

    const [areas, setAreas] = useState([]);
    const [markets, setMarkets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [primarySearch, setPrimarySearch] = useState("");
    const [primaryPage, setPrimaryPage] = useState(1);
    const [additionalSearch, setAdditionalSearch] = useState("");
    const [additionalPage, setAdditionalPage] = useState(1);
    const [primarySort, setPrimarySort] = useState({ key: "code", direction: "asc" });
    const [additionalSort, setAdditionalSort] = useState({ key: "code", direction: "asc" });

    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState(null);
    const [form, setForm] = useState(INITIAL_FORM);

    const primaryMarkets = useMemo(
        () => markets.filter((market) => market.type === "MARKET"),
        [markets]
    );
    const additionalMarkets = useMemo(
        () => markets.filter((market) => market.type === "ADDITIONAL_MARKET"),
        [markets]
    );

    const filteredPrimaryMarkets = useMemo(() => {
        const keyword = primarySearch.trim().toLowerCase();
        if (!keyword) return primaryMarkets;
        return primaryMarkets.filter((market) => {
            const haystack = [market.code, market.name, market.areaName, market.isActive ? "yes" : "no"]
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [primaryMarkets, primarySearch]);

    const filteredAdditionalMarkets = useMemo(() => {
        const keyword = additionalSearch.trim().toLowerCase();
        if (!keyword) return additionalMarkets;
        return additionalMarkets.filter((market) => {
            const haystack = [market.code, market.name, market.areaName, market.isActive ? "yes" : "no"]
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [additionalMarkets, additionalSearch]);

    const sortedPrimaryMarkets = useMemo(() => {
        const list = [...filteredPrimaryMarkets];
        list.sort((a, b) => {
            const valueA = primarySort.key === "isActive"
                ? (a.isActive ? "yes" : "no")
                : String(a?.[primarySort.key] ?? "").toLowerCase();
            const valueB = primarySort.key === "isActive"
                ? (b.isActive ? "yes" : "no")
                : String(b?.[primarySort.key] ?? "").toLowerCase();
            if (valueA < valueB) return primarySort.direction === "asc" ? -1 : 1;
            if (valueA > valueB) return primarySort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredPrimaryMarkets, primarySort]);

    const sortedAdditionalMarkets = useMemo(() => {
        const list = [...filteredAdditionalMarkets];
        list.sort((a, b) => {
            const valueA = additionalSort.key === "isActive"
                ? (a.isActive ? "yes" : "no")
                : String(a?.[additionalSort.key] ?? "").toLowerCase();
            const valueB = additionalSort.key === "isActive"
                ? (b.isActive ? "yes" : "no")
                : String(b?.[additionalSort.key] ?? "").toLowerCase();
            if (valueA < valueB) return additionalSort.direction === "asc" ? -1 : 1;
            if (valueA > valueB) return additionalSort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredAdditionalMarkets, additionalSort]);

    const primaryPageCount = Math.max(1, Math.ceil(sortedPrimaryMarkets.length / PAGE_SIZE));
    const additionalPageCount = Math.max(1, Math.ceil(sortedAdditionalMarkets.length / PAGE_SIZE));

    const pagedPrimaryMarkets = useMemo(() => {
        const safePage = Math.min(primaryPage, primaryPageCount);
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedPrimaryMarkets.slice(start, start + PAGE_SIZE);
    }, [sortedPrimaryMarkets, primaryPage, primaryPageCount]);

    const pagedAdditionalMarkets = useMemo(() => {
        const safePage = Math.min(additionalPage, additionalPageCount);
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedAdditionalMarkets.slice(start, start + PAGE_SIZE);
    }, [sortedAdditionalMarkets, additionalPage, additionalPageCount]);

    async function loadData() {
        try {
            setLoading(true);
            const [areasPayload, marketsPayload] = await Promise.all([
                apiRequest("/api/settings/areas"),
                apiRequest("/api/settings/markets")
            ]);
            setAreas(areasPayload.areas || []);
            setMarkets(marketsPayload.markets || []);
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        setPrimaryPage(1);
    }, [primarySearch]);

    useEffect(() => {
        setAdditionalPage(1);
    }, [additionalSearch]);

    useEffect(() => {
        setPrimaryPage((current) => Math.min(current, primaryPageCount));
    }, [primaryPageCount]);

    useEffect(() => {
        setAdditionalPage((current) => Math.min(current, additionalPageCount));
    }, [additionalPageCount]);

    function resetFeedback() {
        setMessage("");
        setError("");
    }

    function openCreate(type) {
        resetFeedback();
        setForm({
            ...INITIAL_FORM,
            type
        });
        setCreateOpen(true);
    }

    function openEdit(market) {
        resetFeedback();
        setSelectedMarket(market);
        setForm({
            code: market.code || "",
            name: market.name || "",
            type: market.type || "MARKET",
            areaId: market.areaId || "",
            isActive: Boolean(market.isActive)
        });
        setEditOpen(true);
    }

    function closeModal() {
        if (saving) return;
        setCreateOpen(false);
        setEditOpen(false);
        setSelectedMarket(null);
    }

    async function createMarket(event) {
        event.preventDefault();
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest("/api/settings/markets", {
                method: "POST",
                body: JSON.stringify({
                    ...form,
                    areaId: form.areaId || null
                })
            });
            setMessage(`${getMarketTypeLabel(form.type)} created.`);
            setCreateOpen(false);
            await loadData();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function updateMarket(event) {
        event.preventDefault();
        if (!selectedMarket?.id) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/markets/${selectedMarket.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    ...form,
                    areaId: form.areaId || null
                })
            });
            setMessage(`${getMarketTypeLabel(form.type)} updated.`);
            setEditOpen(false);
            setSelectedMarket(null);
            await loadData();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    async function deleteMarket(market) {
        if (!market?.id) return;
        if (!window.confirm(`Delete ${getMarketTypeLabel(market.type).toLowerCase()} "${market.code} - ${market.name}"?`)) return;
        resetFeedback();
        try {
            setSaving(true);
            await apiRequest(`/api/settings/markets/${market.id}`, {
                method: "DELETE"
            });
            setMessage(`${getMarketTypeLabel(market.type)} deleted.`);
            await loadData();
        } catch (apiError) {
            setError(apiError.message);
        } finally {
            setSaving(false);
        }
    }

    function renderTable({
        list,
        totalCount,
        emptyText,
        searchValue,
        onSearchChange,
        page,
        pageCount,
        onPageChange,
        searchPlaceholder,
        sortState,
        onSortChange
    }) {
        function onSort(nextKey) {
            onSortChange((current) => {
                if (current.key === nextKey) {
                    return { key: nextKey, direction: current.direction === "asc" ? "desc" : "asc" };
                }
                return { key: nextKey, direction: "asc" };
            });
        }
        function sortLabel(key, label) {
            if (sortState.key !== key) return label;
            return `${label} ${sortState.direction === "asc" ? "↑" : "↓"}`;
        }

        return (
            <>
                <div className="mt-4">
                    <DataTableControls
                        searchValue={searchValue}
                        onSearchChange={onSearchChange}
                        searchPlaceholder={searchPlaceholder}
                        resultCount={list.length}
                        totalCount={totalCount}
                        page={page}
                        pageCount={pageCount}
                        onPageChange={onPageChange}
                    />
                </div>
                <div className="table-wrap mt-3">
                    <table>
                        <thead>
                            <tr>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("code")}>{sortLabel("code", "Code")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("name")}>{sortLabel("name", "Name")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("areaName")}>{sortLabel("areaName", "Area")}</button></th>
                                <th><button type="button" className="th-sort-btn" onClick={() => onSort("isActive")}>{sortLabel("isActive", "Active")}</button></th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!list.length && (
                                <tr>
                                    <td colSpan={5} className="text-center text-gray-500">{emptyText}</td>
                                </tr>
                            )}
                            {list.map((market) => (
                                <tr key={market.id}>
                                    <td>{market.code}</td>
                                    <td>{market.name}</td>
                                    <td>{market.areaName || "-"}</td>
                                    <td>{market.isActive ? "Yes" : "No"}</td>
                                    <td>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="button-secondary"
                                                onClick={() => openEdit(market)}
                                                disabled={!canManage}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="button-secondary text-error-500"
                                                onClick={() => deleteMarket(market)}
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
                <div className="mt-3">
                    <DataTablePagination
                        page={page}
                        pageCount={pageCount}
                        onPageChange={onPageChange}
                    />
                </div>
            </>
        );
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>Markets</h2>
                <p>Manage separate master tables for Markets and Additional Markets.</p>
            </div>

            {message && <section className="card"><p className="msg ok">{message}</p></section>}
            {error && <section className="card"><p className="msg error">{error}</p></section>}

            <section className="card">
                <div className="row-between">
                    <h3>Markets</h3>
                    {canManage && (
                        <button type="button" className="button-primary" onClick={() => openCreate("MARKET")}>
                            Create market
                        </button>
                    )}
                </div>
                {!canManage && <p className="msg error mt-3">You do not have permission to manage markets.</p>}
                {loading ? (
                    <p className="muted mt-3">Loading markets...</p>
                ) : renderTable({
                    list: pagedPrimaryMarkets,
                    totalCount: primaryMarkets.length,
                    emptyText: "No markets yet.",
                    searchValue: primarySearch,
                    onSearchChange: setPrimarySearch,
                    page: primaryPage,
                    pageCount: primaryPageCount,
                    onPageChange: setPrimaryPage,
                    searchPlaceholder: "Search code, market name, area...",
                    sortState: primarySort,
                    onSortChange: setPrimarySort
                })}
            </section>

            <section className="card">
                <div className="row-between">
                    <h3>Additional Markets</h3>
                    {canManage && (
                        <button type="button" className="button-primary" onClick={() => openCreate("ADDITIONAL_MARKET")}>
                            Create additional market
                        </button>
                    )}
                </div>
                {loading ? (
                    <p className="muted mt-3">Loading additional markets...</p>
                ) : renderTable({
                    list: pagedAdditionalMarkets,
                    totalCount: additionalMarkets.length,
                    emptyText: "No additional markets yet.",
                    searchValue: additionalSearch,
                    onSearchChange: setAdditionalSearch,
                    page: additionalPage,
                    pageCount: additionalPageCount,
                    onPageChange: setAdditionalPage,
                    searchPlaceholder: "Search code, additional market, area...",
                    sortState: additionalSort,
                    onSortChange: setAdditionalSort
                })}
            </section>

            <SettingsModal title={`Create ${getMarketTypeLabel(form.type)}`} open={createOpen} onClose={closeModal}>
                <form className="grid two gap-3" onSubmit={createMarket}>
                    <input
                        placeholder="Code (example: SG)"
                        value={form.code}
                        onChange={(event) => setForm({ ...form, code: event.target.value })}
                        required
                    />
                    <input
                        placeholder={`${getMarketTypeLabel(form.type)} name`}
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        required
                    />
                    <input value={getMarketTypeLabel(form.type)} readOnly />
                    <SearchSelect
                        value={form.areaId}
                        onChange={(nextAreaId) => setForm({ ...form, areaId: nextAreaId })}
                        options={[
                            { value: "", label: "No area" },
                            ...areas.map((area) => ({
                                value: area.id,
                                label: `${area.code} - ${area.name}`
                            }))
                        ]}
                        placeholder="Select area"
                    />
                    <label className="inline-check md:col-span-2">
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
                    <div className="md:col-span-2 mt-2 flex justify-end gap-2">
                        <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={saving}>
                            {saving ? "Creating..." : `Create ${getMarketTypeLabel(form.type).toLowerCase()}`}
                        </button>
                    </div>
                </form>
            </SettingsModal>

            <SettingsModal title={`Edit ${getMarketTypeLabel(form.type)}`} open={editOpen} onClose={closeModal}>
                <form className="grid two gap-3" onSubmit={updateMarket}>
                    <input
                        placeholder="Code"
                        value={form.code}
                        onChange={(event) => setForm({ ...form, code: event.target.value })}
                        required
                    />
                    <input
                        placeholder={`${getMarketTypeLabel(form.type)} name`}
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        required
                    />
                    <input value={getMarketTypeLabel(form.type)} readOnly />
                    <SearchSelect
                        value={form.areaId}
                        onChange={(nextAreaId) => setForm({ ...form, areaId: nextAreaId })}
                        options={[
                            { value: "", label: "No area" },
                            ...areas.map((area) => ({
                                value: area.id,
                                label: `${area.code} - ${area.name}`
                            }))
                        ]}
                        placeholder="Select area"
                    />
                    <label className="inline-check md:col-span-2">
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
                    <div className="md:col-span-2 mt-2 flex justify-end gap-2">
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
