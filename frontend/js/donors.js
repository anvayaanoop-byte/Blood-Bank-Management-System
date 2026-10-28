document.addEventListener("DOMContentLoaded", () => {
    loadDonors();

    const donorForm = document.getElementById("donorForm");
    const searchInput = document.getElementById("donorSearch");
    const bloodFilter = document.getElementById("bloodFilter");

    donorForm.addEventListener("submit", addDonor);

    searchInput.addEventListener("input", filterDonors);
    bloodFilter.addEventListener("change", filterDonors);
});


async function loadDonors() {
    const result = await apiGet("/api/donors");

    if (!result.success) {
        alert(result.data.message || "Unable to load donors.");
        return;
    }

    const donors = result.data.donors || [];

    displayDonors(donors);
    updateDonorStats(donors);
}


function displayDonors(donors) {
    const tbody = document.querySelector("#donorTable tbody");

    tbody.innerHTML = "";

    if (donors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;">
                    No donors found.
                </td>
            </tr>
        `;
        return;
    }

    donors.forEach(donor => {

        const initials = getInitials(donor.name);

        const row = document.createElement("tr");

        row.setAttribute("data-group", donor.blood_group);

        row.innerHTML = `
            <td>
                <div class="person">
                    <div class="person-avatar">${initials}</div>

                    <div>
                        <strong>${escapeHTML(donor.name)}</strong>
                        <small>DON${String(donor.id).padStart(3, "0")}</small>
                    </div>
                </div>
            </td>

            <td>
                <b class="blood">
                    ${escapeHTML(donor.blood_group)}
                </b>
            </td>

            <td>
                ${escapeHTML(donor.phone || "-")}
            </td>

            <td>
                ${escapeHTML(donor.email || "-")}
            </td>

            <td>
                ${escapeHTML(donor.last_donation || "-")}
            </td>

            <td>
                <span class="status active-status">
                    ${escapeHTML(donor.status || "Active")}
                </span>
            </td>

            <td>
                <button class="action-btn">
                    ⋮
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}


async function addDonor(event) {

    event.preventDefault();

    const donorData = {
        name: document.getElementById("donorName").value.trim(),
        blood_group: document.getElementById("donorBlood").value,
        phone: document.getElementById("donorPhone").value.trim(),
        email: document.getElementById("donorEmail").value.trim()
    };

    if (!donorData.name || !donorData.blood_group ||
        !donorData.phone || !donorData.email) {

        alert("Please fill all fields.");
        return;
    }

    const result = await apiPost("/api/donors", donorData);

    if (!result.success) {
        alert(result.data.message || "Unable to add donor.");
        return;
    }

    alert("Donor added successfully!");

    document.getElementById("donorForm").reset();

    closeDonorModal();

    loadDonors();
}


function filterDonors() {

    const searchText =
        document.getElementById("donorSearch")
            .value
            .toLowerCase();

    const selectedGroup =
        document.getElementById("bloodFilter").value;

    const rows =
        document.querySelectorAll("#donorTable tbody tr");

    rows.forEach(row => {

        const text =
            row.innerText.toLowerCase();

        const group =
            row.getAttribute("data-group");

        const matchesSearch =
            text.includes(searchText);

        const matchesBlood =
            selectedGroup === "all" ||
            group === selectedGroup;

        row.style.display =
            matchesSearch && matchesBlood
                ? ""
                : "none";
    });
}


function updateDonorStats(donors) {

    const total = donors.length;

    const active =
        donors.filter(
            donor => donor.status === "Active"
        ).length;

    const thisMonth =
        donors.filter(donor => {

            if (!donor.created_at) return false;

            const date =
                new Date(donor.created_at);

            const now = new Date();

            return (
                date.getMonth() === now.getMonth() &&
                date.getFullYear() === now.getFullYear()
            );
        }).length;

    const available = active;

    const cards =
        document.querySelectorAll(".mini-card strong");

    if (cards.length >= 4) {
        cards[0].textContent = total;
        cards[1].textContent = active;
        cards[2].textContent = thisMonth;
        cards[3].textContent = available;
    }
}


function getInitials(name) {

    return name
        .split(" ")
        .map(word => word[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
}


function escapeHTML(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function openDonorModal() {
    document.getElementById("donorModal").style.display = "flex";
}


function closeDonorModal() {
    document.getElementById("donorModal").style.display = "none";
}