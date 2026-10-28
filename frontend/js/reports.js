// Reports summary backed by the Flask API.
async function loadReportSummary() {
    const result = await apiGet("/api/reports");
    if (!result.success) throw new Error(result.data?.message || "Unable to load reports");
    const r = result.data?.reports || {};
    // Update matching statistic elements when present; avoid relying on fixed sample data.
    const selectors = {
        total_donors: ["totalDonors", "reportTotalDonors"],
        total_patients: ["totalPatients", "reportTotalPatients"],
        total_hospitals: ["totalHospitals", "reportTotalHospitals"],
        total_requests: ["totalRequests", "reportTotalRequests"],
        total_blood_units: ["totalBloodUnits", "reportTotalBloodUnits"]
    };
    Object.entries(selectors).forEach(([key, ids]) => ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(r[key] ?? 0);
    }));
    return r;
}
async function generateReport() {
    try {
        const reports = await loadReportSummary();
        alert(`Report refreshed from the database.\nDonors: ${reports.total_donors ?? 0}\nPatients: ${reports.total_patients ?? 0}\nHospitals: ${reports.total_hospitals ?? 0}\nRequests: ${reports.total_requests ?? 0}\nBlood units: ${reports.total_blood_units ?? 0}`);
    } catch (error) { alert(`Report could not be loaded: ${error.message}`); }
}
async function showReport(reportName) {
    try {
        const reports = await loadReportSummary();
        const key = /donor/i.test(reportName) ? "total_donors" : /inventory|blood/i.test(reportName) ? "total_blood_units" : /request/i.test(reportName) ? "total_requests" : /hospital/i.test(reportName) ? "total_hospitals" : null;
        alert(key ? `${reportName}\nCurrent database total: ${reports[key] ?? 0}` : `${reportName}\nReport data refreshed from the database.`);
    } catch (error) { alert(`Could not load report: ${error.message}`); }
}
document.getElementById("reportPeriod")?.addEventListener("change", () => {
    loadReportSummary().catch(error => console.error("Could not refresh report summary:", error));
});
document.addEventListener("DOMContentLoaded", () => loadReportSummary().catch(error => console.error("Report summary unavailable:", error)));
