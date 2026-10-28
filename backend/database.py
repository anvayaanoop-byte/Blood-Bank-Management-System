
import os
import sqlite3
from contextlib import contextmanager

# ============================================
# Blood Bank Management System
# Database Configuration
# ============================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "database.db")


# ============================================
# Database Connection
# ============================================

def get_db_connection():
    """Create and return a SQLite database connection."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_db():
    """Provide a connection that commits on success and rolls back on error."""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ============================================
# Initialize Database Tables
# ============================================

def init_db():
    """Create all required tables if they do not already exist."""

    conn = get_db_connection()

    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'User',
                status TEXT DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS donors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                age INTEGER,
                gender TEXT,
                blood_group TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                address TEXT,
                last_donation DATE,
                status TEXT DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS blood_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                blood_group TEXT NOT NULL UNIQUE,
                units INTEGER NOT NULL DEFAULT 0,
                status TEXT DEFAULT 'Available',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS blood_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT UNIQUE,
                patient_name TEXT NOT NULL,
                blood_group TEXT NOT NULL,
                units INTEGER NOT NULL,
                hospital TEXT NOT NULL,
                urgency TEXT DEFAULT 'Normal',
                status TEXT DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                age INTEGER,
                blood_group TEXT,
                phone TEXT,
                hospital TEXT,
                units_required INTEGER DEFAULT 0,
                status TEXT DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS hospitals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id TEXT UNIQUE,
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                address TEXT,
                contact_person TEXT,
                status TEXT DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS camps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camp_id TEXT UNIQUE,
                name TEXT NOT NULL,
                date DATE,
                location TEXT,
                organizer TEXT,
                contact TEXT,
                expected_donors INTEGER DEFAULT 0,
                donors INTEGER DEFAULT 0,
                units INTEGER DEFAULT 0,
                status TEXT DEFAULT 'Upcoming',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS blood_banks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                address TEXT,
                city TEXT,
                state TEXT,
                opening_hours TEXT,
                status TEXT DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                donor_id INTEGER,
                donor_name TEXT,
                phone TEXT,
                email TEXT,
                blood_bank_id INTEGER,
                appointment_date DATE,
                appointment_time TEXT,
                blood_group TEXT,
                status TEXT DEFAULT 'Pending',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (donor_id) REFERENCES donors(id)
                    ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_donors_blood_group
                ON donors(blood_group);

            CREATE INDEX IF NOT EXISTS idx_requests_status
                ON blood_requests(status);

            CREATE INDEX IF NOT EXISTS idx_appointments_date
                ON appointments(appointment_date);
        """)

        # Safe migrations for databases created by earlier project versions.
        migrations = {
            "users": {"address": "TEXT"},
            "blood_requests": {"requested_by_user_id": "INTEGER"},
            "camps": {"expected_donors": "INTEGER DEFAULT 0", "donors": "INTEGER DEFAULT 0", "units": "INTEGER DEFAULT 0"},
            "blood_banks": {"opening_hours": "TEXT"},
            "appointments": {"phone": "TEXT", "email": "TEXT", "blood_bank_id": "INTEGER"},
        }
        for table_name, additions in migrations.items():
            existing_columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()}
            for column_name, column_type in additions.items():
                if column_name not in existing_columns:
                    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")

        conn.commit()
        print("Database initialized successfully.")
        print("Database location:", DATABASE)

    except sqlite3.Error as error:
        conn.rollback()
        print("Database initialization error:", error)
        raise

    finally:
        conn.close()


# ============================================
# Run Initialization
# ============================================

if __name__ == "__main__":
    init_db()
