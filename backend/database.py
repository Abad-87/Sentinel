import os
import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Check if running in Vercel or AWS Lambda serverless environment
IS_VERCEL = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
if IS_VERCEL:
    DB_PATH = os.path.join("/tmp", "sentinel.db")
else:
    DB_PATH = os.path.join(BASE_DIR, "sentinel.db")

# An explicit persistent path overrides the legacy serverless /tmp location.
DB_PATH = os.environ.get("SENTINEL_DB_PATH", DB_PATH)


def get_db_connection() -> sqlite3.Connection:
    """Establish and return a SQLite database connection with row factory and foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 15000;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db(force_recreate: bool = False):
    """
    Initialize SQLite database tables, relationships, and performance indexes.
    Seeds default telemetry data if tables are empty.
    """
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_db_connection() as conn:
        cursor = conn.cursor()

        if force_recreate:
            cursor.execute("DROP TABLE IF EXISTS audit_logs;")
            cursor.execute("DROP TABLE IF EXISTS fraud_analyses;")
            cursor.execute("DROP TABLE IF EXISTS transactions;")
            cursor.execute("DROP TABLE IF EXISTS counterparties;")
            cursor.execute("DROP TABLE IF EXISTS customers;")
            cursor.execute("DROP TABLE IF EXISTS admin_whitelist;")
            cursor.execute("DROP TABLE IF EXISTS users;")

        # 1. Customers / Users Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                account_number TEXT UNIQUE NOT NULL,
                account_tier TEXT DEFAULT 'STANDARD',
                initial_balance REAL DEFAULT 0.0,
                current_balance REAL DEFAULT 0.0,
                risk_score REAL DEFAULT 0.0,
                status TEXT DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 2. Counterparties / Merchants Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS counterparties (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT DEFAULT 'GENERAL',
                risk_profile TEXT DEFAULT 'NORMAL',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 3. Transactions Table (Relational core)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                step INTEGER NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                oldbalanceOrg REAL NOT NULL,
                newbalanceOrig REAL NOT NULL,
                newbalanceDest REAL NOT NULL,
                sender_id TEXT NOT NULL,
                recipient_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Approved',
                timestamp_label TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES customers(id) ON DELETE CASCADE,
                FOREIGN KEY (recipient_id) REFERENCES counterparties(id) ON DELETE CASCADE
            );
        """)

        # 4. Fraud Analyses Table (1:1 with transactions)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS fraud_analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT UNIQUE NOT NULL,
                risk TEXT NOT NULL,
                fraud_probability REAL NOT NULL,
                anomaly_flags TEXT,
                recommendations TEXT,
                model_version TEXT DEFAULT '1.2.0',
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
            );
        """)

        # 5. Audit Logs Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT,
                action TEXT NOT NULL,
                old_status TEXT,
                new_status TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 6. Authenticated Users (Google OAuth, Direct Sign-Up & Super Admin Management)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT,
                picture TEXT,
                role TEXT NOT NULL DEFAULT 'USER',
                is_admin INTEGER NOT NULL DEFAULT 0,
                is_super_admin INTEGER NOT NULL DEFAULT 0,
                google_id TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Migration helper for existing databases
        try:
            cursor.execute("PRAGMA table_info(users);")
            existing_cols = [c["name"] for c in cursor.fetchall()]
            if "password_hash" not in existing_cols:
                cursor.execute("ALTER TABLE users ADD COLUMN password_hash TEXT;")
            if "is_super_admin" not in existing_cols:
                cursor.execute("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;")
        except Exception:
            pass

        # 7. Admin Authorization Whitelist (Domains and specific email addresses)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admin_whitelist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_or_domain TEXT UNIQUE NOT NULL,
                type TEXT NOT NULL DEFAULT 'EMAIL',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Relational Indexes for High-Speed Filtering and Queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_sender ON transactions(sender_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_recipient ON transactions(recipient_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_step ON transactions(step);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fraud_risk ON fraud_analyses(risk);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fraud_prob ON fraud_analyses(fraud_probability);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_acc ON customers(account_number);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_txn ON audit_logs(transaction_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_whitelist_target ON admin_whitelist(email_or_domain);")

        conn.commit()

        # Seed initial records if empty
        cursor.execute("SELECT COUNT(*) AS cnt FROM transactions;")
        if cursor.fetchone()["cnt"] == 0:
            seed_initial_data(conn)

        cursor.execute("SELECT COUNT(*) AS cnt FROM admin_whitelist;")
        if cursor.fetchone()["cnt"] == 0:
            seed_admin_whitelist(conn)

        cursor.execute("SELECT COUNT(*) AS cnt FROM users;")
        if cursor.fetchone()["cnt"] == 0:
            seed_initial_users(conn)


def seed_initial_data(conn: sqlite3.Connection):
    """Seed relational tables with the default demonstration data."""
    cursor = conn.cursor()

    seed_customers = [
        ("acc_9281_orlando", "Orlando Vance", "orlando.vance@example.com", "ACCT-9281-001", "VIP", 340000.0, 0.0, 89.5, "FLAGGED"),
        ("acc_1048_emma", "Emma Watson", "emma.w@example.com", "ACCT-1048-002", "STANDARD", 3200.0, 3057.5, 2.1, "ACTIVE"),
        ("acc_6732_marcus", "Marcus Brody", "marcus.b@example.com", "ACCT-6732-003", "PREMIUM", 92000.0, 6800.0, 48.0, "ACTIVE"),
        ("acc_3391_harrison", "Harrison Ford", "harrison.f@example.com", "ACCT-3391-004", "PREMIUM", 200000.0, 5000.0, 75.0, "ACTIVE"),
        ("acc_5182_sophia", "Sophia Loren", "sophia.l@example.com", "ACCT-5182-005", "STANDARD", 1450.20, 1400.21, 1.2, "ACTIVE"),
        ("acc_7811_lucas", "Lucas Scott", "lucas.s@example.com", "ACCT-7811-006", "STANDARD", 5400.0, 4790.0, 3.0, "ACTIVE"),
        ("acc_2104_olivia", "Olivia Wilde", "olivia.w@example.com", "ACCT-2104-007", "STANDARD", 500.0, 12500.0, 1.5, "ACTIVE")
    ]

    for cust in seed_customers:
        cursor.execute("""
            INSERT OR IGNORE INTO customers (id, name, email, account_number, account_tier, initial_balance, current_balance, risk_score, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, cust)

    seed_counterparties = [
        ("acc_4021_ghost", "Ghost Offshore Entity 4021", "OFFSHORE", "BLOCKED"),
        ("merch_starbucks_hq", "Starbucks HQ Terminal", "MERCHANT", "NORMAL"),
        ("atm_terminal_812", "ATM Terminal Downtown 812", "ATM", "SUSPICIOUS"),
        ("acc_8819_crypto_gateway", "Binance/Kraken Crypto Gateway", "CRYPTO", "BLOCKED"),
        ("merch_amazon_aws", "Amazon Web Services", "MERCHANT", "NORMAL"),
        ("acc_9011_utility_bill", "Municipal Utilities Dept", "UTILITY", "NORMAL"),
        ("bank_payroll_ach", "National Payroll ACH Clearing", "PAYROLL", "NORMAL")
    ]

    for cp in seed_counterparties:
        cursor.execute("""
            INSERT OR IGNORE INTO counterparties (id, name, category, risk_profile)
            VALUES (?, ?, ?, ?);
        """, cp)

    seed_txns = [
        {
            "id": "TXN-90241",
            "timestamp": "2 mins ago",
            "step": 2,
            "type": "TRANSFER",
            "amount": 340000.00,
            "oldbalanceOrg": 340000.00,
            "newbalanceOrig": 0.00,
            "newbalanceDest": 0.00,
            "sender": "acc_9281_orlando",
            "recipient": "acc_4021_ghost",
            "risk": "High Risk",
            "fraudProbability": 99.12,
            "status": "Blocked",
            "anomalyFlags": [
                "Origin account balance drained completely ($0 balance)",
                "High value transfer exceeding $200,000 threshold",
                "Off-peak early morning activity (Step 2 = 02:00 AM)"
            ],
            "recommendations": [
                "Freeze originating account pending identity verification.",
                "Flag destination account activity for fraud ring review.",
                "Require secondary verification before unlocking funds."
            ]
        },
        {
            "id": "TXN-90240",
            "timestamp": "8 mins ago",
            "step": 14,
            "type": "PAYMENT",
            "amount": 142.50,
            "oldbalanceOrg": 3200.00,
            "newbalanceOrig": 3057.50,
            "newbalanceDest": 0.00,
            "sender": "acc_1048_emma",
            "recipient": "merch_starbucks_hq",
            "risk": "Low Risk",
            "fraudProbability": 1.45,
            "status": "Approved",
            "anomalyFlags": [],
            "recommendations": [
                "Transaction appears normal. Maintain standard transaction monitoring."
            ]
        },
        {
            "id": "TXN-90239",
            "timestamp": "19 mins ago",
            "step": 4,
            "type": "CASH_OUT",
            "amount": 85200.00,
            "oldbalanceOrg": 92000.00,
            "newbalanceOrig": 6800.00,
            "newbalanceDest": 120500.00,
            "sender": "acc_6732_marcus",
            "recipient": "atm_terminal_812",
            "risk": "Medium Risk",
            "fraudProbability": 58.40,
            "status": "Under Review",
            "anomalyFlags": [
                "Unusual cash-out velocity for this account tier",
                "Night transaction (Step 4 = 04:00 AM)"
            ],
            "recommendations": [
                "Perform enhanced verification via SMS/hardware token.",
                "Verify customer location matches ATM IP coordinates."
            ]
        },
        {
            "id": "TXN-90238",
            "timestamp": "32 mins ago",
            "step": 11,
            "type": "TRANSFER",
            "amount": 195000.00,
            "oldbalanceOrg": 200000.00,
            "newbalanceOrig": 5000.00,
            "newbalanceDest": 0.00,
            "sender": "acc_3391_harrison",
            "recipient": "acc_8819_crypto_gateway",
            "risk": "High Risk",
            "fraudProbability": 92.75,
            "status": "Blocked",
            "anomalyFlags": [
                "Destination balance shows zero balance anomaly",
                "Rapid depletion of 97.5% account funds"
            ],
            "recommendations": [
                "Review destination account activity.",
                "Hold transaction for manual compliance sign-off."
            ]
        },
        {
            "id": "TXN-90237",
            "timestamp": "45 mins ago",
            "step": 16,
            "type": "PAYMENT",
            "amount": 49.99,
            "oldbalanceOrg": 1450.20,
            "newbalanceOrig": 1400.21,
            "newbalanceDest": 0.00,
            "sender": "acc_5182_sophia",
            "recipient": "merch_amazon_aws",
            "risk": "Low Risk",
            "fraudProbability": 0.82,
            "status": "Approved",
            "anomalyFlags": [],
            "recommendations": [
                "Transaction appears low risk, continue normal monitoring."
            ]
        },
        {
            "id": "TXN-90236",
            "timestamp": "1 hour ago",
            "step": 22,
            "type": "DEBIT",
            "amount": 610.00,
            "oldbalanceOrg": 5400.00,
            "newbalanceOrig": 4790.00,
            "newbalanceDest": 0.00,
            "sender": "acc_7811_lucas",
            "recipient": "acc_9011_utility_bill",
            "risk": "Low Risk",
            "fraudProbability": 2.10,
            "status": "Approved",
            "anomalyFlags": [],
            "recommendations": [
                "Normal utility debit pattern verified."
            ]
        },
        {
            "id": "TXN-90235",
            "timestamp": "2 hours ago",
            "step": 3,
            "type": "TRANSFER",
            "amount": 215000.00,
            "oldbalanceOrg": 215000.00,
            "newbalanceOrig": 0.00,
            "newbalanceDest": 0.00,
            "sender": "acc_9281_orlando",
            "recipient": "acc_8819_crypto_gateway",
            "risk": "High Risk",
            "fraudProbability": 98.60,
            "status": "Blocked",
            "anomalyFlags": [
                "Repeated complete balance drainage from same origin entity",
                "High-risk crypto counterparty gateway",
                "Off-peak night execution (03:00 AM)"
            ],
            "recommendations": [
                "Origin account frozen due to repeated drainage attempts.",
                "Dispatch forensic alert to Compliance Risk team."
            ]
        },
        {
            "id": "TXN-90234",
            "timestamp": "3 hours ago",
            "step": 10,
            "type": "CASH_IN",
            "amount": 12000.00,
            "oldbalanceOrg": 500.00,
            "newbalanceOrig": 12500.00,
            "newbalanceDest": 0.00,
            "sender": "acc_2104_olivia",
            "recipient": "bank_payroll_ach",
            "risk": "Low Risk",
            "fraudProbability": 1.15,
            "status": "Approved",
            "anomalyFlags": [],
            "recommendations": [
                "Verified direct payroll deposit."
            ]
        }
    ]

    for item in seed_txns:
        cursor.execute("""
            INSERT OR REPLACE INTO transactions (
                id, step, type, amount, oldbalanceOrg, newbalanceOrig, newbalanceDest,
                sender_id, recipient_id, status, timestamp_label
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            item["id"], item["step"], item["type"], item["amount"],
            item["oldbalanceOrg"], item["newbalanceOrig"], item["newbalanceDest"],
            item["sender"], item["recipient"], item["status"], item["timestamp"]
        ))

        cursor.execute("""
            INSERT OR REPLACE INTO fraud_analyses (
                transaction_id, risk, fraud_probability, anomaly_flags, recommendations, model_version
            ) VALUES (?, ?, ?, ?, ?, ?);
        """, (
            item["id"], item["risk"], item["fraudProbability"],
            json.dumps(item["anomalyFlags"]), json.dumps(item["recommendations"]), "1.2.0"
        ))

        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, old_status, new_status, notes)
            VALUES (?, 'SYSTEM_SEED', NULL, ?, 'Seeded into SQL database during initial initialization.');
        """, (item["id"], item["status"]))

    conn.commit()


