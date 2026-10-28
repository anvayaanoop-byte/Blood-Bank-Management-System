// Hospital management connected to Flask/SQLite.
const hospitalModal = document.getElementById("hospitalModal");
const hospitalForm = document.getElementById("hospitalForm");
const hospitalTableBody = document.getElementById("hospitalTableBody");

function openHospitalModal() { hospitalModal?.classList.add("active"); }
function closeHospitalModal() { hospitalModal?.classList.remove("active"); }
function hospitalEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function applyHospitalFilters() {
    const query = (document.getElementById("hospitalSearch")?.value || "").toLowerCase();
    const selected = (document.getElementById("hospitalStatusFilter")?.value || "all").toLowerCase();
    document.querySelectorAll("#hospitalTableBody tr").forEach(row => {
        const status = (row.dataset.status || "").toLowerCase();
        row.style.display = row.textContent.toLowerCase().includes(query) && (selected === "all" || status === selected) ? "" : "none";
    });
}
async function loadHospitals() {
    if (!hospitalTableBody) return;
    const result = await apiGet("/api/hospitals");
    if (!result.success) throw new Error(result.data?.message || "Unable to load hospitals");
    const hospitals = result.data?.hospitals || [];
    hospitalTableBody.innerHTML = hospitals.map(h => `<tr data-status="${hospitalEscape(h.status || 'Active')}">
      <td><div class="hospital-info"><div class="hospital-avatar">🏥</div><div><strong>${hospitalEscape(h.name)}</strong><small>${hospitalEscape(h.contact_person || 'Registered hospital')}</small></div></div></td>
      <td>${hospitalEscape(h.hospital_id || ('HSP' + h.id))}</td>
      <td>${hospitalEscape(h.phone || '—')}</td><td>${hospitalEscape(h.address || h.city || '—')}</td>
      <td>—</td><td><span class="hospital-status">${hospitalEscape(h.status || 'Active')}</span></td><td>—</td></tr>`).join("");
    applyHospitalFilters();
}
document.getElementById("hospitalSearch")?.addEventListener("input", applyHospitalFilters);
document.getElementById("hospitalStatusFilter")?.addEventListener("change", applyHospitalFilters);
hospitalModal?.addEventListener("click", e => { if (e.target === hospitalModal) closeHospitalModal(); });
hospitalForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = hospitalForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
        const payload = {
            name: document.getElementById("hospitalName").value.trim(),
            hospital_id: document.getElementById("hospitalId").value.trim(),
            phone: document.getElementById("hospitalPhone").value.trim(),
            email: document.getElementById("hospitalEmail").value.trim(),
            contact_person: document.getElementById("contactPerson").value.trim(),
            address: document.getElementById("hospitalAddress").value.trim()
        };
        const result = await apiPost("/api/hospitals", payload);
        if (!result.success) throw new Error(result.data?.message || "Hospital was not saved");
        alert(result.data?.message || "Hospital saved successfully.");
        hospitalForm.reset(); closeHospitalModal(); await loadHospitals();
    } catch (error) { alert(`Hospital was NOT saved: ${error.message}`); }
    finally { if (button) button.disabled = false; }
});
document.addEventListener("DOMContentLoaded", () => loadHospitals().catch(e => { console.error(e); alert(`Could not load hospitals: ${e.message}`); }));
