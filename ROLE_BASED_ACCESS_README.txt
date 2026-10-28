ROLE-BASED DASHBOARD ACCESS
===========================

Updated file: frontend/dashboard.html

Rules implemented:
- Donor: Blood Requests remains visible. Blood Inventory, Donors, Hospitals, Users, and Reports are hidden.
- Hospital: Blood Inventory, Reports, and Users are hidden.
- Staff: all sidebar sections remain visible.
- Admin/Administrator: all sidebar sections remain visible.

How role is read:
The dashboard reads localStorage key "user" (JSON object with a "role" field), or localStorage key "role" as a fallback. The role should be saved during successful login.

Important:
This is client-side navigation visibility only. To secure data, Flask API endpoints must also enforce role permissions server-side.

After extracting the ZIP, replace/use the included project folder, start Flask as usual, and open frontend/index.html with Live Server. Log out and log back in after changing roles so the session has the correct role.