# ============================================================================
# CRUD & SQL QUERY OPERATIONS LAYER
# ============================================================================

def get_all_transactions(
    limit: Optional[int] = None,
    offset: int = 0,
    search: Optional[str] = None,
    risk: Optional[str] = None,
    status: Optional[str] = None,
    txn_type: Optional[str] = None,
    user_email: Optional[str] = None,
    user_role: Optional[str] = None,
    user_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Query transactions joined with fraud analysis from SQL database.
    - Super Admin (abadmustafa280@gmail.com): Full global access across all transactions and users.
    - Standard Admin: Full organizational telemetry access.
    - Standard User: Scoped strictly to user personal activity logs.
    """
    query = """
        SELECT
            t.id,
            t.step,
            t.type,
            t.amount,
            t.oldbalanceOrg,
            t.newbalanceOrig,
            t.newbalanceDest,
            t.sender_id AS sender,
            t.recipient_id AS recipient,
            t.status,
            COALESCE(t.timestamp_label, strftime('%Y-%m-%d %H:%M:%S', t.created_at)) AS timestamp,
            fa.risk,
            fa.fraud_probability AS fraudProbability,
            fa.anomaly_flags AS anomalyFlags,
            fa.recommendations AS recommendations
        FROM transactions t
        LEFT JOIN fraud_analyses fa ON t.id = fa.transaction_id
        WHERE 1=1
    """
    params = []

    # Scoping for Standard Users exclusively to their personal transactions/simulator
    if user_role == "USER":
        query += " AND t.owner_user_id = ?"
        params.append(user_id)

    if search:
        s = f"%{search.strip().lower()}%"
        query += """ AND (
            LOWER(t.id) LIKE ? OR
            LOWER(t.sender_id) LIKE ? OR
            LOWER(t.recipient_id) LIKE ? OR
            LOWER(t.type) LIKE ?
        )"""
        params.extend([s, s, s, s])

    if risk:
        query += " AND fa.risk = ?"
        params.append(risk)

    if status:
        query += " AND t.status = ?"
        params.append(status)

    if txn_type:
        query += " AND t.type = ?"
        params.append(txn_type)

    query += " ORDER BY t.created_at DESC"

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()

    results = []
    for r in rows:
        flags = []
        if r["anomalyFlags"]:
            try:
                flags = json.loads(r["anomalyFlags"])
            except Exception:
                flags = []

        recs = []
        if r["recommendations"]:
            try:
                recs = json.loads(r["recommendations"])
            except Exception:
                recs = []

        results.append({
            "id": r["id"],
            "step": r["step"],
            "type": r["type"],
            "amount": float(r["amount"]),
            "oldbalanceOrg": float(r["oldbalanceOrg"]),
            "newbalanceOrig": float(r["newbalanceOrig"]),
            "newbalanceDest": float(r["newbalanceDest"]),
            "sender": r["sender"],
            "recipient": r["recipient"],
            "status": r["status"],
            "timestamp": r["timestamp"],
            "risk": r["risk"] or "Low Risk",
            "fraudProbability": float(r["fraudProbability"] or 0.0),
            "anomalyFlags": flags,
            "recommendations": recs
        })
    return results


def get_transaction_by_id(txn_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve full transaction details and fraud analysis by ID."""
    query = """
        SELECT
            t.id, t.step, t.type, t.amount, t.oldbalanceOrg, t.newbalanceOrig, t.newbalanceDest,
            t.sender_id AS sender, t.recipient_id AS recipient, t.status,
            COALESCE(t.timestamp_label, strftime('%Y-%m-%d %H:%M:%S', t.created_at)) AS timestamp,
            fa.risk, fa.fraud_probability AS fraudProbability, fa.anomaly_flags AS anomalyFlags,
            fa.recommendations AS recommendations, fa.model_version AS modelVersion
        FROM transactions t
        LEFT JOIN fraud_analyses fa ON t.id = fa.transaction_id
        WHERE t.id = ?;
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (txn_id,))
        row = cursor.fetchone()

    if not row:
        return None

    flags = json.loads(row["anomalyFlags"]) if row["anomalyFlags"] else []
    recs = json.loads(row["recommendations"]) if row["recommendations"] else []

    return {
        "id": row["id"],
        "step": row["step"],
        "type": row["type"],
        "amount": float(row["amount"]),
        "oldbalanceOrg": float(row["oldbalanceOrg"]),
        "newbalanceOrig": float(row["newbalanceOrig"]),
        "newbalanceDest": float(row["newbalanceDest"]),
        "sender": row["sender"],
        "recipient": row["recipient"],
        "status": row["status"],
        "timestamp": row["timestamp"],
        "risk": row["risk"] or "Low Risk",
        "fraudProbability": float(row["fraudProbability"] or 0.0),
        "anomalyFlags": flags,
        "recommendations": recs,
        "modelVersion": row["modelVersion"]
    }


def insert_transaction(txn: Dict[str, Any], owner_user_id: Optional[str] = None) -> Dict[str, Any]:
    """Insert a transaction, its customer/counterparty records, and its fraud analysis into SQL."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Ensure customer exists or create default
        sender_id = txn.get("sender") or f"acc_{txn.get('id', 'cust')}"
        cursor.execute("""
            INSERT OR IGNORE INTO customers (id, name, account_number, current_balance)
            VALUES (?, ?, ?, ?);
        """, (sender_id, f"Client {sender_id}", sender_id.upper(), txn.get("newbalanceOrig", 0.0)))

        # Ensure counterparty exists or create default
        recipient_id = txn.get("recipient") or "merch_online_gateway"
        cursor.execute("""
            INSERT OR IGNORE INTO counterparties (id, name, category)
            VALUES (?, ?, ?);
        """, (recipient_id, recipient_id, "MERCHANT" if "merch" in recipient_id else "ACCOUNT"))

        txn_id = txn.get("id") or f"TXN-{int(datetime.now().timestamp() * 1000)}"
        timestamp_label = txn.get("timestamp") or "Just now"

        cursor.execute("""
            INSERT INTO transactions (
                id, step, type, amount, oldbalanceOrg, newbalanceOrig, newbalanceDest,
                sender_id, recipient_id, status, timestamp_label, owner_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            txn_id,
            int(txn.get("step", 1)),
            str(txn.get("type", "PAYMENT")),
            float(txn.get("amount", 0.0)),
            float(txn.get("oldbalanceOrg", 0.0)),
            float(txn.get("newbalanceOrig", 0.0)),
            float(txn.get("newbalanceDest", 0.0)),
            sender_id,
            recipient_id,
            txn.get("status", "Approved"),
            timestamp_label,
            owner_user_id
        ))

        flags_json = json.dumps(txn.get("anomalyFlags", []))
        recs_json = json.dumps(txn.get("recommendations", []))

        cursor.execute("""
            INSERT OR REPLACE INTO fraud_analyses (
                transaction_id, risk, fraud_probability, anomaly_flags, recommendations, model_version
            ) VALUES (?, ?, ?, ?, ?, ?);
        """, (
            txn_id,
            txn.get("risk", "Low Risk"),
            float(txn.get("fraudProbability", 0.0)),
            flags_json,
            recs_json,
            "1.2.0"
        ))

        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, old_status, new_status, notes)
            VALUES (?, 'TRANSACTION_RECORDED', NULL, ?, 'Transaction recorded into SQL database.');
        """, (txn_id, txn.get("status", "Approved")))

        conn.commit()

    return get_transaction_by_id(txn_id)


def update_transaction_status(txn_id: str, new_status: str) -> Optional[Dict[str, Any]]:
    """Update transaction status (e.g. Blocked, Approved, Under Review) and write an audit log entry."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM transactions WHERE id = ?;", (txn_id,))
        row = cursor.fetchone()
        if not row:
            return None

        old_status = row["status"]
        cursor.execute("""
            UPDATE transactions
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (new_status, txn_id))

        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, old_status, new_status, notes)
            VALUES (?, 'STATUS_UPDATE', ?, ?, 'Status modified via API/UI action.');
        """, (txn_id, old_status, new_status))

        conn.commit()

    return get_transaction_by_id(txn_id)


def delete_transaction(txn_id: str) -> bool:
    """Delete a transaction from SQL (foreign keys cascade to fraud_analyses)."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM transactions WHERE id = ?;", (txn_id,))
        if not cursor.fetchone():
            return False

        cursor.execute("DELETE FROM transactions WHERE id = ?;", (txn_id,))
        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, notes)
            VALUES (?, 'TRANSACTION_DELETED', 'Transaction purged from database.');
        """, (txn_id,))
        conn.commit()
    return True


def clear_all_transactions() -> int:
    """Clear all transactions and fraud analyses from SQL database."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS cnt FROM transactions;")
        count = cursor.fetchone()["cnt"]

        cursor.execute("DELETE FROM fraud_analyses;")
        cursor.execute("DELETE FROM transactions;")
        cursor.execute("""
            INSERT INTO audit_logs (action, notes)
            VALUES ('TRUNCATE_TRANSACTIONS', 'All transactions purged from database.');
        """)
        conn.commit()
    return count


