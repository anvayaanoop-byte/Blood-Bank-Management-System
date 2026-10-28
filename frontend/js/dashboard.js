
/* =========================================================
   SMART BLOOD BANK MANAGEMENT SYSTEM
   Dashboard, modules, forms, and API integration
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();
    loadLoggedInUser();
    applyRoleAccess();
    setupLogout();
    setupForms();
    setupSettings();
    setupGlobalSearch();

    // Load the section selected in the URL.
    loadModuleData(
        window.location.hash.replace("#", "") || "dashboard"
    );
});


function applyRoleAccess() {
    let user = null;
    try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch (_) {}
    if (!user) return;
    const role = String(user.role || "User");
    const requestForm = document.getElementById("requestForm");
    const appointmentForm = document.getElementById("appointmentForm");

    if (role === "Donor" && requestForm) {
        const panel = requestForm.closest(".module-panel");
        if (panel) panel.hidden = true;
    }
    if (role === "Hospital" && appointmentForm) {
        const panel = appointmentForm.closest(".module-panel");
        if (panel) panel.hidden = true;
    }

    // Prefill donation form from the logged-in donor profile when available.
    if (role === "Donor" && appointmentForm) {
        const donorName = appointmentForm.querySelector('[name="donor_name"]');
        const phone = appointmentForm.querySelector('[name="phone"]');
        const email = appointmentForm.querySelector('[name="email"]');
        if (donorName && !donorName.value) donorName.value = user.name || "";
        if (phone && !phone.value) phone.value = user.phone || "";
        if (email && !email.value) email.value = user.email || "";
    }
}

/* =========================================================
   COMMON HELPERS
   ========================================================= */

function setValue(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value ?? 0;
    }
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

function showMessage(id, message, isError = false) {
    const element = document.getElementById(id);

    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#b42318" : "#287747";
}

function getArray(result, possibleKeys) {
    if (!result || !result.success || !result.data) {
        return [];
    }

    for (const key of possibleKeys) {
        if (Array.isArray(result.data[key])) {
            return result.data[key];
        }
    }

    if (Array.isArray(result.data)) {
        return result.data;
    }

    return [];
}

function renderRows(tableId, rows, columns, emptyMessage) {
    const table = document.getElementById(tableId);

    if (!table) return;

    table.replaceChildren();

    if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");

        td.colSpan = columns.length;
        td.textContent = emptyMessage;

        tr.appendChild(td);
        table.appendChild(tr);
        return;
    }

    rows.forEach(item => {
        const tr = document.createElement("tr");

        columns.forEach(column => {
            const td = document.createElement("td");
            const value = column.value(item);

            td.textContent =
                value === null || value === undefined || value === ""
                    ? "-"
                    : String(value);

            tr.appendChild(td);
        });

        table.appendChild(tr);
    });
}

async function submitForm(form, endpoint, messageId, successMessage, afterSave) {
    form.addEventListener("submit", async event => {
        event.preventDefault();

        const submitButton = form.querySelector(
            'button[type="submit"]'
        );

        const originalText = submitButton
            ? submitButton.textContent
            : "";

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Saving...";
        }

        showMessage(messageId, "");

        try {
            const formData = new FormData(form);
            const payload = {};

            formData.forEach((value, key) => {
                payload[key] = String(value).trim();
            });

            // Send empty optional numeric IDs as null.
            if (payload.hospital_id === "") {
                payload.hospital_id = null;
            } else if (payload.hospital_id !== undefined) {
                payload.hospital_id = Number(payload.hospital_id);
            }

            if (payload.units !== undefined) {
                payload.units = Number(payload.units);
            }

            if (payload.age !== undefined && payload.age !== "") {
                payload.age = Number(payload.age);
            }

            const result = await apiPost(endpoint, payload);

            if (!result.success) {
                throw new Error(
                    result.data?.message ||
                    "The server could not save this record."
                );
            }

            showMessage(
                messageId,
                result.data?.message || successMessage
            );

            form.reset();

            if (typeof afterSave === "function") {
                await afterSave();
            }
        } catch (error) {
            console.error("Form submission error:", error);

            showMessage(
                messageId,
                error.message || "Unable to save the record.",
                true
            );
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        }
    });
}

