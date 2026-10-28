SMART BLOOD BANK MANAGEMENT SYSTEM - UPDATED BUILD

INSTALL AND RUN (Windows / VS Code)
1. Extract this ZIP into a NEW folder. Keep your old project and database.db as backup.
2. Open the extracted BloodBankManagement folder in VS Code.
3. Open a terminal in the backend folder.
4. Install dependencies: py -m pip install -r ../requirements.txt
   If that path does not work, run: py -m pip install flask flask-cors openpyxl
5. Start backend: py app.py
6. Open frontend/index.html using VS Code Live Server.
7. Register a new account and choose an account type:
   - Donor: log in and use Appointments -> Register for Donation.
   - Hospital: log in and use Blood Requests -> Submit Request.
   - Hospital accounts can also add a blood-bank listing.
8. Submitted requests and appointments are saved to backend/database.db.
9. To show saved records, open backend/database.db in DB Browser for SQLite and refresh
   the blood_requests or appointments table after submitting a form.

AUTHENTICATION
- Log in again after installing this build so the browser stores a fresh token.
- The frontend sends Authorization: Bearer <token> for protected API requests.
- Blood request creation is allowed for Hospital/Admin/Staff/User roles.
- Donation appointment creation is allowed for Donor/Admin/Staff/User roles.
- Blood bank creation is allowed for Hospital/Admin/Staff/User roles.

IMPORTANT
- Do not overwrite your existing database until you have backed it up.
- This is a local college-project development build, not a production deployment.
- Flask's development-server warning is normal for local testing.
- Run an end-to-end test locally: register Hospital, log in, submit request; then
  register Donor, log in, book appointment; verify both records in SQLite.