def get_all_customers() -> List[Dict[str, Any]]:
    """Query customer/user entities from SQL database with active transaction stats."""
    query = """
        SELECT
            c.id, c.name, c.email, c.account_number, c.account_tier,
            c.initial_balance, c.current_balance, c.risk_score, c.status,
            COUNT(t.id) AS transaction_count,
            COALESCE(SUM(t.amount), 0.0) AS total_volume
        FROM customers c
        LEFT JOIN transactions t ON c.id = t.sender_id
        GROUP BY c.id
        ORDER BY c.risk_score DESC, total_volume DESC;
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        rows = cursor.fetchall()

    return [dict(r) for r in rows]


def get_db_status() -> Dict[str, Any]:
    """Return SQL database connection status and telemetry metrics."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS cnt FROM transactions;")
        txn_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM customers;")
        cust_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM fraud_analyses;")
        fraud_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM audit_logs;")
        audit_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM users;")
        user_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM admin_whitelist;")
        whitelist_count = cursor.fetchone()["cnt"]

    file_size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

    return {
        "status": "connected",
        "engine": "SQLite Relational Database (ACID compliant)",
        "database_file": DB_PATH,
        "database_size_bytes": file_size_bytes,
        "tables": {
            "transactions": txn_count,
            "customers": cust_count,
            "fraud_analyses": fraud_count,
            "audit_logs": audit_count,
            "users": user_count,
            "admin_whitelist": whitelist_count
        }
    }


