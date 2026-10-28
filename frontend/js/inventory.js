// Blood inventory: load and update SQLite-backed stock through Flask.
const stockModal = document.getElementById("stockModal");
const stockForm = document.getElementById("stockForm");
const stockTableBody = document.querySelector("#stockTable tbody");

function openStockModal() { stockModal?.classList.add("show"); }
function closeStockModal() { stockModal?.classList.remove("show"); }
function inventoryEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
}

function filterInventory() {
    const query = (document.getElementById("inventorySearch")?.value || "").toLowerCase();
    const selected = (document.getElementById("stockFilter")?.value || "all").toLowerCase();
    stockTableBody?.querySelectorAll("tr").forEach(row => {
        const textMatch = row.textContent.toLowerCase().includes(query);
        const statusMatch = selected === "all" || (row.dataset.status || "").toLowerCase() === selected;
        row.style.display = textMatch && statusMatch ? "" : "none";
    });
}

async function loadInventory() {
    if (!stockTableBody) return;
    const result = await apiGet("/api/inventory");
    if (!result.success) throw new Error(result.data?.message || "Unable to load blood inventory.");
    const rows = result.data?.inventory || [];
    stockTableBody.innerHTML = rows.length ? rows.map(item => {
        const status = item.units > 0 ? "Available" : "Unavailable";
        return `<tr data-status="${status.toLowerCase()}">
            <td><strong>${inventoryEscape(item.blood_group)}</strong></td>
            <td>${inventoryEscape(item.units)}</td>
            <td>${item.units > 0 ? "Yes" : "No"}</td>
            <td>—</td>
            <td>${inventoryEscape(item.updated_at || "—")}</td>
            <td><span class="status">${status}</span></td>
        </tr>`;
    }).join("") : '<tr><td colspan="6" style="text-align:center">No inventory records yet.</td></tr>';
    filterInventory();
}

document.getElementById("inventorySearch")?.addEventListener("input", filterInventory);
document.getElementById("stockFilter")?.addEventListener("change", filterInventory);

stockForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = stockForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
        const blood_group = document.getElementById("stockBlood").value.trim().toUpperCase();
        const units = Number(document.getElementById("stockUnits").value);
        if (!blood_group || !Number.isInteger(units) || units < 0) {
            throw new Error("Choose a blood group and enter a non-negative whole number of units.");
        }
        const result = await apiPost("/api/inventory", { blood_group, units });
        if (!result.success) throw new Error(result.data?.message || "Could not save inventory.");
        stockForm.reset();
        closeStockModal();
        await loadInventory();
        alert(result.data?.message || "Blood inventory saved.");
    } catch (error) {
        alert(`Inventory was NOT saved: ${error.message}`);
    } finally {
        if (button) button.disabled = false;
    }
});

document.addEventListener("DOMContentLoaded", () => {
    loadInventory().catch(error => {
        console.error(error);
        if (stockTableBody) stockTableBody.innerHTML =
            `<tr><td colspan="6">${inventoryEscape(error.message)}</td></tr>`;
    });
});
