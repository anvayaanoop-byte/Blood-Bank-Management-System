
import os
import sqlite3

db_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "database.db"
)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

try:
    print("Database:", db_path)

    table = conn.execute("""
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'users'
    """).fetchone()

    if not table:
        print("ERROR: users table does not exist.")
    else:
        columns = [
            row["name"]
            for row in conn.execute("PRAGMA table_info(users)")
        ]
        print("\nUsers table columns:", columns)

        count = conn.execute(
            "SELECT COUNT(*) FROM users"
        ).fetchone()[0]
        print("Total registered users:", count)

        safe_columns = [
            col for col in
            ("id", "name", "email", "role", "status", "created_at")
            if col in columns
        ]

        if safe_columns:
            query = "SELECT " + ", ".join(
                '"' + col + '"' for col in safe_columns
            ) + " FROM users ORDER BY id DESC LIMIT 10"

            print("\nRecent users:")
            for user in conn.execute(query):
                print(dict(user))

finally:
    conn.close()