# ============================================================================
# USER & ADMIN AUTHENTICATION DATABASE LAYER
# ============================================================================

SUPER_ADMIN_EMAIL = "abadmustafa280@gmail.com"


def is_super_admin_email(email: str) -> bool:
    """Check if given email corresponds to the Master Super Admin account."""
    if not email:
        return False
    return email.strip().lower() == SUPER_ADMIN_EMAIL.lower()


def hash_password(password: str) -> str:
    """Generate salted PBKDF2-HMAC-SHA256 password hash."""
    import secrets
    import hashlib
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify raw password against stored salted PBKDF2 hash."""
    import hashlib
    import hmac
    if not stored_hash or ":" not in stored_hash:
        return False
    salt, expected = stored_hash.split(":", 1)
    computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return hmac.compare_digest(computed, expected)


def seed_admin_whitelist(conn: sqlite3.Connection):
    """Seed default enterprise domains and security operational emails into whitelist."""
    cursor = conn.cursor()
    seed_entries = [
        (SUPER_ADMIN_EMAIL, "EMAIL", "Master Super Administrator - Global Authority"),
        ("sentinel.ai", "DOMAIN", "Enterprise Sentinel AI Domain"),
        ("admin@sentinel.ai", "EMAIL", "Primary Security Operations Lead"),
        ("secops@sentinel.ai", "EMAIL", "Security Operations Team"),
        ("compliance@sentinel.ai", "EMAIL", "Chief Compliance Officer"),
        ("root@sentinel.ai", "EMAIL", "System Superuser"),
        ("admin@example.com", "EMAIL", "Demo Admin Account for Testing")
    ]
    for target, entry_type, notes in seed_entries:
        cursor.execute("""
            INSERT OR IGNORE INTO admin_whitelist (email_or_domain, type, notes)
            VALUES (?, ?, ?);
        """, (target.strip().lower(), entry_type.upper(), notes))
    conn.commit()


def seed_initial_users(conn: sqlite3.Connection):
    """Seed initial demonstration users for Super Admin, Admin, and Standard Analyst roles."""
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    seed_users = [
        (
            "usr_master_superadmin_000",
            SUPER_ADMIN_EMAIL,
            "Sentinel Administrator",
            "",
            "SUPER_ADMIN",
            1,
            1,
            "master_google_abad_001",
            now, now, now
        ),
        (
            "usr_demo_admin_001",
            "secops@sentinel.ai",
            "Elena Vance (SecOps Lead)",
            "",
            "ADMIN",
            1,
            0,
            "demo_google_secops_9921",
            now, now, now
        ),
        (
            "usr_demo_user_002",
            "analyst.vance@defense.org",
            "Marcus Brody (Risk Analyst)",
            "",
            "USER",
            0,
            0,
            "demo_google_analyst_1048",
            now, now, now
        )
    ]
    for u in seed_users:
        cursor.execute("""
            INSERT OR IGNORE INTO users (id, email, name, picture, role, is_admin, is_super_admin, google_id, created_at, updated_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, u)
    conn.commit()


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve an authenticated user record by unique primary key ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?;", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieve an authenticated user record by normalized email address."""
    if not email:
        return None
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?;", (email.strip().lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None


