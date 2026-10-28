
from flask import Flask, jsonify, request
from flask_cors import CORS
from database import get_db_connection, init_db
from datetime import date, datetime
import os
import sqlite3
from functools import wraps
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
# Set BLOOD_BANK_SECRET_KEY to a long random secret in your environment before deployment.
app.config["SECRET_KEY"] = os.environ.get("BLOOD_BANK_SECRET_KEY", "dev-only-change-this-secret-before-deployment")
CORS(app)

# Ensure required tables and safe schema migrations exist at startup.
init_db()

_TOKEN_SALT = "blood-bank-auth-v1"
_TOKEN_MAX_AGE = 60 * 60 * 8  # 8 hours

def create_auth_token(user_id):
    serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt=_TOKEN_SALT)
    return serializer.dumps({"user_id": int(user_id)})

def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"status": "error", "message": "Authentication required. Please log in again."}), 401
        token = header.split(" ", 1)[1].strip()
        try:
            serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt=_TOKEN_SALT)
            payload = serializer.loads(token, max_age=_TOKEN_MAX_AGE)
            request.auth_user_id = int(payload["user_id"])
            # Resolve the current role/status from SQLite instead of trusting browser data.
            auth_conn = get_db_connection()
            try:
                auth_user = auth_conn.execute(
                    "SELECT role, status FROM users WHERE id = ?",
                    (request.auth_user_id,)
                ).fetchone()
            finally:
                auth_conn.close()
            if not auth_user or auth_user["status"] != "Active":
                return jsonify({"status": "error", "message": "Account is unavailable. Please log in again."}), 401
            request.auth_user_role = auth_user["role"] or "User"
        except (BadSignature, SignatureExpired, KeyError, TypeError, ValueError):
            return jsonify({"status": "error", "message": "Session expired or invalid. Please log in again."}), 401
        return view(*args, **kwargs)
    return wrapped

VALID_BLOOD_GROUPS = {
    "A+", "A-", "B+", "B-",
    "AB+", "AB-", "O+", "O-"
}


# =====================================================
# HOME AND CONNECTION TEST
# =====================================================

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "success",
        "message": "Blood Bank Management System API is running"
    })


@app.route("/api/test", methods=["GET"])
def test_api():
    return jsonify({
        "status": "success",
        "message": "Frontend and backend connection is working!"
    })


