import os
import sys
import json
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, 'backend'))

import database

def test_sql_database():
    print("\n--- 1. TESTING SQL DATABASE DIRECT LAYER ---")
    database.init_db(force_recreate=True)
    status = database.get_db_status()
    print("Database Status:", status)
    assert status["status"] == "connected"
    assert status["tables"]["transactions"] >= 8
    assert status["tables"]["customers"] >= 7
    assert status["tables"]["fraud_analyses"] >= 8
    assert status["tables"]["audit_logs"] >= 8

    # Test reading transactions
    txns = database.get_all_transactions()
    print(f"Total transactions retrieved: {len(txns)}")
    assert len(txns) >= 8

    # Test inserting a new transaction
    test_txn = {
        "id": "TXN-TEST-SQL-999",
        "step": 5,
        "type": "TRANSFER",
        "amount": 125000.0,
        "oldbalanceOrg": 125000.0,
        "newbalanceOrig": 0.0,
        "newbalanceDest": 50000.0,
        "sender": "acc_test_sender",
        "recipient": "acc_test_receiver",
        "risk": "Medium Risk",
        "fraudProbability": 62.5,
        "status": "Under Review",
        "timestamp": "Just now",
        "anomalyFlags": ["Test anomaly"],
        "recommendations": ["Test rec"]
    }
    inserted = database.insert_transaction(test_txn)
    assert inserted is not None
    assert inserted["id"] == "TXN-TEST-SQL-999"
    print("Inserted transaction verified:", inserted["id"])

    # Test retrieving single transaction
    fetched = database.get_transaction_by_id("TXN-TEST-SQL-999")
    assert fetched is not None
    assert fetched["amount"] == 125000.0
    print("Fetched single transaction verified:", fetched["id"])

    # Test updating status
    updated = database.update_transaction_status("TXN-TEST-SQL-999", "Approved")
    assert updated is not None
    assert updated["status"] == "Approved"
    print("Updated status verified:", updated["status"])

    # Test deleting transaction
    deleted = database.delete_transaction("TXN-TEST-SQL-999")
    assert deleted is True
    assert database.get_transaction_by_id("TXN-TEST-SQL-999") is None
    print("Deleted transaction verified")

    # Test query customers
    customers = database.get_all_customers()
    print(f"Total customers retrieved: {len(customers)}")
    assert len(customers) >= 7

    print(">>> SQL DATABASE DIRECT LAYER PASSED ALL TESTS! <<<\n")


def test_fastapi_endpoints():
    print("\n--- 2. TESTING FASTAPI SQL DATABASE ENDPOINTS ---")
    import main
    from fastapi.testclient import TestClient

    client = TestClient(main.app)

    # 1. Health check with DB status
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert "database" in data
    assert data["database"]["status"] == "connected"
    print("Health check endpoint verified:", data["database"]["engine"])

    # 2. Database status endpoint
    r = client.get("/api/database/status")
    assert r.status_code == 200
    db_status = r.json()
    assert db_status["status"] == "connected"
    print("DB status endpoint verified:", db_status["tables"])

    # 3. List transactions
    r = client.get("/api/transactions")
    assert r.status_code == 200
    txns = r.json()
    assert len(txns) >= 8
    print(f"List transactions endpoint returned {len(txns)} records")

    # 4. Filter by status
    r = client.get("/api/transactions?status=Approved")
    assert r.status_code == 200
    approved = r.json()
    for t in approved:
        assert t["status"] == "Approved"
    print(f"Status filtering verified: {len(approved)} approved transactions")

    # 5. Insert transaction via API
    api_txn = {
        "id": "TXN-API-TEST-100",
        "step": 12,
        "type": "PAYMENT",
        "amount": 99.95,
        "oldbalanceOrg": 5000.0,
        "newbalanceOrig": 4900.05,
        "newbalanceDest": 0.0,
        "sender": "acc_api_user",
        "recipient": "merch_online_store"
    }
    r = client.post("/api/transactions", json=api_txn)
    assert r.status_code == 201
    created = r.json()
    assert created["id"] == "TXN-API-TEST-100"
    assert "fraudProbability" in created
    assert "risk" in created
    print("Create transaction via API verified:", created["id"], created["risk"], created["fraudProbability"])

    # 6. Update status via API
    r = client.patch(f"/api/transactions/{created['id']}/status", json={"status": "Blocked"})
    assert r.status_code == 200
    assert r.json()["status"] == "Blocked"
    print("Update status via API verified")

    # 7. Delete transaction via API
    r = client.delete(f"/api/transactions/{created['id']}")
    assert r.status_code == 200
    print("Delete transaction via API verified")

    # 8. Reset database via API
    r = client.post("/api/database/reset")
    assert r.status_code == 200
    print("Reset database via API verified")

    print(">>> FASTAPI SQL ENDPOINTS PASSED ALL TESTS! <<<\n")


