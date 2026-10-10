"""Run test_flows.py while preserving the real linked Google identity of the
seeded superadmin row (test_flows expects the pristine placeholder state)."""
import sqlite3
import subprocess
import sys
from pathlib import Path

DB = Path(__file__).parent / "backend" / "sentinel.db"
ROW_ID = "usr_master_superadmin_000"

conn = sqlite3.connect(DB)
before = conn.execute(
    "SELECT google_id, identity_trusted, email_verified FROM users WHERE id=?",
    (ROW_ID,),
).fetchone()
conn.execute(
    "UPDATE users SET google_id='master_google_abad_001', identity_trusted=0, email_verified=0 WHERE id=?",
    (ROW_ID,),
)
conn.commit()
conn.close()

code = subprocess.call([sys.executable, str(Path(__file__).parent / "test_flows.py")])

conn = sqlite3.connect(DB)
conn.execute(
    "UPDATE users SET google_id=?, identity_trusted=?, email_verified=? WHERE id=?",
    (before[0], before[1], before[2], ROW_ID),
)
conn.commit()
after = conn.execute(
    "SELECT google_id, identity_trusted, email_verified FROM users WHERE id=?",
    (ROW_ID,),
).fetchone()
conn.close()

print(f"real state preserved: google_id={after[0]!r} trusted={after[1]} verified={after[2]}")
sys.exit(code)
