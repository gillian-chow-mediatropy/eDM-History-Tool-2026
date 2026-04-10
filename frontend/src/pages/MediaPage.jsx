import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api";
import { useAuth } from "../auth";

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-GB");
}

function extensionOf(fileName = "") {
    const dot = String(fileName).lastIndexOf(".");
    if (dot < 0) return "";
    return String(fileName).slice(dot + 1).toLowerCase();
}

function normalizeIds(items = []) {
    return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

export default function MediaPage() {
    const { permissions } = useAuth();
    const canManage = useMemo(
        () => permissions.includes("*") || permissions.includes("settings:manage_users"),
        [permissions]
    );
    const canUpload = useMemo(
        () => permissions.includes("*") || permissions.includes("builder:edit"),
        [permissions]
    );

    const [mediaItems, setMediaItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [selectedMediaId, setSelectedMediaId] = useState("");
    const [selectedIds, setSelectedIds] = useState([]);
    const [detailDraft, setDetailDraft] = useState({ name: "", alt: "" });
    const [savingMeta, setSavingMeta] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [uploadInputKey, setUploadInputKey] = useState(0);
    const uploadInputRef = useRef(null);

    async function loadMediaLibrary() {
        try {
            setLoading(true);
            setError("");
            const payload = await apiRequest("/api/assets/library");
            const list = Array.isArray(payload?.items) ? payload.items : [];
            setMediaItems(list);

            if (!list.length) {
                setSelectedMediaId("");
                setSelectedIds([]);
                return;
            }

            const listIdSet = new Set(list.map((item) => String(item?.id || "")));
            setSelectedIds((current) => current.filter((id) => listIdSet.has(String(id || ""))));

            if (!selectedMediaId || !list.some((item) => String(item?.id || "") === String(selectedMediaId))) {
                setSelectedMediaId(String(list[0].id || ""));
            }
        } catch (apiError) {
            setError(apiError.message || "Failed to load media library.");
            setMediaItems([]);
            setSelectedMediaId("");
            setSelectedIds([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMediaLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredMedia = useMemo(() => {
        const keyword = String(search || "").trim().toLowerCase();
        return mediaItems.filter((item) => {
            const fileName = String(item?.fileName || "");
            const ext = extensionOf(fileName);
            const typeMatch = typeFilter === "all" ? true : ext === typeFilter;
            if (!typeMatch) return false;
            if (!keyword) return true;
            const haystack = [
                item?.fileName,
                item?.title,
                item?.altText,
                item?.url,
                item?.mimeType
            ].join(" ").toLowerCase();
            return haystack.includes(keyword);
        });
    }, [mediaItems, search, typeFilter]);

    const filteredIds = useMemo(
        () => normalizeIds(filteredMedia.map((item) => String(item?.id || ""))),
        [filteredMedia]
    );

    const selectedIdSet = useMemo(
        () => new Set(normalizeIds(selectedIds)),
        [selectedIds]
    );

    const selectedBulkCount = useMemo(
        () => filteredIds.filter((id) => selectedIdSet.has(id)).length,
        [filteredIds, selectedIdSet]
    );

    const allFilteredSelected = Boolean(filteredIds.length) && selectedBulkCount === filteredIds.length;

    const selectedItem = useMemo(
        () => mediaItems.find((item) => String(item?.id || "") === String(selectedMediaId || "")) || null,
        [mediaItems, selectedMediaId]
    );

    useEffect(() => {
        if (!selectedItem) {
            setDetailDraft({ name: "", alt: "" });
            return;
        }
        const baseName = String(selectedItem.fileName || "");
        setDetailDraft({
            name: String(selectedItem.title || baseName.replace(/\.[^.]+$/, "")),
            alt: String(selectedItem.altText || baseName.replace(/\.[^.]+$/, ""))
        });
    }, [selectedItem]);

    const canSaveMeta = Boolean(
        canManage
        && selectedItem
        && !savingMeta
        && !deleting
        && (
            String(detailDraft.name || "").trim() !== String(selectedItem?.title || "").trim()
            || String(detailDraft.alt || "").trim() !== String(selectedItem?.altText || "").trim()
        )
    );

    function toggleMediaSelection(id) {
        const key = String(id || "").trim();
        if (!key) return;
        setSelectedIds((current) => {
            const set = new Set(current.map((item) => String(item || "")));
            if (set.has(key)) set.delete(key);
            else set.add(key);
            return [...set];
        });
    }

    function toggleSelectAllFiltered() {
        if (!filteredIds.length) return;
        setSelectedIds((current) => {
            const set = new Set(current.map((item) => String(item || "")));
            if (allFilteredSelected) {
                filteredIds.forEach((id) => set.delete(id));
            } else {
                filteredIds.forEach((id) => set.add(id));
            }
            return [...set];
        });
    }

    async function uploadMediaFiles(fileList) {
        const files = Array.from(fileList || []).filter(Boolean);
        if (!files.length || !canUpload) return;
        try {
            setUploading(true);
            setError("");
            setMessage("");

            const formData = new FormData();
            files.forEach((file) => formData.append("files", file));
            const payload = await apiRequest("/api/assets/upload-multi", {
                method: "POST",
                body: formData
            });

            const uploaded = Array.isArray(payload?.uploaded) ? payload.uploaded : [];
            const failedCount = Number(payload?.failedCount || 0);

            await loadMediaLibrary();
            if (uploaded.length > 0) {
                setSelectedMediaId(String(uploaded[0]?.id || ""));
                setSelectedIds((current) => normalizeIds([
                    ...current,
                    ...uploaded.map((item) => String(item?.id || ""))
                ]));
            }
            if (uploaded.length > 0 && failedCount === 0) {
                setMessage(`${uploaded.length} media file(s) uploaded.`);
            } else if (uploaded.length > 0 && failedCount > 0) {
                setMessage(`${uploaded.length} uploaded, ${failedCount} failed.`);
            } else {
                setError("All uploads failed. Please verify format/size.");
            }
            setUploadInputKey((current) => current + 1);
        } catch (apiError) {
            setError(apiError.message || "Failed to upload media.");
        } finally {
            setUploading(false);
        }
    }

    async function saveMetadata() {
        if (!selectedItem?.id || !canManage) return;
        try {
            setSavingMeta(true);
            setError("");
            setMessage("");
            const payload = await apiRequest(`/api/assets/${encodeURIComponent(selectedItem.id)}`, {
                method: "PATCH",
                body: JSON.stringify({
                    title: String(detailDraft.name || "").trim(),
                    altText: String(detailDraft.alt || "").trim()
                })
            });
            const updated = payload?.item || null;
            if (updated?.id) {
                setMediaItems((current) => current.map((item) => (
                    String(item?.id || "") === String(updated.id)
                        ? { ...item, ...updated }
                        : item
                )));
            }
            setMessage("Media metadata saved.");
        } catch (apiError) {
            setError(apiError.message || "Failed to save media metadata.");
        } finally {
            setSavingMeta(false);
        }
    }

    async function deleteSelectedMedia() {
        if (!selectedItem?.id || !canManage) return;
        if (!window.confirm(`Delete media "${selectedItem.fileName}"? This removes the file from server storage.`)) return;
        try {
            setDeleting(true);
            setError("");
            setMessage("");
            await apiRequest(`/api/assets/${encodeURIComponent(selectedItem.id)}`, {
                method: "DELETE"
            });
            setMediaItems((current) => {
                const next = current.filter((item) => String(item?.id || "") !== String(selectedItem.id));
                const fallback = next[0]?.id || "";
                setSelectedMediaId(fallback ? String(fallback) : "");
                return next;
            });
            setSelectedIds((current) => current.filter((id) => String(id || "") !== String(selectedItem.id)));
            setMessage("Media deleted.");
        } catch (apiError) {
            setError(apiError.message || "Failed to delete media.");
        } finally {
            setDeleting(false);
        }
    }

    async function deleteBulkSelection() {
        if (!canManage || !selectedBulkCount) return;
        const idsToDelete = filteredIds.filter((id) => selectedIdSet.has(id));
        if (!idsToDelete.length) return;
        if (!window.confirm(`Delete ${idsToDelete.length} selected media file(s)?`)) return;
        try {
            setBulkDeleting(true);
            setError("");
            setMessage("");
            const payload = await apiRequest("/api/assets/bulk-delete", {
                method: "DELETE",
                body: JSON.stringify({ ids: idsToDelete })
            });
            const deletedIds = Array.isArray(payload?.deletedIds) ? payload.deletedIds.map((id) => String(id || "")) : [];
            const deletedSet = new Set(deletedIds);
            setMediaItems((current) => current.filter((item) => !deletedSet.has(String(item?.id || ""))));
            setSelectedIds((current) => current.filter((id) => !deletedSet.has(String(id || ""))));
            if (selectedMediaId && deletedSet.has(String(selectedMediaId))) {
                setSelectedMediaId("");
            }
            setMessage(`${deletedIds.length} media file(s) deleted.`);
        } catch (apiError) {
            setError(apiError.message || "Failed to bulk delete media.");
        } finally {
            setBulkDeleting(false);
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>Media</h2>
                <p>Manage uploaded assets for Builder (multi-upload, metadata, single delete, and bulk delete).</p>
            </div>

            {message && (
                <section className="card">
                    <p className="msg ok">{message}</p>
                </section>
            )}

            {error && (
                <section className="card">
                    <p className="msg error">{error}</p>
                </section>
            )}

            <section className="card media-library-shell">
                <div className="row-between media-toolbar-row">
                    <div className="media-toolbar-controls">
                        <input
                            className="data-table-search"
                            placeholder="Search file name, URL, type..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <select
                            value={typeFilter}
                            onChange={(event) => setTypeFilter(event.target.value)}
                            className="media-filter-select"
                        >
                            <option value="all">All types</option>
                            <option value="jpg">JPG</option>
                            <option value="jpeg">JPEG</option>
                            <option value="png">PNG</option>
                            <option value="gif">GIF</option>
                            <option value="webp">WEBP</option>
                            <option value="svg">SVG</option>
                        </select>
                    </div>
                    <div className="media-toolbar-actions">
                        <button type="button" className="button-secondary" onClick={loadMediaLibrary} disabled={loading || uploading || bulkDeleting}>
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                        {canUpload && (
                            <>
                                <input
                                    key={uploadInputKey}
                                    ref={uploadInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(event) => uploadMediaFiles(event.target.files)}
                                    style={{ display: "none" }}
                                />
                                <button
                                    type="button"
                                    className="button-secondary"
                                    onClick={() => uploadInputRef.current?.click()}
                                    disabled={uploading || bulkDeleting}
                                >
                                    {uploading ? "Uploading..." : "Upload media"}
                                </button>
                            </>
                        )}
                        {canManage && (
                            <button
                                type="button"
                                className={`button-secondary text-error-500 ${bulkDeleting ? "is-loading" : ""}`}
                                onClick={deleteBulkSelection}
                                disabled={!selectedBulkCount || bulkDeleting || deleting || savingMeta || loading}
                            >
                                {bulkDeleting ? "Deleting..." : `Delete selected (${selectedBulkCount})`}
                            </button>
                        )}
                    </div>
                </div>

                <div className="row-between mt-2">
                    <p className="muted">Showing {filteredMedia.length} of {mediaItems.length} assets.</p>
                    {canManage && (
                        <button
                            type="button"
                            className="button-secondary"
                            onClick={toggleSelectAllFiltered}
                            disabled={!filteredMedia.length || loading}
                        >
                            {allFilteredSelected ? "Unselect all filtered" : "Select all filtered"}
                        </button>
                    )}
                </div>

                {loading ? (
                    <p className="muted mt-4">Loading media library...</p>
                ) : (
                    <div className="media-library-layout">
                        <div className="media-gallery-grid-wrap">
                            {!filteredMedia.length ? (
                                <div className="media-empty-state">
                                    <h4>No media found</h4>
                                    <p className="muted">Upload media or adjust search/filter.</p>
                                </div>
                            ) : (
                                <div className="media-gallery-grid">
                                    {filteredMedia.map((item) => {
                                        const id = String(item.id || "");
                                        const isSelected = id === String(selectedMediaId || "");
                                        const ext = extensionOf(item.fileName || "");
                                        const isChecked = selectedIdSet.has(id);
                                        return (
                                            <article
                                                key={item.id}
                                                className={`media-tile ${isSelected ? "is-selected" : ""}`}
                                            >
                                                <button
                                                    type="button"
                                                    className="media-tile-preview"
                                                    onClick={() => setSelectedMediaId(id)}
                                                >
                                                    <img src={item.url} alt={item.fileName || "Media asset"} loading="lazy" />
                                                </button>
                                                <div className="media-tile-meta">
                                                    <p className="media-tile-name" title={item.fileName}>{item.fileName}</p>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="pill todo">{(ext || "file").toUpperCase()}</span>
                                                        <span className="muted">{formatBytes(item.size)}</span>
                                                    </div>
                                                    {canManage && (
                                                        <button
                                                            type="button"
                                                            className={`media-tile-check ${isChecked ? "is-checked" : ""}`}
                                                            onClick={() => toggleMediaSelection(id)}
                                                        >
                                                            {isChecked ? "✓" : ""}
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <aside className="media-detail-drawer">
                            <h3>Asset details</h3>
                            {!selectedItem ? (
                                <p className="muted mt-2">Select an asset to view details.</p>
                            ) : (
                                <>
                                    <div className="media-detail-preview">
                                        <img src={selectedItem.url} alt={selectedItem.fileName || "Media"} />
                                    </div>

                                    <div className="grid gap-3 mt-3">
                                        <div>
                                            <label>File name</label>
                                            <input
                                                value={detailDraft.name}
                                                onChange={(event) => setDetailDraft((current) => ({ ...current, name: event.target.value }))}
                                                disabled={!canManage || savingMeta || deleting}
                                            />
                                        </div>
                                        <div>
                                            <label>Alt text</label>
                                            <input
                                                value={detailDraft.alt}
                                                onChange={(event) => setDetailDraft((current) => ({ ...current, alt: event.target.value }))}
                                                disabled={!canManage || savingMeta || deleting}
                                            />
                                        </div>
                                        <div>
                                            <label>Media URL</label>
                                            <input value={selectedItem.url || ""} readOnly />
                                        </div>
                                        <div className="grid two">
                                            <div>
                                                <label>Size</label>
                                                <input value={formatBytes(selectedItem.size)} readOnly />
                                            </div>
                                            <div>
                                                <label>Updated</label>
                                                <input value={formatDate(selectedItem.updatedAt)} readOnly />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className={`button-secondary ${savingMeta ? "is-loading" : ""}`}
                                            disabled={!canSaveMeta}
                                            onClick={saveMetadata}
                                        >
                                            {savingMeta ? "Saving..." : "Save metadata"}
                                        </button>
                                        <button
                                            type="button"
                                            className={`button-secondary text-error-500 ${deleting ? "is-loading" : ""}`}
                                            disabled={!canManage || deleting}
                                            onClick={deleteSelectedMedia}
                                        >
                                            {deleting ? "Deleting..." : "Delete"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </aside>
                    </div>
                )}
            </section>
        </div>
    );
}