/* =========================================================
   DASHBOARD STATISTICS
   ========================================================= */

async function loadDashboard() {
    try {
        const result = await apiGet("/api/dashboard");

        console.log("Dashboard API response:", result);

        if (!result.success) {
            console.error("Dashboard loading failed:", result.data);
            return;
        }

        const data = result.data?.data || result.data || {};

        setValue("totalDonors", data.donors);
        setValue("totalUnits", data.blood_units);
        setValue("pendingRequests", data.pending_requests);

        // Fixed: the HTML uses totalHospitals.
        setValue("totalHospitals", data.hospitals);

        // Also update this if a Patients statistic exists.
        setValue("totalPatients", data.patients);

        updateBloodInventory(data.inventory || []);
        updateBloodDistribution(data.inventory || []);
        updateRecentDonors(data.recent_donors || []);
        updateRecentRequests(data.recent_requests || []);
    } catch (error) {
        console.error("Could not load dashboard:", error);
    }
}

/* =========================================================
   INVENTORY DISPLAY
   ========================================================= */

function updateBloodInventory(inventory) {
    const chart = document.getElementById("inventoryChart");

    if (!chart) return;

    const groups = [
        "A+", "A-", "B+", "B-",
        "AB+", "AB-", "O+", "O-"
    ];

    const totalByGroup = {};

    groups.forEach(group => {
        totalByGroup[group] = 0;
    });

    inventory.forEach(item => {
        const group = item.blood_group;
        const units = Number(item.units || 0);

        if (Object.prototype.hasOwnProperty.call(totalByGroup, group)) {
            totalByGroup[group] += units;
        }
    });

    const maxUnits = Math.max(
        1,
        ...Object.values(totalByGroup)
    );

    chart.replaceChildren();

    const wrapper = document.createElement("div");

    wrapper.style.display = "grid";
    wrapper.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
    wrapper.style.gap = "14px";
    wrapper.style.padding = "12px 0";

    groups.forEach(group => {
        const units = totalByGroup[group];

        const card = document.createElement("div");
        card.style.textAlign = "center";
        card.style.minWidth = "0";

        const barArea = document.createElement("div");
        barArea.style.height = "100px";
        barArea.style.display = "flex";
        barArea.style.alignItems = "flex-end";
        barArea.style.justifyContent = "center";

        const bar = document.createElement("div");
        bar.style.width = "28px";
        bar.style.maxWidth = "100%";
        bar.style.height =
            Math.max(8, (units / maxUnits) * 85) + "px";
        bar.style.background = units > 0 ? "#c72c41" : "#f2dfe2";
        bar.style.borderRadius = "7px 7px 0 0";
        bar.title = `${group}: ${units} units`;

        barArea.appendChild(bar);

        const label = document.createElement("div");
        label.textContent = group;
        label.style.marginTop = "8px";
        label.style.fontWeight = "600";

        const count = document.createElement("div");
        count.textContent = `${units} units`;
        count.style.fontSize = "12px";
        count.style.color = "#777";

        card.append(barArea, label, count);
        wrapper.appendChild(card);
    });

    chart.appendChild(wrapper);
}

function updateBloodDistribution(inventory) {
    const center = document.querySelector(".donut-center");

    if (!center) return;

    const total = inventory.reduce(
        (sum, item) => sum + Number(item.units || 0),
        0
    );

    center.replaceChildren();

    const number = document.createElement("span");
    number.textContent = total;

    const small = document.createElement("small");
    small.textContent = "Units";

    center.append(number, small);

    const legend = document.querySelector(".distribution .legend");

    if (!legend) return;

    legend.replaceChildren();

    if (total === 0) {
        const span = document.createElement("span");
        span.textContent = "No blood available";
        legend.appendChild(span);
        return;
    }

    inventory.forEach(item => {
        const units = Number(item.units || 0);

        if (units <= 0) return;

        const percentage = Math.round((units / total) * 100);
        const span = document.createElement("span");

        span.textContent =
            `${item.blood_group}: ${units} units (${percentage}%)`;

        legend.appendChild(span);
    });
}

