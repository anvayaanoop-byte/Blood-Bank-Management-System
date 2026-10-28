// Patient records are stored in SQLite through the Flask API.
const patientModal = document.getElementById("patientModal");
const patientForm = document.getElementById("patientForm");
const patientTableBody = document.querySelector("#patientTable tbody");

function openPatientModal() { patientModal?.classList.add("active"); }
function closePatientModal() { patientModal?.classList.remove("active"); }
function patientEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
}
function filterPatients() {
    const query = (document.getElementById("patientSearch")?.value || "").toLowerCase();
    const group = document.getElementById("patientBloodFilter")?.value || "all";
    patientTableBody?.querySelectorAll("tr").forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(query) &&
            (group === "all" || row.dataset.group === group) ? "" : "none";
    });
}
async function loadPatients() {
    if (!patientTableBody) return;
    const result = await apiGet("/api/patients");
    if (!result.success) throw new Error(result.data?.message || "Unable to load patients.");
    const patients = result.data?.patients || [];
    patientTableBody.innerHTML = patients.length ? patients.map(p => `<tr data-group="${patientEscape(p.blood_group || "")}">
        <td><strong>${patientEscape(p.name)}</strong><small>#${patientEscape(p.id)}</small></td>
        <td>${patientEscape(p.blood_group || "—")}</td>
        <td>${patientEscape(p.age ?? "—")}</td>
        <td>${patientEscape(p.phone || "—")}</td>
        <td>${patientEscape(p.hospital || "—")}</td>
        <td>${patientEscape(p.units_required ?? 0)}</td>
        <td><span class="status">${patientEscape(p.status || "Active")}</span></td>
        <td>—</td>
    </tr>`).join("") : '<tr><td colspan="8" style="text-align:center">No patient records yet.</td></tr>';
    filterPatients();
}
document.getElementById("patientSearch")?.addEventListener("input", filterPatients);
document.getElementById("patientBloodFilter")?.addEventListener("change", filterPatients);

patientForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = patientForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
        const payload = {
            name: document.getElementById("patientName").value.trim(),
            age: Number(document.getElementById("patientAge").value),
            blood_group: document.getElementById("patientBlood").value,
            phone: document.getElementById("patientPhone").value.trim(),
            hospital: document.getElementById("patientHospital").value.trim(),
            units_required: Number(document.getElementById("patientUnits").value || 1)
        };
        const result = await apiPost("/api/patients", payload);
        if (!result.success) throw new Error(result.data?.message || "Unable to save patient.");
        patientForm.reset();
        closePatientModal();
        await loadPatients();
        alert(result.data?.message || "Patient saved successfully.");
    } catch (error) {
        alert(`Patient was NOT saved: ${error.message}`);
    } finally {
        if (button) button.disabled = false;
    }
});
document.addEventListener("DOMContentLoaded", () => loadPatients().catch(error => {
    console.error(error);
    if (patientTableBody) patientTableBody.innerHTML =
        `<tr><td colspan="8">${patientEscape(error.message)}</td></tr>`;
}));
