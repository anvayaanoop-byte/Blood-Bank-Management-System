// Blood requests: load from SQLite API and save new requests through Flask.
const requestModal = document.getElementById("requestModal");
const requestForm = document.getElementById("requestForm");
const requestTableBody = document.querySelector("#requestTable tbody");

function openRequestModal() { requestModal?.classList.add("show"); }
function closeRequestModal() { requestModal?.classList.remove("show"); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function getSavedUser() {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch (_) { return null; }
}
async function requestApi(endpoint, options = {}) {
  const user = getSavedUser();
  const headers = {"Content-Type":"application/json", ...(user?.token ? {Authorization:`Bearer ${user.token}`} : {}), ...(options.headers || {})};
  const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {...options, headers});
  let data = {}; try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}
function renderRequests(requests) {
  if (!requestTableBody) return;
  requestTableBody.innerHTML = requests.map(r => `<tr data-status="${escapeHtml(String(r.status || 'Pending').toLowerCase())}">
    <td><b>${escapeHtml(r.request_id || ('REQ' + r.id))}</b></td>
    <td><div class="person"><div class="person-avatar">${escapeHtml((r.patient_name || '?').slice(0,2).toUpperCase())}</div><div><strong>${escapeHtml(r.patient_name)}</strong><small>Patient</small></div></div></td>
    <td>${escapeHtml(r.blood_group)}</td><td>${escapeHtml(r.units)}</td><td>${escapeHtml(r.hospital)}</td><td>${escapeHtml(r.created_at || '')}</td>
    <td><span class="status">${escapeHtml(r.status || 'Pending')}</span></td><td><span>—</span></td></tr>`).join('');
  applyRequestFilters();
}
async function loadRequests() {
  try { const result = await requestApi('/api/requests'); renderRequests(result.requests || []); }
  catch (error) { console.error(error); alert(`Could not load saved requests: ${error.message}`); }
}
function applyRequestFilters() {
  const query = (document.getElementById('requestSearch')?.value || '').toLowerCase();
  const selected = (document.getElementById('requestFilter')?.value || 'all').toLowerCase();
  document.querySelectorAll('#requestTable tbody tr').forEach(row => {
    const matchText = row.textContent.toLowerCase().includes(query);
    const status = (row.dataset.status || '').toLowerCase();
    row.style.display = matchText && (selected === 'all' || status === selected) ? '' : 'none';
  });
}
document.getElementById('requestSearch')?.addEventListener('input', applyRequestFilters);
document.getElementById('requestFilter')?.addEventListener('change', applyRequestFilters);
if (requestForm) requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submitButton = requestForm.querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const payload = {
      patient_name: document.getElementById('patientName').value.trim(),
      blood_group: document.getElementById('requestBlood').value,
      units: Number(document.getElementById('requestUnits').value),
      hospital: document.getElementById('requestHospital').value.trim(),
      urgency: 'Normal',
      reason: document.getElementById('requestReason')?.value.trim() || ''
    };
    const result = await requestApi('/api/requests', {method:'POST', body:JSON.stringify(payload)});
    alert(`${result.message || 'Blood request saved'} (${result.request_id || 'saved to database'}).`);
    requestForm.reset(); closeRequestModal(); await loadRequests();
  } catch (error) { alert(`Request was NOT saved: ${error.message}`); }
  finally { if (submitButton) submitButton.disabled = false; }
});
document.addEventListener('DOMContentLoaded', loadRequests);