/* =========================================================
   DASHBOARD RECENT RECORDS
   ========================================================= */

function updateRecentDonors(donors) {
    const table = document.getElementById("recentDonorsTable");

    if (!table) return;

    table.replaceChildren();

    if (!donors.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");

        td.colSpan = 4;
        td.textContent = "No donors found.";

        tr.appendChild(td);
        table.appendChild(tr);
        return;
    }

    donors.forEach(donor => {
        const tr = document.createElement("tr");

        [
            donor.name || "-",
            donor.blood_group || "-",
            donor.phone || "-",
            donor.status || "Active"
        ].forEach(value => {
            const td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });

        table.appendChild(tr);
    });
}

function updateRecentRequests(requests) {
    const table = document.getElementById("recentRequestsTable");

    if (!table) return;

    table.replaceChildren();

    if (!requests.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");

        td.colSpan = 4;
        td.textContent = "No blood requests found.";

        tr.appendChild(td);
        table.appendChild(tr);
        return;
    }

    requests.forEach(request => {
        const tr = document.createElement("tr");

        [
            request.patient_name || "-",
            request.blood_group || "-",
            request.units ?? 0,
            request.status || "Pending"
        ].forEach(value => {
            const td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });

        table.appendChild(tr);
    });
}

/* =========================================================
   LOAD MODULE TABLES
   ========================================================= */

async function loadModuleData(sectionId) {
    try {
        switch (sectionId) {
            case "dashboard":
                await loadDashboard();
                break;

            case "donors":
                await loadDonors();
                break;

            case "inventory":
                await loadInventory();
                break;

            case "requests":
                await loadRequests();
                break;

            case "patients":
                await loadPatients();
                break;

            case "hospitals":
                await loadHospitals();
                break;

            case "camps":
                await loadCamps();
                break;

            case "users":
                await loadUsers();
                break;

            case "appointments":
                await loadAppointments();
                break;

            default:
                break;
        }
    } catch (error) {
        console.error(`Could not load ${sectionId}:`, error);
    }
}

// Make this function available to the navigation code in dashboard.html.
window.loadModuleData = loadModuleData;

async function loadDonors() {
    const result = await apiGet("/api/donors");

    if (!result.success) {
        showMessage("donorMessage", "Could not load donor records.", true);
        return;
    }

    const donors = getArray(result, ["donors"]);

    renderRows("donorsTable", donors, [
        { value: d => d.id },
        { value: d => d.name },
        { value: d => d.blood_group },
        { value: d => d.phone },
        { value: d => d.email }
    ], "No donor records found.");
}

async function loadInventory() {
    const result = await apiGet("/api/inventory");

    if (!result.success) {
        showMessage(
            "inventoryMessage",
            "Could not load inventory records.",
            true
        );
        return;
    }

    const inventory = getArray(result, ["inventory"]);

    renderRows("inventoryTable", inventory, [
        { value: d => d.blood_group },
        { value: d => d.units }
    ], "No inventory records found.");

    updateBloodInventory(inventory);
    updateBloodDistribution(inventory);

    const total = inventory.reduce(
        (sum, item) => sum + Number(item.units || 0),
        0
    );

    setValue("totalUnits", total);
}

async function loadRequests() {
    const result = await apiGet("/api/requests");

    if (!result.success) {
        showMessage("requestMessage", "Could not load requests.", true);
        return;
    }

    const requests = getArray(result, ["requests"]);

    renderRows("requestsTable", requests, [
        { value: r => r.id },
        { value: r => r.patient_name },
        { value: r => r.blood_group },
        { value: r => r.units },
        { value: r => r.hospital },
        { value: r => r.status }
    ], "No blood requests found.");
}

