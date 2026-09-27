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


def get_db_connection() -> sqlite3.Connection:
    """Establish and return a SQLite database connection with row factory and foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
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

        conn.commit()

        # Seed initial records if empty
        cursor.execute("SELECT COUNT(*) AS cnt FROM transactions;")
        if cursor.fetchone()["cnt"] == 0:
            seed_initial_data(conn)


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
    txn_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Query transactions joined with fraud analysis from SQL database with optional filters."""
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


def insert_transaction(txn: Dict[str, Any]) -> Dict[str, Any]:
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
            INSERT OR REPLACE INTO transactions (
                id, step, type, amount, oldbalanceOrg, newbalanceOrig, newbalanceDest,
                sender_id, recipient_id, status, timestamp_label
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
            timestamp_label
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
            "audit_logs": audit_count
        }
    }