# =====================================================
# USER REGISTRATION
# =====================================================

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = str(data.get("phone", "")).strip()
    password = str(data.get("password", ""))
    requested_role = str(data.get("role", "Donor")).strip()
    role = requested_role if requested_role in ("Donor", "Hospital") else "Donor"

    if not name or not email or not password:
        return jsonify({
            "status": "error",
            "message": "Name, email and password are required"
        }), 400

    conn = get_db_connection()

    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?",
            (email,)
        ).fetchone()

        if existing:
            return jsonify({
                "status": "error",
                "message": "An account with this email already exists"
            }), 409

        if len(password) < 8:
            return jsonify({"status": "error", "message": "Password must contain at least 8 characters"}), 400

        password_hash = generate_password_hash(password)
        conn.execute("""
            INSERT INTO users (name, email, phone, password, role, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, email, phone, password_hash, role, "Active"))

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Account created successfully"
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Registration failed")
        return jsonify({
            "status": "error",
            "message": "Unable to create account. Check the users table."
        }), 500

    finally:
        conn.close()


# =====================================================
# USER LOGIN
# =====================================================

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({
            "status": "error",
            "message": "Email and password are required"
        }), 400

    conn = get_db_connection()

    try:
        user_row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user_row:
            return jsonify({"status": "error", "message": "Invalid email or password"}), 401

        stored_password = str(user_row["password"] or "")
        password_ok = False
        if stored_password.startswith("pbkdf2:") or stored_password.startswith("scrypt:"):
            try:
                password_ok = check_password_hash(stored_password, password)
            except (ValueError, TypeError):
                password_ok = False
        else:
            # One-time migration for accounts created before password hashing was added.
            password_ok = (stored_password == password)
            if password_ok:
                conn.execute("UPDATE users SET password = ? WHERE id = ?",
                             (generate_password_hash(password), user_row["id"]))
                conn.commit()

        if not password_ok:
            return jsonify({"status": "error", "message": "Invalid email or password"}), 401

        user = {key: user_row[key] for key in ("id", "name", "email", "phone", "role", "status")}
        if user["status"] != "Active":
            return jsonify({
                "status": "error",
                "message": "Your account is inactive"
            }), 403

        return jsonify({
            "status": "success",
            "message": "Login successful",
            "user": user,
            "token": create_auth_token(user["id"])
        })

    except Exception:
        app.logger.exception("Login failed")
        return jsonify({
            "status": "error",
            "message": "Unable to log in"
        }), 500

    finally:
        conn.close()


# =====================================================
# USERS
# =====================================================

@app.route("/api/users", methods=["POST"])
@require_auth
def create_user():
    """Create a staff account from the user-management screen."""
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = str(data.get("phone", "")).strip()
    password = str(data.get("password", ""))
    role = str(data.get("role", "Staff")).strip() or "Staff"
    status = str(data.get("status", "Active")).strip() or "Active"

    if not name or not email or "@" not in email or len(password) < 8:
        return jsonify({"status": "error", "message": "Name, valid email and password (at least 8 characters) are required."}), 400

    if role not in ("User", "Staff", "Admin"):
        return jsonify({"status": "error", "message": "Invalid role."}), 400
    if status not in ("Active", "Inactive"):
        return jsonify({"status": "error", "message": "Invalid status."}), 400

    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT INTO users (name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)",
            (name, email, phone, generate_password_hash(password), role, status)
        )
        conn.commit()
        return jsonify({"status": "success", "message": "User created successfully."}), 201
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({"status": "error", "message": "An account with this email already exists."}), 409
    except Exception:
        conn.rollback()
        app.logger.exception("Creating user failed")
        return jsonify({"status": "error", "message": "Unable to create user."}), 500
    finally:
        conn.close()


@app.route("/api/users", methods=["GET"])
@require_auth
def get_users():
    conn = get_db_connection()

    try:
        rows = conn.execute("""
            SELECT id, name, email, phone, role, status, created_at
            FROM users
            ORDER BY id DESC
        """).fetchall()

        return jsonify({
            "status": "success",
            "users": [dict(row) for row in rows]
        })

    finally:
        conn.close()


@app.route("/api/users/<int:user_id>", methods=["GET"])
@require_auth
def get_user(user_id):
    conn = get_db_connection()

    try:
        user_columns = {item[1] for item in conn.execute("PRAGMA table_info(users)").fetchall()}
        select_address = ", address" if "address" in user_columns else ""
        row = conn.execute(f"""
            SELECT id, name, email, phone, role, status, created_at{select_address}
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if not row:
            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404

        return jsonify({
            "status": "success",
            "user": dict(row)
        })

    finally:
        conn.close()


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@require_auth
def update_user(user_id):
    if request.auth_user_id != user_id:
        return jsonify({"status": "error", "message": "You may update only your own profile."}), 403
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = str(data.get("phone", "")).strip()
    address = str(data.get("address", "")).strip()
    if not name or not email or "@" not in email:
        return jsonify({"status": "error", "message": "A valid name and email are required."}), 400
    conn = get_db_connection()
    try:
        duplicate = conn.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, user_id)).fetchone()
        if duplicate:
            return jsonify({"status": "error", "message": "That email is already used by another account."}), 409
        user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "address" in user_columns:
            cur = conn.execute("UPDATE users SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?", (name, email, phone, address, user_id))
        else:
            cur = conn.execute("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?", (name, email, phone, user_id))
        if cur.rowcount == 0:
            return jsonify({"status": "error", "message": "User not found."}), 404
        conn.commit()
        user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        select_address = ", address" if "address" in user_columns else ""
        row = conn.execute(f"SELECT id, name, email, phone, role, status{select_address} FROM users WHERE id = ?", (user_id,)).fetchone()
        return jsonify({"status": "success", "message": "Profile updated successfully.", "user": dict(row)})
    except Exception:
        conn.rollback()
        app.logger.exception("Profile update failed")
        return jsonify({"status": "error", "message": "Unable to update profile."}), 500
    finally:
        conn.close()

