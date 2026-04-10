import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api";
import SettingsModal from "./SettingsModal";

function extensionOf(fileName = "") {
    const dot = String(fileName).lastIndexOf(".");
    if (dot < 0) return "";
    return String(fileName).slice(dot + 1).toLowerCase();
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MediaPickerModal({
    open = false,
    onClose,
    onSelect,
    title = "Select image from Media",
    canUpload = true
}) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadInputKey, setUploadInputKey] = useState(0);
    const fileInputRef = useRef(null);

    async function loadLibrary() {
        try {
            setLoading(true);
            setError("");
            const payload = await apiRequest("/api/assets/library");
            const list = Array.isArray(payload?.items) ? payload.items : [];
            const images = list.filter((item) => String(item?.mimeType || "").toLowerCase().startsWith("image/"));
            setItems(images);
            if (!images.length) {
                setSelectedId("");
            } else if (!images.some((item) => String(item?.id || "") === String(selectedId || ""))) {
                setSelectedId(String(images[0]?.id || ""));
            }
        } catch (apiError) {
            setError(apiError.message || "Failed to load media library.");
            setItems([]);
            setSelectedId("");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!open) return;
        setSearch("");
        loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const filteredItems = useMemo(() => {
        const keyword = String(search || "").trim().toLowerCase();
        if (!keyword) return items;
        return items.filter((item) => {
            const haystack = [
                item?.fileName,
                item?.title,
                item?.altText,
                item?.url
            ].join(" ").toLowerCase();
            return haystack.includes(keyword);
        });
    }, [items, search]);

    const selectedItem = useMemo(
        () => filteredItems.find((item) => String(item?.id || "") === String(selectedId || ""))
            || items.find((item) => String(item?.id || "") === String(selectedId || ""))
            || null,
        [filteredItems, items, selectedId]
    );

    async function uploadFiles(fileList) {
        const files = Array.from(fileList || []).filter(Boolean);
        if (!files.length) return;
        try {
            setUploading(true);
            setError("");
            const formData = new FormData();
            files.forEach((file) => formData.append("files", file));
            const payload = await apiRequest("/api/assets/upload-multi", {
                method: "POST",
                body: formData
            });

            const uploaded = Array.isArray(payload?.uploaded) ? payload.uploaded : [];
            await loadLibrary();
            if (uploaded.length > 0) {
                const firstId = String(uploaded[0]?.id || "");
                if (firstId) {
                    setSelectedId(firstId);
                }
            }
            if (Number(payload?.failedCount || 0) > 0) {
                setError(`${payload.failedCount} file(s) failed to upload.`);
            }
            setUploadInputKey((current) => current + 1);
        } catch (apiError) {
            setError(apiError.message || "Upload failed.");
        } finally {
            setUploading(false);
        }
    }

    return (
        <SettingsModal title={title} open={open} onClose={onClose} maxWidthClass="max-w-5xl">
            <div className="media-picker-modal">
                <div className="media-picker-toolbar">
                    <input
                        className="data-table-search"
                        placeholder="Search media..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="button-secondary" onClick={loadLibrary} disabled={loading || uploading}>
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                        {canUpload && (
                            <>
                                <input
                                    key={uploadInputKey}
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(event) => uploadFiles(event.target.files)}
                                    style={{ display: "none" }}
                                />
                                <button
                                    type="button"
                                    className="button-secondary"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                >
                                    {uploading ? "Uploading..." : "Upload new"}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {error && <p className="msg error mt-2">{error}</p>}
                <p className="muted mt-2">Showing {filteredItems.length} of {items.length} image assets.</p>

                <div className="media-picker-body">
                    <div className="media-picker-grid-wrap">
                        {!filteredItems.length ? (
                            <div className="media-empty-state">
                                <h4>No image found</h4>
                                <p className="muted">Upload a new image or adjust search.</p>
                            </div>
                        ) : (
                            <div className="media-picker-grid">
                                {filteredItems.map((item) => {
                                    const ext = extensionOf(item.fileName || "");
                                    const isSelected = String(item?.id || "") === String(selectedId || "");
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`media-tile ${isSelected ? "is-selected" : ""}`}
                                            onClick={() => setSelectedId(String(item.id || ""))}
                                        >
                                            <div className="media-tile-preview">
                                                <img src={item.url} alt={item.altText || item.fileName || "Media"} loading="lazy" />
                                            </div>
                                            <div className="media-tile-meta">
                                                <p className="media-tile-name" title={item.fileName}>{item.fileName}</p>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="pill todo">{(ext || "file").toUpperCase()}</span>
                                                    <span className="muted">{formatBytes(item.size)}</span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <aside className="media-picker-detail">
                        <h4>Selected image</h4>
                        {!selectedItem ? (
                            <p className="muted mt-2">Select an image first.</p>
                        ) : (
                            <>
                                <div className="media-detail-preview">
                                    <img src={selectedItem.url} alt={selectedItem.altText || selectedItem.fileName || "Media"} />
                                </div>
                                <div className="grid gap-2 mt-3">
                                    <div>
                                        <label>File name</label>
                                        <input value={selectedItem.fileName || ""} readOnly />
                                    </div>
                                    <div>
                                        <label>URL</label>
                                        <input value={selectedItem.url || ""} readOnly />
                                    </div>
                                    <div>
                                        <label>Alt text</label>
                                        <input value={selectedItem.altText || ""} readOnly />
                                    </div>
                                </div>
                            </>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                            <button
                                type="button"
                                className="button-primary"
                                disabled={!selectedItem}
                                onClick={() => selectedItem && onSelect?.(selectedItem)}
                            >
                                Use selected image
                            </button>
                            <button type="button" className="button-secondary" onClick={onClose}>
                                Cancel
                            </button>
                        </div>
                    </aside>
                </div>
            </div>
        </SettingsModal>
    );
}