async function loadPatients() {
    const result = await apiGet("/api/patients");

    if (!result.success) return;

    renderRows("patientsTable", getArray(result, ["patients"]), [
        { value: p => p.id },
        { value: p => p.name || p.patient_name },
        { value: p => p.blood_group },
        { value: p => p.hospital },
        { value: p => p.contact || p.phone }
    ], "No patient records found.");
}

async function loadHospitals() {
    const result = await apiGet("/api/hospitals");

    if (!result.success) return;

    const hospitals = getArray(result, ["hospitals"]);

    renderRows("hospitalsTable", hospitals, [
        { value: h => h.id },
        { value: h => h.name },
        { value: h => h.city },
        { value: h => h.phone },
        { value: h => h.address }
    ], "No hospital records found.");

    setValue("totalHospitals", hospitals.length);
}

async function loadCamps() {
    const result = await apiGet("/api/camps");

    if (!result.success) return;

    renderRows("campsTable", getArray(result, ["camps"]), [
        { value: c => c.id },
        { value: c => c.name || c.camp_name },
        { value: c => c.date || c.camp_date },
        { value: c => c.location },
        { value: c => c.contact || c.phone }
    ], "No blood camps found.");
}

async function loadUsers() {
    const result = await apiGet("/api/users");

    if (!result.success) return;

    renderRows("usersTable", getArray(result, ["users"]), [
        { value: u => u.id },
        { value: u => u.name },
        { value: u => u.email },
        { value: u => u.role },
        { value: u => u.created_at }
    ], "No registered users found.");
}

async function loadAppointments() {
    const result = await apiGet("/api/appointments");

    if (!result.success) {
        showMessage(
            "appointmentMessage",
            "Could not load appointments.",
            true
        );
        return;
    }

    renderRows(
        "appointmentsTable",
        getArray(result, ["appointments"]),
        [
            { value: a => a.id },
            { value: a => a.donor_name },
            { value: a => a.appointment_date },
            { value: a => a.appointment_time },
            { value: a => a.blood_bank_name || a.location || a.notes || "-" },
            { value: a => a.status }
        ],
        "No appointment records found."
    );
}

/* =========================================================
   FORM SUBMISSIONS
   ========================================================= */

function setupForms() {
    const donorForm = document.getElementById("donorForm");

    if (donorForm) {
        submitForm(
            donorForm,
            "/api/donors",
            "donorMessage",
            "Donor registered successfully.",
            async () => {
                await loadDonors();
                await loadDashboard();
            }
        );
    }

    const inventoryForm = document.getElementById("inventoryForm");

    if (inventoryForm) {
        submitForm(
            inventoryForm,
            "/api/inventory",
            "inventoryMessage",
            "Blood stock added successfully.",
            async () => {
                await loadInventory();
                await loadDashboard();
            }
        );
    }

    const requestForm = document.getElementById("requestForm");

    if (requestForm) {
        submitForm(
            requestForm,
            "/api/requests",
            "requestMessage",
            "Blood request submitted successfully.",
            async () => {
                await loadRequests();
                await loadDashboard();
            }
        );
    }

    const appointmentForm =
        document.getElementById("appointmentForm");

    if (appointmentForm) {
        submitForm(
            appointmentForm,
            "/api/appointments",
            "appointmentMessage",
            "Appointment booked successfully.",
            loadAppointments
        );
    }

    const bloodBankForm =
        document.getElementById("bloodBankSearchForm");

    if (bloodBankForm) {
        bloodBankForm.addEventListener("submit", async event => {
            event.preventDefault();

            const city = new FormData(bloodBankForm)
                .get("city")
                .toString()
                .trim();

            showMessage("bloodBankMessage", "Searching...");

            try {
                const result = await apiGet(
                    "/api/blood-banks?city=" + encodeURIComponent(city)
                );

                if (!result.success) {
                    throw new Error(
                        result.data?.message || "Blood-bank search failed."
                    );
                }

                const banks = getArray(result, ["blood_banks"]);

                renderRows("bloodBanksTable", banks, [
                    { value: b => b.name },
                    { value: b => b.city },
                    { value: b => b.address },
                    { value: b => b.phone }
                ], "No blood banks found for this city.");

                showMessage(
                    "bloodBankMessage",
                    `${banks.length} blood bank(s) found.`
                );
            } catch (error) {
                showMessage(
                    "bloodBankMessage",
                    error.message || "Search failed.",
                    true
                );
            }
        });
    }

    const bloodBankRegisterForm = document.getElementById("bloodBankForm");
    if (bloodBankRegisterForm) {
        bloodBankRegisterForm.addEventListener("submit", async event => {
            event.preventDefault();
            const button = bloodBankRegisterForm.querySelector('button[type="submit"]');
            if (button) button.disabled = true;
            showMessage("bloodBankSaveMessage", "Saving blood bank...");
            const payload = Object.fromEntries(new FormData(bloodBankRegisterForm).entries());
            try {
                const result = await apiPost("/api/blood-banks", payload);
                if (!result.success) throw new Error(result.data?.message || "Could not save blood bank.");
                showMessage("bloodBankSaveMessage", result.data?.message || "Blood bank saved.");
                bloodBankRegisterForm.reset();
                const cityInput = document.querySelector('#bloodBankSearchForm [name="city"]');
                if (cityInput && payload.city) {
                    cityInput.value = payload.city;
                    document.getElementById("bloodBankSearchForm")?.requestSubmit();
                }
            } catch (error) {
                showMessage("bloodBankSaveMessage", error.message, true);
            } finally {
                if (button) button.disabled = false;
            }
        });
    }

    const reportsButton = document.getElementById("loadReportsBtn");

    if (reportsButton) {
        reportsButton.addEventListener("click", loadReports);
    }
}

