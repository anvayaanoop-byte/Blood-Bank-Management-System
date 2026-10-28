/* ============================================
   Blood Bank Management System
   API Configuration and Request Functions
   ============================================ */

const API_BASE_URL = "http://127.0.0.1:5000";

// Get the current token from supported storage locations.
function getAuthToken() {
    const directToken =
        localStorage.getItem("token") ||
        localStorage.getItem("authToken");

    if (directToken) return directToken;

    try {
        const user = JSON.parse(localStorage.getItem("user") || "null");
        return user && typeof user.token === "string" ? user.token : "";
    } catch (error) {
        console.warn("Could not read saved user session.", error);
        return "";
    }
}

async function apiRequest(endpoint, options = {}) {
    try {
        const token = getAuthToken();
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {})
        };

        // Do not overwrite a caller-provided Authorization header.
        if (token && !headers.Authorization) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        let data;
        try {
            data = await response.json();
        } catch (_) {
            data = { message: "The server returned an invalid response." };
        }

        if (response.status === 401) {
            console.error("Authentication required:", data.message || data);
        } else if (!response.ok) {
            console.error("API request failed:", response.status, data);
        }

        return {
            success: response.ok,
            status: response.status,
            data
        };
    } catch (error) {
        console.error("API connection error:", error);
        return {
            success: false,
            status: 0,
            data: {
                message:
                    "Cannot connect to Flask. Make sure the backend is running at http://127.0.0.1:5000."
            }
        };
    }
}

async function apiGet(endpoint) {
    return apiRequest(endpoint, { method: "GET" });
}

async function apiPost(endpoint, data) {
    return apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(data)
    });
}

async function apiPut(endpoint, data) {
    return apiRequest(endpoint, {
        method: "PUT",
        body: JSON.stringify(data)
    });
}

async function apiDelete(endpoint) {
    return apiRequest(endpoint, { method: "DELETE" });
}