def is_email_authorized_admin(email: str) -> bool:
    """
    Check if an email qualifies for the ADMIN or SUPER_ADMIN role:
    1. Master Super Admin check (abadmustafa280@gmail.com) -> Always True
    2. Configured environment domains / email lists (e.g. sentinel.ai)
    3. SQL admin_whitelist domain entries
    4. SQL admin_whitelist specific email entries
    5. Database 'is_admin' or 'is_super_admin' flag on existing user record
    """
    if not email:
        return False
    norm_email = email.strip().lower()

    # 1. Master Super Admin Account
    if is_super_admin_email(norm_email):
        return True

    domain = norm_email.split('@')[-1] if '@' in norm_email else ''

    # 2. Environment variable checks
    env_domains = [d.strip().lower() for d in os.environ.get("ADMIN_DOMAINS", "sentinel.ai").split(",") if d.strip()]
    if domain in env_domains:
        return True

    env_emails = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "admin@sentinel.ai,secops@sentinel.ai").split(",") if e.strip()]
    if norm_email in env_emails:
        return True

    # 3. Database whitelist table check
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM admin_whitelist WHERE type = 'EMAIL' AND LOWER(email_or_domain) = ?;", (norm_email,))
        if cursor.fetchone():
            return True

        cursor.execute("""
            SELECT 1 FROM admin_whitelist
            WHERE type = 'DOMAIN' AND (LOWER(email_or_domain) = ? OR LOWER(email_or_domain) = ?);
        """, (domain, f"@{domain}"))
        if cursor.fetchone():
            return True

        cursor.execute("SELECT is_admin, is_super_admin FROM users WHERE LOWER(email) = ?;", (norm_email,))
        row = cursor.fetchone()
        if row and (bool(row["is_admin"]) or bool(row["is_super_admin"])):
            return True

    return False