/* =========================================================
   REPORTS
   ========================================================= */

async function loadReports() {
    showMessage("reportsMessage", "Loading report...");

    try {
        const result = await apiGet("/api/reports");

        if (!result.success) {
            throw new Error(
                result.data?.message || "Could not load report."
            );
        }

        const output = document.getElementById("reportsOutput");

        if (output) {
            output.textContent = JSON.stringify(result.data, null, 2);
        }

        showMessage("reportsMessage", "Report loaded successfully.");
    } catch (error) {
        showMessage(
            "reportsMessage",
            error.message || "Report loading failed.",
            true
        );
    }
}

/* =========================================================
   USER PROFILE
   ========================================================= */

function loadLoggedInUser() {
    const savedUser = localStorage.getItem("user");

    if (!savedUser) return;

    try {
        const user = JSON.parse(savedUser);

        const userName = document.getElementById("userName");
        const userRole = document.getElementById("userRole");

        if (userName) {
            userName.textContent = user.name || "User";
        }

        if (userRole) {
            userRole.textContent = user.role || "Staff";
        }
    } catch (error) {
        console.error("Invalid saved user data:", error);
    }
}

function setupLogout() {
    const logoutButton = document.getElementById("logoutBtn");

    if (!logoutButton) return;

    logoutButton.addEventListener("click", () => {
        localStorage.removeItem("user");
        window.location.href = "index.html";
    });
}

/* =========================================================
   SETTINGS
   ========================================================= */

 
