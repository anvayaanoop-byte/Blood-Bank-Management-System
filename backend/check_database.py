
import sqlite3
import os

DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "database.db"
)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

tables = cursor.execute("""
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
""").fetchall()

print("\n=== BLOOD BANK DATABASE REPORT ===")
print("Database:", DB_PATH)
print("-" * 40)

for (table_name,) in tables:
    cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
    count = cursor.fetchone()[0]
    print(f"{table_name}: {count} records")

print("-" * 40)
print("Total tables:", len(tables))

conn.close()