def create_user_with_password(
    name: str,
    email: str,
    password: str,
    role: str = "USER"
) -> Dict[str, Any]:
    """Create a new user with secure password hash and proper role scoping."""
    norm_email = email.strip().lower()
    user_id = f"usr_{abs(hash(norm_email)) % 100000000:08d}"
    now = datetime.utcnow().isoformat()
    pwd_hash = hash_password(password)

    is_super = 1 if is_super_admin_email(norm_email) else 0
    if is_super:
        final_role = "SUPER_ADMIN"
        final_is_admin = 1
    elif role.upper() == "ADMIN":
        final_role = "ADMIN"
        final_is_admin = 1
    else:
        final_role = "USER"
        final_is_admin = 0

    # Defense-in-depth: Administrator accounts may only ever be created for
    # server-side authorized identities (whitelist, enterprise domain, or the
    # master super admin). The API layer enforces this too; this guard makes
    # sure no future caller can bypass the authorization check.
    if final_role == "ADMIN" and not is_email_authorized_admin(norm_email):
        raise ValueError(
            f"Work email '{norm_email}' is not authorized for Administrator access. "
            "Admin registration requires a verified enterprise domain or whitelist clearance."
        )

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?;", (norm_email,))
        existing = cursor.fetchone()

        if existing:
            user_id = existing["id"]
            cursor.execute("""
                UPDATE users
                SET name = ?, password_hash = ?, role = ?, is_admin = ?, is_super_admin = ?, updated_at = ?, last_login = ?
                WHERE id = ?;
            """, (name or existing["name"], pwd_hash, final_role, final_is_admin, is_super, now, now, user_id))
        else:
            cursor.execute("""
                INSERT INTO users (id, email, name, password_hash, picture, role, is_admin, is_super_admin, google_id, created_at, updated_at, last_login)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (user_id, norm_email, name, pwd_hash, "", final_role, final_is_admin, is_super, None, now, now, now))

        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, notes)
            VALUES (NULL, 'AUTH_SIGNUP', ?);
        """, (f"User registered with password: {norm_email} (Role: {final_role}, SuperAdmin: {is_super})",))
        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?;", (user_id,))
        return dict(cursor.fetchone())