function setupSettings() {
    // Notifications
    const notificationsToggle =
        document.getElementById("notificationsToggle");

    if (notificationsToggle) {
        notificationsToggle.addEventListener("change", function () {
            showMessage(
                "notificationMessage",
                this.checked
                    ? "Notifications enabled."
                    : "Notifications disabled."
            );
        });
    }

    // Preferred blood group
    const preferredBloodGroup =
        document.getElementById("preferredBloodGroup");

    if (preferredBloodGroup) {
        preferredBloodGroup.addEventListener("change", function () {
            showMessage(
                "preferenceMessage",
                this.value
                    ? `Preferred blood group: ${this.value}`
                    : "No preferred blood group selected."
            );
        });
    }

    // Edit Profile
    const editProfileButton =
        document.getElementById("editProfileBtn");

    if (editProfileButton) {
        editProfileButton.addEventListener("click", async function () {
            try {
                const savedUser = localStorage.getItem("user");

                if (!savedUser) {
                    throw new Error("Please log in again.");
                }

                const user = JSON.parse(savedUser);

                if (!user.id) {
                    throw new Error("User ID missing. Please log in again.");
                }

                const name = prompt("Enter your full name:", user.name || "");
                if (name === null) return;

                const email = prompt(
                    "Enter your email address:",
                    user.email || ""
                );
                if (email === null) return;

                const phone = prompt(
                    "Enter your phone number:",
                    user.phone || ""
                );
                if (phone === null) return;

                if (!name.trim() || !email.trim()) {
                    throw new Error("Name and email are required.");
                }

                showMessage("profileMessage", "Updating profile...");

                const result = await apiPut(
                    `/api/users/${encodeURIComponent(user.id)}`,
                    {
                        name: name.trim(),
                        email: email.trim(),
                        phone: phone.trim()
                    }
                );

                if (!result.success) {
                    throw new Error(
                        result.data?.message || "Profile update failed."
                    );
                }

                const updatedUser = {
                    ...user,
                    ...result.data.user
                };

                localStorage.setItem(
                    "user",
                    JSON.stringify(updatedUser)
                );

                const userName = document.getElementById("userName");

                if (userName) {
                    userName.textContent = updatedUser.name;
                }

                showMessage(
                    "profileMessage",
                    "Profile updated successfully."
                );

            } catch (error) {
                showMessage(
                    "profileMessage",
                    error.message || "Unable to update profile.",
                    true
                );
            }
        });
    }

    // Change Password
    const changePasswordButton =
        document.getElementById("changePasswordBtn");

    if (changePasswordButton) {
        changePasswordButton.addEventListener("click", async function () {
            try {
                const savedUser = localStorage.getItem("user");

                if (!savedUser) {
                    throw new Error("Please log in again.");
                }

                const user = JSON.parse(savedUser);

                if (!user.id) {
                    throw new Error("User ID missing. Please log in again.");
                }

                const currentPassword =
                    prompt("Enter your current password:");

                if (currentPassword === null) return;

                const newPassword =
                    prompt("Enter your new password (minimum 8 characters):");

                if (newPassword === null) return;

                const confirmPassword =
                    prompt("Confirm your new password:");

                if (confirmPassword === null) return;

                if (newPassword.length < 8) {
                    throw new Error(
                        "Password must contain at least 8 characters."
                    );
                }

                if (newPassword !== confirmPassword) {
                    throw new Error("New passwords do not match.");
                }

                if (newPassword === currentPassword) {
                    throw new Error(
                        "Choose a different password from your current one."
                    );
                }

                showMessage("securityMessage", "Changing password...");

                const result = await apiPost(
                    `/api/users/${encodeURIComponent(user.id)}/change-password`,
                    {
                        current_password: currentPassword,
                        new_password: newPassword,
                        confirm_password: confirmPassword
                    }
                );

                if (!result.success) {
                    throw new Error(
                        result.data?.message || "Password change failed."
                    );
                }

                showMessage(
                    "securityMessage",
                    "Password changed successfully."
                );

            } catch (error) {
                showMessage(
                    "securityMessage",
                    error.message || "Unable to change password.",
                    true
                );
            }
        });
    }
}


/* =========================================================
   GLOBAL TABLE SEARCH
   ========================================================= */

function setupGlobalSearch() {
    const searchInput = document.getElementById("globalSearch");

    if (!searchInput) return;

    searchInput.addEventListener("input", function () {
        const query = this.value.trim().toLowerCase();

        const activeSection = document.querySelector(
            ".page-section:not([hidden])"
        );

        if (!activeSection) return;

        activeSection.querySelectorAll("tbody tr").forEach(row => {
            row.hidden = !row.textContent.toLowerCase().includes(query);
        });
    });
}
