"""Ad-hoc verification of demo-login and google-login flows (mocked credential)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))

import backend.secure_auth as secure_auth_mod  # noqa: F401  (ensure both module objects are loaded)
from unittest.mock import patch
from contextlib import ExitStack
from fastapi.testclient import TestClient
import main


def fake_google(claims):
    """Patch verify_google_id_token on every loaded secure_auth module object."""
    stack = ExitStack()
    for name, mod in list(sys.modules.items()):
        if name == "secure_auth" or name.endswith(".secure_auth"):
            stack.enter_context(patch.object(mod, "verify_google_id_token", return_value=claims))
    return stack

client = TestClient(main.app)

# --- 1. Demo persona login must yield a session that /me accepts ---
r = client.get("/api/auth/csrf")
tok = r.json()["csrfToken"]
r = client.post("/api/auth/demo-login", json={"role": "USER"},
                headers={"X-CSRF-Token": tok})
assert r.status_code == 200, r.text
r = client.get("/api/auth/me")
assert r.status_code == 200, f"demo /me failed: {r.status_code} {r.text}"
print("1. demo-login -> /me OK:", r.json()["user"]["name"])

# --- 2. Google login linking the seeded passwordless superadmin row ---
claims = {
    "email": "abadmustafa280@gmail.com",
    "sub": "10982374610982736455",
    "name": "Abad Mustafa",
    "picture": "https://example.com/p.png",
}
client.cookies.delete("sentinel_session")  # fresh guest
r = client.get("/api/auth/csrf")
tok = r.json()["csrfToken"]
with fake_google(claims):
    r = client.post("/api/auth/google", json={"credential": "fake", "portal": "user"},
                    headers={"X-CSRF-Token": tok})
assert r.status_code == 200, f"first google login failed: {r.status_code} {r.text}"
print("2. google login (seeded row link) OK:", r.json()["user"]["email"])

# Second login must take the normal google_id row path.
r = client.get("/api/auth/csrf")
tok = r.json()["csrfToken"]
with fake_google(claims):
    r = client.post("/api/auth/google", json={"credential": "fake", "portal": "user"},
                    headers={"X-CSRF-Token": tok})
assert r.status_code == 200, f"second google login failed: {r.status_code} {r.text}"
r = client.get("/api/auth/me")
assert r.status_code == 200, f"google /me failed: {r.text}"
print("3. google login repeat + /me OK")

# --- 3. Registered (password) users must still be rejected by Google 409 ---
claims2 = dict(claims, email="e2e-test-324513110@example.com", sub="77700011122233344455")
r = client.get("/api/auth/csrf")
tok = r.json()["csrfToken"]
with fake_google(claims2):
    r = client.post("/api/auth/google", json={"credential": "fake", "portal": "user"},
                    headers={"X-CSRF-Token": tok})
assert r.status_code == 409, f"expected 409 for password-backed conflict, got {r.status_code} {r.text}"
print("4. google login on password-registered email correctly -> 409")

# --- Restore seeded row to its pre-test state ---
import sqlite3
with sqlite3.connect(Path(__file__).parent / "backend" / "sentinel.db") as c:
    c.execute("UPDATE users SET google_id='master_google_abad_001', identity_trusted=0, email_verified=0 WHERE id='usr_master_superadmin_000'")
print("5. seeded superadmin row restored to original state")
print("ALL GOOGLE/DEMO CHECKS PASSED")