def authenticate_user_password(email: str, password: str) -> Optional[Dict[str, Any]]:
    """Verify user password and update last_login on success."""
    norm_email = email.strip().lower()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?;", (norm_email,))
        row = cursor.fetchone()
        if not row:
            return None
        user = dict(row)
        if not user.get("password_hash"):
            return None
        if not verify_password(password, user["password_hash"]):
            return None

        now = datetime.utcnow().isoformat()
        cursor.execute("UPDATE users SET last_login = ? WHERE id = ?;", (now, user["id"]))
        conn.commit()
        user["last_login"] = now
        return user


def upsert_user(
    google_id: str,
    email: str,
    name: str,
    picture: Optional[str] = None,
    role: str = "USER",
    is_admin: bool = False
) -> Dict[str, Any]:
    """
    Create or update an authenticated user from Google OAuth callback data.
    Enforces role assignment, Super Admin recognition, and audit trail persistence.
    """
    norm_email = email.strip().lower()
    user_id = f"usr_{google_id}" if google_id else f"usr_{abs(hash(norm_email)) % 100000000:08d}"
    now = datetime.utcnow().isoformat()
    is_super = 1 if is_super_admin_email(norm_email) else 0

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ? OR (google_id IS NOT NULL AND google_id = ?);", (norm_email, google_id))
        existing = cursor.fetchone()

        if existing:
            user_id = existing["id"]
            final_is_super = 1 if (is_super or existing["is_super_admin"] == 1) else 0
            final_is_admin = 1 if (is_admin or existing["is_admin"] == 1 or final_is_super == 1) else 0
            if final_is_super:
                final_role = "SUPER_ADMIN"
            elif role == "ADMIN" or existing["role"] in ["ADMIN", "SUPER_ADMIN"] or final_is_admin == 1:
                final_role = "ADMIN"
            else:
                final_role = "USER"
            cursor.execute("""
                UPDATE users
                SET name = ?, picture = COALESCE(?, picture), google_id = COALESCE(?, google_id),
                    role = ?, is_admin = ?, is_super_admin = ?, updated_at = ?, last_login = ?
                WHERE id = ?;
            """, (name or existing["name"], picture, google_id, final_role, final_is_admin, final_is_super, now, now, user_id))
        else:
            final_is_super = is_super
            final_is_admin = 1 if (is_admin or final_is_super == 1) else 0
            final_role = "SUPER_ADMIN" if final_is_super else ("ADMIN" if final_is_admin else "USER")
            cursor.execute("""
                INSERT INTO users (id, email, name, picture, role, is_admin, is_super_admin, google_id, created_at, updated_at, last_login)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (user_id, norm_email, name or "Sentinel User", picture or "", final_role, final_is_admin, final_is_super, google_id, now, now, now))

        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, notes)
            VALUES (NULL, 'AUTH_LOGIN', ?);
        """, (f"User login: {norm_email} (Role: {final_role}, Admin: {final_is_admin}, SuperAdmin: {final_is_super})",))
        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?;", (user_id,))
        return dict(cursor.fetchone())


