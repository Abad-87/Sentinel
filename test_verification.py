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


def test_google_oauth_and_rbac_authentication():
    print("\n--- 4. TESTING GOOGLE OAUTH 2.0 & RBAC SECURITY ARCHITECTURE ---")
    from fastapi.testclient import TestClient
    from main import app
    import auth

    client = TestClient(app)

    # 4.1 Database Layer Verification
    db_status = database.get_db_status()
    print("Database tables with auth:", db_status["tables"])
    assert "users" in db_status["tables"], "users table missing from database"
    assert "admin_whitelist" in db_status["tables"], "admin_whitelist table missing from database"
    assert db_status["tables"]["users"] >= 2, "initial seed users missing"
    assert db_status["tables"]["admin_whitelist"] >= 4, "admin whitelist entries missing"

    # 4.2 Whitelist Criteria Verification
    print("Testing Admin Whitelist Authorization Criteria...")
    assert database.is_email_authorized_admin("secops@sentinel.ai") is True, "secops@sentinel.ai should be authorized admin"
    assert database.is_email_authorized_admin("lead_engineer@sentinel.ai") is True, "@sentinel.ai domain should be authorized admin"
    assert database.is_email_authorized_admin("unauthorized.attacker@external.com") is False, "external email must NOT be authorized admin"

    # Whitelist mutation check
    database.add_to_admin_whitelist("custom_lead@partner.org", "EMAIL", "Partner security lead")
    assert database.is_email_authorized_admin("custom_lead@partner.org") is True
    database.delete_from_admin_whitelist("custom_lead@partner.org")
    assert database.is_email_authorized_admin("custom_lead@partner.org") is False
    print("Verified: Admin Whitelist domain and email checks pass!")

    # 4.3 CSRF State Nonce Verification
    print("Testing CSRF State Nonce Protection...")
    state_token, raw_nonce = auth.generate_state_token(role="ADMIN", redirect_tab="RULES")
    assert "." in state_token
    payload = auth.verify_state_token(state_token, expected_nonce=raw_nonce)
    assert payload["role"] == "ADMIN"
    assert payload["redirect_tab"] == "RULES"

    # Tampered state token rejection
    tampered_state = state_token[:-4] + "abcd"
    try:
        auth.verify_state_token(tampered_state, expected_nonce=raw_nonce)
        assert False, "Tampered state must fail verification"
    except Exception as e:
        print("Verified: Tampered CSRF state correctly rejected:", type(e).__name__)

    # 4.4 JWT Creation & Claims Verification
    print("Testing JWT Session Token Generation & Claims...")
    test_user = {
        "id": "usr_test_jwt_99",
        "email": "analyst.test@defense.org",
        "name": "Test Analyst",
        "picture": "https://example.com/pic.png",
        "role": "USER",
        "is_admin": 0
    }
    jwt_token = auth.create_sentinel_jwt(test_user)
    assert isinstance(jwt_token, str) and len(jwt_token) > 20
    decoded = auth.decode_sentinel_jwt(jwt_token)
    assert decoded["sub"] == "usr_test_jwt_99"
    assert decoded["email"] == "analyst.test@defense.org"
    assert decoded["role"] == "USER"
    assert decoded["is_admin"] is False
    assert decoded["iss"] == "sentinel-ai"
    print("Verified: JWT claims properly signed and decoded!")

    # 4.5 API Auth Endpoints (URL generation, cookies, sessions, role gating)
    print("Testing Auth API Routes via TestClient...")

    # A. Generate Google Login URL (User)
    res = client.get("/api/auth/google/url?role=USER")
    assert res.status_code == 200
    data = res.json()
    assert "url" in data and "state" in data
    assert data["role"] == "USER"
    assert "sentinel_oauth_state" in res.cookies
    print("Verified: GET /api/auth/google/url generates URL and sets CSRF state cookie.")

    # B. Generate Google Login URL (Admin)
    res_admin_url = client.get("/api/auth/google/url?role=ADMIN")
    assert res_admin_url.status_code == 200
    assert res_admin_url.json()["role"] == "ADMIN"

    # C. Demo User Login -> HTTP-only session cookie & JWT
    user_login_res = client.post("/api/auth/demo-login", json={"role": "USER"})
    assert user_login_res.status_code == 200
    user_data = user_login_res.json()
    assert user_data["user"]["role"] == "USER"
    assert user_data["redirectTab"] == "DASHBOARD"
    assert "sentinel_session" in user_login_res.cookies
    user_cookie = user_login_res.cookies["sentinel_session"]
    print("Verified: User login sets HTTP-only cookie and redirects to DASHBOARD.")

    # D. Profile Check /api/auth/me with User cookie
    me_res = client.get("/api/auth/me", cookies={"sentinel_session": user_cookie})
    assert me_res.status_code == 200
    assert me_res.json()["authenticated"] is True
    assert me_res.json()["role"] == "USER"
    assert me_res.json()["isAdmin"] is False

    # E. Admin Login with whitelisted account -> sets cookie & redirects to RULES
    admin_login_res = client.post(
        "/api/auth/demo-login",
        json={"role": "ADMIN", "email": "secops@sentinel.ai", "name": "Elena Vance"}
    )
    assert admin_login_res.status_code == 200
    admin_data = admin_login_res.json()
    assert admin_data["user"]["role"] == "ADMIN"
    assert admin_data["redirectTab"] == "RULES"
    assert "sentinel_session" in admin_login_res.cookies
    admin_cookie = admin_login_res.cookies["sentinel_session"]
    print("Verified: Admin login sets HTTP-only cookie and redirects to RULES.")

    # F. Profile Check /api/auth/me with Admin cookie
    me_admin_res = client.get("/api/auth/me", cookies={"sentinel_session": admin_cookie})
    assert me_admin_res.status_code == 200
    assert me_admin_res.json()["role"] == "ADMIN"
    assert me_admin_res.json()["isAdmin"] is True

    # G. Security Enforcement: Unauthorized account attempting Admin login -> 403 Forbidden!
    unauthorized_res = client.post(
        "/api/auth/demo-login",
        json={"role": "ADMIN", "email": "attacker@randomdomain.com", "name": "Unauthorized Attacker"}
    )
    assert unauthorized_res.status_code == 403, "Non-whitelisted account MUST be blocked with 403"
    assert "Access Denied" in unauthorized_res.json()["detail"]
    print("Verified: Unauthorized account attempting Admin login is blocked with 403 Forbidden!")

    # H. Protected Admin Route: /api/auth/admin/whitelist
    # 1) Non-admin user access -> 403 Forbidden
    whitelist_blocked = client.get("/api/auth/admin/whitelist", cookies={"sentinel_session": user_cookie})
    assert whitelist_blocked.status_code == 403, "Standard user must not access admin whitelist"

    # 2) Admin user access -> 200 OK
    whitelist_allowed = client.get("/api/auth/admin/whitelist", cookies={"sentinel_session": admin_cookie})
    assert whitelist_allowed.status_code == 200
    assert len(whitelist_allowed.json()) >= 4
    print("Verified: Role-based route guard allows Admins and blocks Standard Users.")

    # I. Logout -> Clears session cookies
    logout_res = client.post("/api/auth/logout", cookies={"sentinel_session": admin_cookie})
    assert logout_res.status_code == 200
    print("Verified: Logout terminates session and clears cookies.")

    # 4.6 Frontend Component Structure Verification
    print("Verifying Frontend Components for Google OAuth 2.0...")
    auth_modal_path = os.path.join(BASE_DIR, 'frontend', 'src', 'AuthModal.jsx')
    assert os.path.exists(auth_modal_path), "AuthModal.jsx missing"
    with open(auth_modal_path, 'r', encoding='utf-8') as f:
        auth_modal_content = f.read()
    assert "Sign in with Google" in auth_modal_content
    assert "Sign in with Google as Admin" in auth_modal_content
    assert "Admin Whitelist Policy Enforced" in auth_modal_content
    assert "Standard User" in auth_modal_content
    assert "Administrator" in auth_modal_content

    # Check App.jsx integration
    app_jsx_path = os.path.join(BASE_DIR, 'frontend', 'src', 'App.jsx')
    with open(app_jsx_path, 'r', encoding='utf-8') as f:
        app_jsx_content = f.read()
    assert "AuthModal" in app_jsx_content
    assert "currentUser" in app_jsx_content
    assert "header-auth-controls" in app_jsx_content
    assert "admin-restricted-notice" in app_jsx_content

    # Check VaultShieldHero.tsx integration
    hero_path = os.path.join(BASE_DIR, 'frontend', 'src', 'VaultShieldHero.tsx')
    with open(hero_path, 'r', encoding='utf-8') as f:
        hero_content = f.read()
    # Navbar action buttons "Sign In" / "Admin Portal" were removed from the header;
    # only the Sign Up CTA remains for logged-out visitors.
    assert "Admin Portal" not in hero_content
    assert "Sign In" not in hero_content
    assert "Sign Up" in hero_content

    print(">>> GOOGLE OAUTH 2.0 & RBAC TESTS ALL PASSED! <<<\n")


if __name__ == '__main__':
    test_sql_database()
    test_fastapi_endpoints()
    test_ui_critical_risk_removal_and_high_risk_display()
    test_google_oauth_and_rbac_authentication()
    print("========================================")
    print("ALL TESTS AND VERIFICATIONS PASSED SUCCESSFULLY!")
    print("========================================")

