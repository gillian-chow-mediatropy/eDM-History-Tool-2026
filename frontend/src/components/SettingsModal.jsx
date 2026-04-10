export default function SettingsModal({ title, open, onClose, children, maxWidthClass = "max-w-2xl" }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
            <button
                type="button"
                className="absolute inset-0 bg-gray-900/45"
                onClick={onClose}
                aria-label="Close modal backdrop"
            />
            <div className={`relative z-10 w-full ${maxWidthClass} rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-md`}>
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
