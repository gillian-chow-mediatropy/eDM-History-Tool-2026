import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api";

const DEVICES = {
    mobile: { width: 375, label: "MOBILE" },
    tablet: { width: 768, label: "TABLET" },
    desktop: { width: 1200, label: "DESKTOP" }
};

export default function PreviewPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [device, setDevice] = useState("desktop");
    const [html, setHtml] = useState("");
    const [loading, setLoading] = useState(true);
    const [copyState, setCopyState] = useState("");

    const previewUrl = String(searchParams.get("url") || "");
    const previewId = String(searchParams.get("id") || "");
    const previewName = String(searchParams.get("name") || "Email Preview");

    useEffect(() => {
        let mounted = true;

        async function loadPreviewHtml() {
            if (!previewUrl) {
                setLoading(false);
                return;
            }

            try {
                const payload = await apiRequest(`/api/fetch-html?url=${encodeURIComponent(previewUrl)}`);
                if (!mounted) return;
                setHtml(String(payload?.html || ""));
            } catch (_error) {
                if (!mounted) return;
                setHtml("");
            } finally {
                if (!mounted) return;
                setLoading(false);
            }
        }

        loadPreviewHtml();
        return () => { mounted = false; };
    }, [previewUrl]);

    const wrapperWidth = useMemo(() => DEVICES[device]?.width || DEVICES.desktop.width, [device]);

    async function copyHtml() {
        if (!html) return;
        try {
            await navigator.clipboard.writeText(html);
            setCopyState("Copied!");
            setTimeout(() => setCopyState(""), 1500);
        } catch (_error) {
            setCopyState("Copy failed");
            setTimeout(() => setCopyState(""), 1500);
        }
    }

    function goBack() {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate("/archive");
    }

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[#f0f0f0]">
            <div className="flex h-14 shrink-0 items-center justify-between gap-4 bg-[#1c1c1c] px-5 text-white">
                <div className="flex min-w-0 items-center gap-4">
                    <button type="button" className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70 hover:text-white" onClick={goBack}>
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                            <path d="M19 12H5" stroke="currentColor" strokeWidth="2" />
                            <path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        BACK
                    </button>
                    <div className="h-6 w-px bg-white/20" />
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">{previewId}</p>
                        <p className="truncate text-lg font-semibold leading-tight text-white">{previewName}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-white/15 bg-white/8">
                        {Object.keys(DEVICES).map((key) => (
                            <button
                                key={key}
                                type="button"
                                className={`px-3 py-1.5 text-xs font-semibold tracking-wide ${device === key ? "bg-white/20 text-white" : "text-white/60 hover:text-white/85"}`}
                                onClick={() => setDevice(key)}
                            >
                                {DEVICES[key].label}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="rounded border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white/80 hover:bg-white/20 disabled:opacity-50"
                        onClick={copyHtml}
                        disabled={!html}
                    >
                        {copyState || "COPY HTML"}
                    </button>

                    <a
                        href={previewUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`rounded border px-3 py-1.5 text-xs font-semibold tracking-wide ${previewUrl ? "border-white bg-white text-[#1c1c1c] hover:bg-white/90" : "cursor-not-allowed border-white/20 bg-white/10 text-white/50"}`}
                    >
                        OPEN
                    </a>
                </div>
            </div>

            <div
                className="flex-1 overflow-auto p-6"
                style={{
                    backgroundImage: "radial-gradient(circle, #d5d5d5 1px, transparent 1px)",
                    backgroundSize: "20px 20px"
                }}
            >
                {!previewUrl && (
                    <div className="mx-auto mt-20 max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
                        No preview URL provided.
                    </div>
                )}

                {!!previewUrl && (
                    <div
                        className="mx-auto flex h-[calc(100vh-128px)] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.15)]"
                        style={{ width: `${wrapperWidth}px` }}
                    >
                        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                            <div className="ml-2 truncate rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
                                {previewUrl}
                            </div>
                        </div>

                        {loading && (
                            <div className="grid flex-1 place-items-center text-sm font-semibold uppercase tracking-wider text-gray-500">
                                Loading preview...
                            </div>
                        )}

                        {!loading && (
                            <iframe
                                title={`preview-${previewId || "email"}`}
                                className="h-full w-full border-0"
                                sandbox="allow-same-origin"
                                srcDoc={html || undefined}
                                src={html ? undefined : previewUrl}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