@app.route("/api/users/<int:user_id>/change-password", methods=["POST"])
@require_auth
def change_password(user_id):
    if request.auth_user_id != user_id:
        return jsonify({"status": "error", "message": "You may change only your own password."}), 403
    data = request.get_json(silent=True) or {}
    current_password = str(data.get("current_password", ""))
    new_password = str(data.get("new_password", ""))
    confirm_password = str(data.get("confirm_password", ""))
    if len(new_password) < 8:
        return jsonify({"status": "error", "message": "New password must contain at least 8 characters."}), 400
    if new_password != confirm_password:
        return jsonify({"status": "error", "message": "New passwords do not match."}), 400
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT password FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return jsonify({"status": "error", "message": "User not found."}), 404
        stored = str(row["password"] or "")
        if stored.startswith("pbkdf2:") or stored.startswith("scrypt:"):
            try:
                valid = check_password_hash(stored, current_password)
            except (ValueError, TypeError):
                valid = False
        else:
            valid = stored == current_password
        if not valid:
            return jsonify({"status": "error", "message": "Current password is incorrect."}), 400
        if current_password == new_password:
            return jsonify({"status": "error", "message": "Choose a different password."}), 400
        conn.execute("UPDATE users SET password = ? WHERE id = ?", (generate_password_hash(new_password), user_id))
        conn.commit()
        return jsonify({"status": "success", "message": "Password changed successfully."})
    except Exception:
        conn.rollback()
        app.logger.exception("Password change failed")
        return jsonify({"status": "error", "message": "Unable to change password."}), 500
    finally:
        conn.close()


# =====================================================
# ADD AND VIEW DONORS
# =====================================================

