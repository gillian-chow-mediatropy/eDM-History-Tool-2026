const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function apiRequest(path, options = {}) {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const hasBody = options.body !== undefined && options.body !== null;
    const headers = {
        ...(options.headers || {})
    };
    if (hasBody && !isFormData && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        headers,
        ...options
    });

    let data = {};
    try {
        data = await response.json();
    } catch (_e) {
        data = {};
    }

    if (!response.ok) {
        const message = data.error || `Request failed (${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return data;
}