def list_all_users() -> List[Dict[str, Any]]:
    """Return all registered platform users with timestamps and roles."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, name, picture, role, is_admin, created_at, last_login FROM users ORDER BY last_login DESC;")
        return [dict(r) for r in cursor.fetchall()]


def get_admin_whitelist() -> List[Dict[str, Any]]:
    """Return configured Admin email domains and specific accounts."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email_or_domain, type, notes, created_at FROM admin_whitelist ORDER BY created_at DESC;")
        return [dict(r) for r in cursor.fetchall()]


def add_to_admin_whitelist(email_or_domain: str, entry_type: str = "EMAIL", notes: str = "") -> bool:
    """Add a new email or domain to the Admin Whitelist."""
    norm = email_or_domain.strip().lower()
    entry_type = entry_type.strip().upper()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO admin_whitelist (email_or_domain, type, notes)
            VALUES (?, ?, ?);
        """, (norm, entry_type, notes))
        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, notes)
            VALUES (NULL, 'ADMIN_WHITELIST_ADD', ?);
        """, (f"Added {norm} ({entry_type}) to Admin whitelist.",))
        conn.commit()
    return True


def delete_from_admin_whitelist(email_or_domain: str) -> bool:
    """Remove an email or domain from the Admin Whitelist."""
    norm = email_or_domain.strip().lower()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM admin_whitelist WHERE LOWER(email_or_domain) = ?;", (norm,))
        cursor.execute("""
            INSERT INTO audit_logs (transaction_id, action, notes)
            VALUES (NULL, 'ADMIN_WHITELIST_REMOVE', ?);
        """, (f"Removed {norm} from Admin whitelist.",))
        conn.commit()
    return True