@app.route("/api/donors", methods=["POST"])
@require_auth
def add_donor():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    blood_group = str(data.get("blood_group", "")).strip().upper()

    if not name or blood_group not in VALID_BLOOD_GROUPS:
        return jsonify({
            "status": "error",
            "message": "Name and a valid blood group are required"
        }), 400

    conn = get_db_connection()

    try:
        cursor = conn.execute("""
            INSERT INTO donors
                (name, age, gender, blood_group, phone,
                 email, address, last_donation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            name,
            data.get("age"),
            data.get("gender"),
            blood_group,
            data.get("phone"),
            data.get("email"),
            data.get("address"),
            data.get("last_donation")
        ))

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Donor added successfully",
            "donor_id": cursor.lastrowid
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Adding donor failed")
        return jsonify({
            "status": "error",
            "message": "Unable to add donor. Check the donors table."
        }), 500

    finally:
        conn.close()


@app.route("/api/donors", methods=["GET"])
@require_auth
def get_donors():
    conn = get_db_connection()

    try:
        rows = conn.execute("""
            SELECT *
            FROM donors
            ORDER BY id DESC
        """).fetchall()

        return jsonify({
            "status": "success",
            "donors": [dict(row) for row in rows]
        })

    finally:
        conn.close()


# =====================================================
# BLOOD INVENTORY
# =====================================================

@app.route("/api/inventory", methods=["GET"])
@require_auth
def get_inventory():
    conn = get_db_connection()

    try:
        rows = conn.execute("""
            SELECT *
            FROM blood_inventory
            ORDER BY blood_group
        """).fetchall()

        return jsonify({
            "status": "success",
            "inventory": [dict(row) for row in rows]
        })

    finally:
        conn.close()


@app.route("/api/inventory", methods=["POST"])
@require_auth
def add_inventory():
    data = request.get_json(silent=True) or {}

    blood_group = str(
        data.get("blood_group", "")
    ).strip().upper()

    try:
        units = int(data.get("units", 0))
    except (TypeError, ValueError):
        return jsonify({
            "status": "error",
            "message": "Units must be a whole number"
        }), 400

    if blood_group not in VALID_BLOOD_GROUPS:
        return jsonify({
            "status": "error",
            "message": "Enter a valid blood group"
        }), 400

    if units < 0:
        return jsonify({
            "status": "error",
            "message": "Units cannot be negative"
        }), 400

    conn = get_db_connection()

    try:
        existing = conn.execute("""
            SELECT id
            FROM blood_inventory
            WHERE blood_group = ?
        """, (blood_group,)).fetchone()

        if existing:
            conn.execute("""
                UPDATE blood_inventory
                SET units = units + ?,
                    status = CASE
                        WHEN units + ? > 0 THEN 'Available'
                        ELSE 'Unavailable'
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE blood_group = ?
            """, (units, units, blood_group))
        else:
            conn.execute("""
                INSERT INTO blood_inventory
                    (blood_group, units, status)
                VALUES (?, ?, ?)
            """, (
                blood_group,
                units,
                "Available" if units > 0 else "Unavailable"
            ))

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Blood inventory updated successfully"
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Updating inventory failed")
        return jsonify({
            "status": "error",
            "message": "Unable to update inventory"
        }), 500

    finally:
        conn.close()


# =====================================================
# NEW FEATURE: FIND BLOOD BY BLOOD GROUP
# GET /api/find-blood?blood_group=A%2B
# =====================================================

@app.route("/api/find-blood", methods=["GET"])
@require_auth
def find_blood():
    blood_group = str(
        request.args.get("blood_group", "")
    ).strip().upper()

    if blood_group not in VALID_BLOOD_GROUPS:
        return jsonify({
            "status": "error",
            "message": "Provide a valid blood group: A+, A-, B+, B-, AB+, AB-, O+, or O-"
        }), 400

    conn = get_db_connection()

    try:
        row = conn.execute("""
            SELECT blood_group, units, status, updated_at
            FROM blood_inventory
            WHERE blood_group = ?
        """, (blood_group,)).fetchone()

        if not row:
            return jsonify({
                "status": "success",
                "blood_group": blood_group,
                "units": 0,
                "results": [],
                "message": "No inventory record found for this blood group"
            })

        return jsonify({
            "status": "success",
            "blood_group": blood_group,
            "units": row["units"],
            "results": [dict(row)],
            "message": "Blood inventory found"
        })

    finally:
        conn.close()


# =====================================================
# BLOOD REQUESTS
# =====================================================

@app.route("/api/requests", methods=["POST"])
@require_auth
def add_request():
    if request.auth_user_role not in ("Hospital", "Admin", "Staff", "User"):
        return jsonify({"status": "error", "message": "Please log in with a hospital account to submit blood requests."}), 403
    data = request.get_json(silent=True) or {}

    patient_name = str(data.get("patient_name", "")).strip()
    blood_group = str(data.get("blood_group", "")).strip().upper()
    hospital = str(data.get("hospital", "")).strip()
    urgency = str(data.get("urgency", "Normal")).strip()

    try:
        units = int(data.get("units", 0))
    except (TypeError, ValueError):
        return jsonify({
            "status": "error",
            "message": "Units must be a whole number"
        }), 400

    if not patient_name or not hospital:
        return jsonify({
            "status": "error",
            "message": "Patient name and hospital are required"
        }), 400

    if blood_group not in VALID_BLOOD_GROUPS or units <= 0:
        return jsonify({
            "status": "error",
            "message": "Provide a valid blood group and positive units"
        }), 400

    conn = get_db_connection()

    try:
        next_number = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM blood_requests").fetchone()["next_id"]
        request_id = f"REQ{next_number:03d}"

        request_columns = {row[1] for row in conn.execute("PRAGMA table_info(blood_requests)").fetchall()}
        values = {
            "request_id": request_id,
            "patient_name": patient_name,
            "blood_group": blood_group,
            "units": units,
            "hospital": hospital,
            "urgency": urgency,
            "status": "Pending",
        }
        if "requested_by_user_id" in request_columns:
            values["requested_by_user_id"] = getattr(request, "auth_user_id", None)
        columns = list(values.keys())
        placeholders = ", ".join("?" for _ in columns)
        conn.execute(
            f"INSERT INTO blood_requests ({', '.join(columns)}) VALUES ({placeholders})",
            [values[column] for column in columns]
        )

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Blood request created successfully",
            "request_id": request_id
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Creating request failed")
        return jsonify({
            "status": "error",
            "message": "Unable to create blood request"
        }), 500

    finally:
        conn.close()


@app.route("/api/requests", methods=["GET"])
@require_auth
def get_requests():
    conn = get_db_connection()

    try:
        rows = conn.execute("""
            SELECT *
            FROM blood_requests
            ORDER BY id DESC
        """).fetchall()

        return jsonify({
            "status": "success",
            "requests": [dict(row) for row in rows]
        })

    finally:
        conn.close()


# =====================================================
# PATIENTS
# =====================================================

@app.route("/api/patients", methods=["POST"])
@require_auth
def add_patient():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    blood_group = str(data.get("blood_group", "")).strip().upper()

    if not name or blood_group not in VALID_BLOOD_GROUPS:
        return jsonify({
            "status": "error",
            "message": "Patient name and a valid blood group are required"
        }), 400

    conn = get_db_connection()

    try:
        cursor = conn.execute("""
            INSERT INTO patients
                (name, age, blood_group, phone, hospital,
                 units_required, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            name,
            data.get("age"),
            blood_group,
            data.get("phone"),
            data.get("hospital"),
            data.get("units_required", 1),
            "Active"
        ))

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Patient added successfully",
            "patient_id": cursor.lastrowid
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Adding patient failed")
        return jsonify({
            "status": "error",
            "message": "Unable to add patient"
        }), 500

    finally:
        conn.close()