def test_ui_critical_risk_removal_and_high_risk_display():
    print("\n--- 3. TESTING TRANSACTION TAB (CRITICAL REMOVED, HIGH RISK SHOWN) AND RESPONSIVE CODE ---")
    app_jsx_path = os.path.join(BASE_DIR, 'frontend', 'src', 'App.jsx')
    with open(app_jsx_path, 'r', encoding='utf-8') as f:
        app_jsx = f.read()

    # Verify that in the Transactions tab section, High Risk is displayed and Critical is removed
    triage_start = app_jsx.find("{currentTab === 'TRANSACTIONS' && (")
    assert triage_start != -1, "Could not find TRANSACTIONS tab block"
    triage_end = app_jsx.find("{currentTab === 'ENTITIES' && (", triage_start)
    triage_code = app_jsx[triage_start:triage_end]

    # Verify Critical is not in filter buttons or risk columns in Transactions tab
    assert 'Critical' not in triage_code, "ERROR: 'Critical' found in Transactions tab!"
    assert 'CRITICAL' not in triage_code, "ERROR: 'CRITICAL' found in Transactions tab!"

    # Verify High Risk filter button and badge are present
    assert 'High Risk' in triage_code, "ERROR: 'High Risk' button text missing from Transactions tab!"
    assert "activeFilter === 'HIGH_RISK'" in triage_code, "ERROR: HIGH_RISK filter pill missing from Transactions tab!"
    assert "txn.risk === 'High Risk'" in triage_code, "ERROR: High Risk badge missing from Transactions tab!"
    assert "risk-high" in triage_code, "ERROR: risk-high class missing from Transactions tab!"

    print("Verified: 'Critical Risk' removed and 'High Risk' filter button and badge shown in Transactions tab!")

    # Verify FraudAssessmentModal has no Critical Risk references
    modal_path = os.path.join(BASE_DIR, 'frontend', 'src', 'FraudAssessmentModal.jsx')
    with open(modal_path, 'r', encoding='utf-8') as f:
        modal_code = f.read()
    assert 'Critical' not in modal_code and 'CRITICAL' not in modal_code, "ERROR: Critical found in FraudAssessmentModal!"
    print("Verified: FraudAssessmentModal shows 'High Risk' and has no 'Critical' references!")

    # Verify AnalyticsVisuals has no Critical Risk references
    analytics_path = os.path.join(BASE_DIR, 'frontend', 'src', 'AnalyticsVisuals.jsx')
    with open(analytics_path, 'r', encoding='utf-8') as f:
        analytics_code = f.read()
    assert 'Critical Fraud' not in analytics_code and 'CRITICAL THREAT' not in analytics_code
    print("Verified: AnalyticsVisuals shows 'High Risk' and has no 'Critical' references!")

    # Verify mobile navigation elements are present in App.jsx
    assert 'mobile-hamburger-btn' in app_jsx, "Mobile hamburger button missing from App.jsx"
    assert 'mobile-bottom-nav' in app_jsx, "Mobile bottom nav missing from App.jsx"
    assert 'sql-db-header-badge' in app_jsx, "SQL DB status badge missing from App.jsx"
    assert 'sidebar-mobile-backdrop' in app_jsx, "Mobile drawer backdrop missing from App.jsx"
    print("Verified: Mobile drawer, hamburger button, bottom navigation, and SQL status badge present in App.jsx!")

    # Verify App.css has responsive breakpoints
    app_css_path = os.path.join(BASE_DIR, 'frontend', 'src', 'App.css')
    with open(app_css_path, 'r', encoding='utf-8') as f:
        app_css = f.read()

    assert '@media (max-width: 1200px)' in app_css
    assert '@media (max-width: 992px)' in app_css
    assert '@media (max-width: 768px)' in app_css
    assert '@media (max-width: 480px)' in app_css
    assert '.table-responsive' in app_css
    assert '.mobile-bottom-nav' in app_css
    print("Verified: Full responsive CSS rules and breakpoints present in App.css!")

    print(">>> UI VERIFICATION PASSED ALL CHECKS! <<<\n")


if __name__ == '__main__':
    test_sql_database()
    test_fastapi_endpoints()
    test_ui_critical_risk_removal_and_high_risk_display()
    print("========================================")
    print("ALL TESTS AND VERIFICATIONS PASSED SUCCESSFULLY!")
    print("========================================")
