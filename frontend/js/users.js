// User management connected to Flask and SQLite.
const userModal = document.getElementById("userModal");
const userForm = document.getElementById("userForm");
const userTableBody = document.getElementById("userTableBody");

function openUserModal() { userModal?.classList.add("active"); }
function closeUserModal() { userModal?.classList.remove("active"); }
function userEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
}
function filterUsers() {
    const q = (document.getElementById("userSearch")?.value || "").toLowerCase();
    const role = document.getElementById("userRoleFilter")?.value || "all";
    userTableBody?.querySelectorAll("tr").forEach(row => {
        const rowRole = row.dataset.role || "";
        row.style.display = row.textContent.toLowerCase().includes(q) &&
            (role === "all" || role === rowRole) ? "" : "none";
    });
}
async function loadUsers() {
    if (!userTableBody) return;
    const result = await apiGet("/api/users");
    if (!result.success) throw new Error(result.data?.message || "Unable to load users.");
    const users = result.data?.users || [];
    userTableBody.innerHTML = users.length ? users.map(u => `<tr data-role="${userEscape(u.role || "User")}">
        <td><div class="user-info"><div class="user-table-avatar">${userEscape((u.name || "?").slice(0, 2).toUpperCase())}</div><div><strong>${userEscape(u.name)}</strong><small>${userEscape(u.email)}</small></div></div></td>
        <td>${userEscape(u.phone || "—")}</td>
        <td><span class="role-badge">${userEscape(u.role || "User")}</span></td>
        <td>${userEscape(u.created_at || "—")}</td>
        <td><span class="status">${userEscape(u.status || "Active")}</span></td>
        <td>—</td>
    </tr>`).join("") : '<tr><td colspan="6" style="text-align:center">No users found.</td></tr>';
    filterUsers();
}
document.getElementById("userSearch")?.addEventListener("input", filterUsers);
document.getElementById("userRoleFilter")?.addEventListener("change", filterUsers);
userModal?.addEventListener("click", event => {
    if (event.target === userModal) closeUserModal();
});

userForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = userForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
        const payload = {
            name: document.getElementById("userName").value.trim(),
            phone: document.getElementById("userPhone").value.trim(),
            email: document.getElementById("userEmail").value.trim(),
            role: document.getElementById("userRole").value,
            status: document.getElementById("userStatus").value,
            password: document.getElementById("userPassword").value
        };
        const result = await apiPost("/api/users", payload);
        if (!result.success) throw new Error(result.data?.message || "Unable to create user.");
        userForm.reset();
        closeUserModal();
        await loadUsers();
        alert(result.data?.message || "User created successfully.");
    } catch (error) {
        alert(`User was NOT saved: ${error.message}`);
    } finally {
        if (button) button.disabled = false;
    }
});
document.addEventListener("DOMContentLoaded", () => loadUsers().catch(error => {
    console.error(error);
    if (userTableBody) userTableBody.innerHTML =
        `<tr><td colspan="6">${userEscape(error.message)}</td></tr>`;
}));