@app.route("/api/patients", methods=["GET"])
@require_auth
def get_patients():
    conn = get_db_connection()

    try:
        rows = conn.execute("""
            SELECT *
            FROM patients
            ORDER BY id DESC
        """).fetchall()

        return jsonify({
            "status": "success",
            "patients": [dict(row) for row in rows]
        })

    finally:
        conn.close()


# =====================================================
# HOSPITALS
# =====================================================

@app.route("/api/hospitals", methods=["POST"])
@require_auth
def add_hospital():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    hospital_id = str(data.get("hospital_id", "")).strip()

    if not name or not hospital_id:
        return jsonify({
            "status": "error",
            "message": "Hospital name and ID are required"
        }), 400

    conn = get_db_connection()

    try:
        existing = conn.execute("""
            SELECT id
            FROM hospitals
            WHERE hospital_id = ?
        """, (hospital_id,)).fetchone()

        if existing:
            return jsonify({
                "status": "error",
                "message": "Hospital ID already exists"
            }), 409

        cursor = conn.execute("""
            INSERT INTO hospitals
                (hospital_id, name, phone, email, address,
                 contact_person, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            hospital_id,
            name,
            data.get("phone"),
            data.get("email"),
            data.get("address"),
            data.get("contact_person"),
            "Active"
        ))

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Hospital added successfully",
            "id": cursor.lastrowid
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Adding hospital failed")
        return jsonify({
            "status": "error",
            "message": "Unable to add hospital"
        }), 500

    finally:
        conn.close()


@app.route("/api/hospitals", methods=["GET"])
@require_auth
def get_hospitals():
    conn = get_db_connection()

    try:
        rows = conn.execute("""
            SELECT *
            FROM hospitals
            ORDER BY id DESC
        """).fetchall()

        return jsonify({
            "status": "success",
            "hospitals": [dict(row) for row in rows]
        })

    finally:
        conn.close()


# =====================================================
# BLOOD CAMPS
# =====================================================

@app.route("/api/camps", methods=["POST"])
@require_auth
def add_camp():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()

    if not name:
        return jsonify({
            "status": "error",
            "message": "Camp name is required"
        }), 400

    conn = get_db_connection()

    try:
        next_number = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM camps").fetchone()["next_id"]
        camp_id = f"CAMP{next_number:03d}"

        camp_columns = {row[1] for row in conn.execute("PRAGMA table_info(camps)").fetchall()}
        values = {
            "camp_id": camp_id,
            "name": name,
            "date": data.get("date"),
            "location": data.get("location"),
            "organizer": data.get("organizer"),
            "contact": data.get("contact"),
            "status": "Upcoming",
        }
        # Older packaged databases may have these optional dashboard columns.
        if "expected_donors" in camp_columns: values["expected_donors"] = data.get("expected_donors", 0)
        if "donors" in camp_columns: values["donors"] = 0
        if "units" in camp_columns: values["units"] = 0
        columns = list(values.keys())
        placeholders = ", ".join("?" for _ in columns)
        cursor = conn.execute(
            f"INSERT INTO camps ({', '.join(columns)}) VALUES ({placeholders})",
            [values[column] for column in columns]
        )

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Blood camp added successfully",
            "id": cursor.lastrowid,
            "camp_id": camp_id
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Adding camp failed")
        return jsonify({
            "status": "error",
            "message": "Unable to add blood camp"
        }), 500

    finally:
        conn.close()


@app.route("/api/camps", methods=["GET"])
@require_auth
def get_camps():
    conn = get_db_connection()

    try:
        rows = conn.execute("""
            SELECT *
            FROM camps
            ORDER BY id DESC
        """).fetchall()

        return jsonify({
            "status": "success",
            "camps": [dict(row) for row in rows]
        })

    finally:
        conn.close()


# =====================================================
# NEW FEATURE: BLOOD DONATION APPOINTMENTS
# POST /api/appointments
# =====================================================

@app.route("/api/appointments", methods=["POST"])
@require_auth
def create_appointment():
    if request.auth_user_role not in ("Donor", "Admin", "Staff", "User"):
        return jsonify({"status": "error", "message": "Please log in with a donor account to book a donation appointment."}), 403
    data = request.get_json(silent=True) or {}

    donor_name = str(data.get("donor_name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    email = str(data.get("email", "")).strip()
    blood_group = str(data.get("blood_group", "")).strip().upper()
    appointment_date = str(
        data.get("appointment_date", "")
    ).strip()
    appointment_time = str(
        data.get("appointment_time", "")
    ).strip()
    blood_bank_id = data.get("blood_bank_id")

    if not all([
        donor_name, phone, blood_group,
        appointment_date, appointment_time
    ]):
        return jsonify({
            "status": "error",
            "message": "Name, phone, blood group, date and time are required"
        }), 400

    if blood_group not in VALID_BLOOD_GROUPS:
        return jsonify({
            "status": "error",
            "message": "Invalid blood group"
        }), 400

    if not phone.isdigit() or not 10 <= len(phone) <= 15:
        return jsonify({
            "status": "error",
            "message": "Phone must contain 10 to 15 digits"
        }), 400

    try:
        parsed_date = date.fromisoformat(appointment_date)
        datetime.strptime(appointment_time, "%H:%M")
    except ValueError:
        return jsonify({
            "status": "error",
            "message": "Use date YYYY-MM-DD and time HH:MM"
        }), 400

    if parsed_date < date.today():
        return jsonify({
            "status": "error",
            "message": "Appointment date cannot be in the past"
        }), 400

    conn = get_db_connection()

    try:
        if blood_bank_id not in (None, ""):
            bank = conn.execute("""
                SELECT id
                FROM blood_banks
                WHERE id = ? AND status = 'Active'
            """, (blood_bank_id,)).fetchone()

            if not bank:
                return jsonify({
                    "status": "error",
                    "message": "Blood bank not found or inactive"
                }), 404

            blood_bank_id = int(blood_bank_id)
        else:
            blood_bank_id = None

        appointment_columns = {row[1] for row in conn.execute("PRAGMA table_info(appointments)").fetchall()}
        values = {
            "donor_name": donor_name,
            "phone": phone,
            "email": email or None,
            "blood_group": blood_group,
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "blood_bank_id": blood_bank_id,
            "status": "Pending",
        }
        # The base schema uses donor_id and notes; older project DBs may have
        # phone/email/blood_bank_id columns. Insert only columns that exist.
        if "notes" in appointment_columns:
            note_parts = []
            location = str(data.get("location", "")).strip()
            if email:
                note_parts.append(f"Email: {email}")
            if location:
                note_parts.append(f"Preferred location: {location}")
            if note_parts:
                values["notes"] = " | ".join(note_parts)
        values = {key: value for key, value in values.items() if key in appointment_columns}
        columns = list(values)
        placeholders = ", ".join("?" for _ in columns)
        cursor = conn.execute(
            f"INSERT INTO appointments ({', '.join(columns)}) VALUES ({placeholders})",
            [values[column] for column in columns]
        )

        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Appointment booked successfully",
            "appointment_id": cursor.lastrowid
        }), 201

    except Exception:
        conn.rollback()
        app.logger.exception("Booking appointment failed")
        return jsonify({
            "status": "error",
            "message": "Unable to book appointment. Check that the appointments table exists."
        }), 500

    finally:
        conn.close()


@app.route("/api/appointments", methods=["GET"])
@require_auth
def get_appointments():
    conn = get_db_connection()

    try:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(appointments)").fetchall()}
        selected = ["a.id", "a.donor_name", "a.blood_group", "a.appointment_date", "a.appointment_time", "a.status", "a.created_at"]
        for optional in ("phone", "email", "blood_bank_id", "notes"):
            if optional in columns:
                selected.append(f"a.{optional}")
        if "blood_bank_id" in columns:
            query = f"SELECT {', '.join(selected)}, b.name AS blood_bank_name FROM appointments AS a LEFT JOIN blood_banks AS b ON b.id = a.blood_bank_id ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC"
        else:
            query = f"SELECT {', '.join(selected)} FROM appointments AS a ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC"
        rows = conn.execute(query).fetchall()

        return jsonify({
            "status": "success",
            "appointments": [dict(row) for row in rows]
        })

    finally:
        conn.close()


# =====================================================
# NEW FEATURE: FIND ACTIVE BLOOD BANKS BY CITY
# GET /api/blood-banks?city=Taliparamba
# =====================================================

@app.route("/api/blood-banks", methods=["POST"])
@require_auth
def add_blood_bank():
    if request.auth_user_role not in ("Hospital", "Admin", "Staff", "User"):
        return jsonify({"status": "error", "message": "Please log in with a hospital or staff account to register a blood bank."}), 403
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"status": "error", "message": "Blood bank name is required."}), 400
    conn = get_db_connection()
    try:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(blood_banks)").fetchall()}
        values = {
            "name": name,
            "phone": str(data.get("phone", "")).strip() or None,
            "email": str(data.get("email", "")).strip() or None,
            "address": str(data.get("address", "")).strip() or None,
            "city": str(data.get("city", "")).strip() or None,
            "state": str(data.get("state", "")).strip() or None,
            "opening_hours": str(data.get("opening_hours", "")).strip() or None,
            "status": "Active",
        }
        values = {key: value for key, value in values.items() if key in columns}
        names = list(values)
        cur = conn.execute(
            f"INSERT INTO blood_banks ({', '.join(names)}) VALUES ({', '.join('?' for _ in names)})",
            [values[name] for name in names]
        )
        conn.commit()
        return jsonify({"status": "success", "message": "Blood bank saved successfully.", "id": cur.lastrowid}), 201
    except Exception:
        conn.rollback()
        app.logger.exception("Adding blood bank failed")
        return jsonify({"status": "error", "message": "Unable to save blood bank."}), 500
    finally:
        conn.close()


@app.route("/api/blood-banks", methods=["GET"])
@require_auth
def get_blood_banks():
    city = str(request.args.get("city", "")).strip()
    conn = get_db_connection()

    try:
        bank_columns = {row[1] for row in conn.execute("PRAGMA table_info(blood_banks)").fetchall()}
        selected = [column for column in ("id", "name", "address", "city", "phone", "opening_hours", "status") if column in bank_columns]
        select_sql = ", ".join(selected)
        if city:
            rows = conn.execute(
                f"SELECT {select_sql} FROM blood_banks WHERE status = 'Active' AND city LIKE ? ORDER BY name",
                (f"%{city}%",)
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT {select_sql} FROM blood_banks WHERE status = 'Active' ORDER BY city, name"
            ).fetchall()

        return jsonify({
            "status": "success",
            "blood_banks": [dict(row) for row in rows]
        })

    finally:
        conn.close()


# =====================================================
# DASHBOARD
# =====================================================

@app.route("/api/dashboard", methods=["GET"])
@require_auth
def dashboard():
    conn = get_db_connection()

    try:
        donors = conn.execute("""
            SELECT COUNT(*) AS count FROM donors
        """).fetchone()["count"]

        blood_units = conn.execute("""
            SELECT COALESCE(SUM(units), 0) AS total
            FROM blood_inventory
        """).fetchone()["total"]

        pending_requests = conn.execute("""
            SELECT COUNT(*) AS count
            FROM blood_requests
            WHERE status = 'Pending'
        """).fetchone()["count"]

        hospitals = conn.execute("""
            SELECT COUNT(*) AS count
            FROM hospitals
            WHERE status = 'Active'
        """).fetchone()["count"]

        patients = conn.execute("""
            SELECT COUNT(*) AS count FROM patients
        """).fetchone()["count"]

        inventory_rows = conn.execute("""
            SELECT blood_group, units, status
            FROM blood_inventory
            ORDER BY blood_group
        """).fetchall()

        donor_rows = conn.execute("""
            SELECT name, blood_group, phone, last_donation, status
            FROM donors
            ORDER BY id DESC
            LIMIT 5
        """).fetchall()

        request_rows = conn.execute("""
            SELECT patient_name, blood_group, units, hospital, status
            FROM blood_requests
            ORDER BY id DESC
            LIMIT 5
        """).fetchall()

        return jsonify({
            "status": "success",
            "data": {
                "donors": donors,
                "blood_units": blood_units,
                "pending_requests": pending_requests,
                "hospitals": hospitals,
                "patients": patients,
                "inventory": [dict(row) for row in inventory_rows],
                "recent_donors": [dict(row) for row in donor_rows],
                "recent_requests": [dict(row) for row in request_rows]
            }
        })

    except Exception:
        app.logger.exception("Loading dashboard failed")
        return jsonify({
            "status": "error",
            "message": "Unable to load dashboard"
        }), 500

    finally:
        conn.close()


# =====================================================
# REPORTS
# =====================================================

@app.route("/api/reports", methods=["GET"])
@require_auth
def reports():
    conn = get_db_connection()

    try:
        total_donors = conn.execute("""
            SELECT COUNT(*) AS count FROM donors
        """).fetchone()["count"]

        total_patients = conn.execute("""
            SELECT COUNT(*) AS count FROM patients
        """).fetchone()["count"]

        total_hospitals = conn.execute("""
            SELECT COUNT(*) AS count FROM hospitals
        """).fetchone()["count"]

        total_requests = conn.execute("""
            SELECT COUNT(*) AS count FROM blood_requests
        """).fetchone()["count"]

        total_units = conn.execute("""
            SELECT COALESCE(SUM(units), 0) AS total
            FROM blood_inventory
        """).fetchone()["total"]

        return jsonify({
            "status": "success",
            "reports": {
                "total_donors": total_donors,
                "total_patients": total_patients,
                "total_hospitals": total_hospitals,
                "total_requests": total_requests,
                "total_blood_units": total_units
            }
        })

    finally:
        conn.close()


# =====================================================
# ERROR HANDLERS
# =====================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "status": "error",
        "message": "API endpoint not found"
    }), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        "status": "error",
        "message": "Internal server error"
    }), 500


# =====================================================
# RUN SERVER
# =====================================================

if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="127.0.0.1", port=5000, debug=debug_mode)
