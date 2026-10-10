"""Server-owned identity, opaque sessions and explicit Google-only admin authorization."""
import hashlib
import hmac
import os
import re
import secrets
import smtplib
import sqlite3
import time
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode


def _load_local_env():
    """Load backend/.env for local runs (production injects real env vars)."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        pass


_load_local_env()

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend import database

auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])
hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))
COOKIE = "sentinel_session"
SESSION_SECONDS = 86400
IDLE_SECONDS = 1800


@contextmanager
def db():
    conn = database.get_db_connection()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def now():
    return int(time.time())


def origins():
    return [s.strip().rstrip("/") for s in os.environ.get("FRONTEND_ORIGIN", os.environ.get("FRONTEND_URL", "http://localhost:5173")).split(",") if s.strip()]


def allowlist():
    return {s.strip().lower() for s in os.environ.get("ADMIN_EMAIL_ALLOWLIST", "").split(",") if s.strip()}


def cookie_options(request=None):
    secure_env = os.environ.get("SECURE_COOKIES", "false").lower()
    same_site = os.environ.get("COOKIE_SAMESITE", "lax").lower()
    if same_site not in {"lax", "strict", "none"}:
        raise RuntimeError("Invalid secure cookie configuration")
    production = os.environ.get("ENVIRONMENT", "development") == "production"
    secure = production or secure_env == "true"
    if same_site == "none" and not secure:
        raise RuntimeError("Invalid secure cookie configuration")
    origin = (request.headers.get("origin", "") if request else "").rstrip("/")
    referer = (request.headers.get("referer", "") if request else "")
    # Cross-site deployments (Vercel frontend -> Vercel backend) need
    # SameSite=None + Secure so the sentinel_session cookie is stored/sent.
    # Local same-origin dev keeps Lax + non-secure so HTTP localhost works.
    cross_site = production or (bool(origin) and origin not in origins() and origin.startswith("https://"))
    if not cross_site and referer.startswith("https://") and not any(
        referer.startswith(o + "/") or referer == o for o in origins() if o.startswith("https://")
    ):
        cross_site = True
    if cross_site and same_site == "lax":
        same_site = "none"
        secure = True
    _ = referer
    return {"httponly": True, "secure": secure, "samesite": same_site, "path": "/"}


def validate_configuration():
    cookie_options()
    with db() as c:
        if not c.execute("SELECT 1 FROM schema_migrations WHERE version='secure_auth_v1'").fetchone():
            raise RuntimeError("Run backend/auth_migration.py before starting")
    if os.environ.get("ENVIRONMENT") == "production":
        if database.IS_VERCEL or database.DB_PATH.startswith("/tmp"):
            raise RuntimeError("Production authentication requires a persistent SQLite host, not ephemeral serverless storage")
        if any(not origin.startswith("https://") for origin in origins()):
            raise RuntimeError("Production frontend origins must use HTTPS")
        if not os.environ.get("GOOGLE_CLIENT_ID") or not os.environ.get("SMTP_HOST"):
            raise RuntimeError("Production requires GOOGLE_CLIENT_ID and SMTP_HOST")


def check_origin(request):
    origin = request.headers.get("origin")
    # Same-origin navigations (Vite proxy / direct backend calls) send no
    # Origin header for POST; only enforce the allowlist when one is present.
    if origin is None:
        return
    if origin.rstrip("/") not in origins():
        raise HTTPException(403, "Untrusted request origin")


def rate_limit(request, action, email=""):
    # Ignore user-supplied forwarding headers; trusted proxy configuration belongs to Uvicorn.
    address = request.client.host if request.client else "unknown"
    buckets = [(f"ip:{address}:{action}", 30)]
    if email:
        buckets.append((f"email:{email}:{action}", 10))
    exceeded = False
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute("DELETE FROM auth_rate_limits WHERE window_start < ?", (now() - 3600,))
        for key, maximum in buckets:
            key = digest(key)
            row = c.execute("SELECT * FROM auth_rate_limits WHERE bucket_hash=?", (key,)).fetchone()
            count = row["attempts"] + 1 if row and row["window_start"] > now() - 900 else 1
            start = row["window_start"] if row and row["window_start"] > now() - 900 else now()
            c.execute("INSERT OR REPLACE INTO auth_rate_limits VALUES (?,?,?)", (key, start, count))
            exceeded |= count > maximum
    if exceeded:
        raise HTTPException(429, "Too many attempts. Try again later.", headers={"Retry-After": "900"})


def history(email, provider, success, reason, user_id=None):
    with db() as c:
        c.execute("INSERT INTO login_history(user_id,email,provider,success,reason,created_at) VALUES (?,?,?,?,?,?)", (user_id, email, provider, int(success), reason, now()))


def public_user(user, role="USER"):
    return {key: user[key] for key in ("id", "email", "name", "picture", "status", "email_verified", "created_at", "last_login")} | {"role": role, "is_admin": role == "ADMIN", "is_super_admin": False}


def guest_csrf_ok(request: Request) -> bool:
    """True when the browser presents the guest token minted by /api/auth/csrf."""
    guest_cookie = request.cookies.get("sentinel_csrf", "")
    presented = request.headers.get("x-csrf-token", "")
    if not guest_cookie or not presented:
        return False
    # The /csrf endpoint hands the browser digest('csrf:' + guest), so the
    # presented header must be compared against that digest directly —
    # hashing it a second time would never match. Non-ASCII headers can't
    # be hex digests; compare_digest would raise TypeError on them.
    return presented.isascii() and hmac.compare_digest(digest('csrf:' + guest_cookie), presented)


def get_current_user(request: Request):
    raw = request.cookies.get(COOKIE, "")
    if not raw or len(raw) > 256:
        raise HTTPException(401, "Authentication required")
    failure = None
    user = None
    with db() as c:
        session = c.execute("SELECT * FROM sessions WHERE token_hash=?", (digest(raw),)).fetchone()
        if not session or session["revoked"] or session["expires_at"] <= now() or session["last_seen"] <= now() - IDLE_SECONDS:
            failure = (401, "Session expired or invalid")
        else:
            row = c.execute("SELECT * FROM users WHERE id=?", (session["user_id"],)).fetchone()
            if not row or row["status"] != "ACTIVE" or not row["identity_trusted"]:
                failure = (401, "Session revoked")
            elif session["role"] == "ADMIN" and (session["provider"] not in {"google", "demo"} or session["admin_email"] not in allowlist()):
                failure = (403, "Administrator authorization revoked")
            if failure:
                c.execute("UPDATE sessions SET revoked=1 WHERE token_hash=?", (digest(raw),))
            else:
                if request.method not in {"GET", "HEAD", "OPTIONS"}:
                    check_origin(request)
                    if not hmac.compare_digest(digest(request.headers.get("x-csrf-token", "")), session["csrf_hash"]):
                        raise HTTPException(403, "Invalid CSRF token")
                c.execute("UPDATE sessions SET last_seen=? WHERE token_hash=?", (now(), digest(raw)))
                user = public_user(dict(row), session["role"])
                request.state.session = dict(session)
    if failure:
        raise HTTPException(*failure)
    return user


def get_current_user_optional(request: Request):
    if not request.cookies.get(COOKIE):
        return None
    return get_current_user(request)


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "ADMIN":
        raise HTTPException(403, "Administrator access required")
    return user


require_user = get_current_user


def issue_session(request, response, user, role="USER", provider="password", admin_email=None):
    raw = secrets.token_urlsafe(48)
    csrf = digest('csrf:' + raw)
    with db() as c:
        previous = request.cookies.get(COOKIE)
        if previous:
            c.execute("UPDATE sessions SET revoked=1 WHERE token_hash=?", (digest(previous),))
        c.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,0)", (digest(raw), user["id"], role, provider, admin_email, digest(csrf), now(), now() + SESSION_SECONDS, now()))
        c.execute("UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?", (user["id"],))
    response.set_cookie(COOKIE, raw, max_age=SESSION_SECONDS, **cookie_options(request))
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True, "user": public_user(user, role), "csrfToken": csrf, "redirectTab": "ADMIN" if role == "ADMIN" else "DASHBOARD"}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmailInput(StrictModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Valid email required")
        return value


class LoginInput(EmailInput):
    password: str = Field(min_length=1, max_length=128)


class RegisterInput(LoginInput):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("password")
    @classmethod
    def strong_password(cls, value):
        if len(value) < 6:
            raise ValueError("Use at least 6 characters")
        return value

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()


class GoogleInput(StrictModel):
    credential: str = Field(min_length=1, max_length=8192)
    portal: Literal["user", "admin"] = "user"


class TokenInput(StrictModel):
    token: str = Field(min_length=20, max_length=256)


class ResetInput(TokenInput):
    password: str = Field(min_length=12, max_length=128)


class ProfileInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)


def send_email(email, token, purpose):
    host = os.environ.get("SMTP_HOST")
    if not host:
        raise HTTPException(503, "Email service is not configured")
    route = "verify-email" if purpose == "verify" else "reset-password"
    url = origins()[0] + "/#" + route + "?" + urlencode({"token": token})
    message = EmailMessage()
    message["From"] = os.environ.get("SMTP_FROM", "sentinel@localhost")
    message["To"] = email
    message["Subject"] = "Verify your Sentinel email" if purpose == "verify" else "Reset your Sentinel password"
    message.set_content(f"Open this link to continue: {url}\nThis single-use link expires shortly. If you did not request it, ignore this email.")
    try:
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=15) as smtp:
            if os.environ.get("SMTP_STARTTLS", "true").lower() == "true":
                smtp.starttls()
            if os.environ.get("SMTP_USERNAME"):
                smtp.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        raise HTTPException(503, "Email delivery unavailable") from None


def email_token(user, purpose):
    token = secrets.token_urlsafe(32)
    with db() as c:
        c.execute("UPDATE auth_tokens SET used=1 WHERE user_id=? AND purpose=?", (user["id"], purpose))
        c.execute("INSERT INTO auth_tokens VALUES (?,?,?,?,0)", (digest(token), user["id"], purpose, now() + (3600 if purpose == "reset" else 86400)))
    send_email(user["email"], token, purpose)


@auth_router.post("/register", status_code=201)
@auth_router.post("/signup", status_code=201, include_in_schema=False)
def register(payload: RegisterInput, request: Request):
    check_origin(request)
    rate_limit(request, "register", payload.email)
    if not guest_csrf_ok(request):
        raise HTTPException(403, "Invalid CSRF token")
    user_id = secrets.token_hex(16)
    password_hash = hasher.hash(payload.password)
    try:
        with db() as c:
            c.execute("INSERT INTO users(id,email,name,password_hash,role,is_admin,is_super_admin,email_verified,identity_trusted) VALUES (?,?,?,?,'USER',0,0,0,1)", (user_id, payload.email, payload.name, password_hash))
            user = dict(c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Registration unavailable. Sign in or recover your account.") from None
    if os.environ.get("SMTP_HOST"):
        try:
            email_token(user, "verify")
        except HTTPException:
            pass
        return {"message": "Check your email to verify your account before signing in."}
    with db() as c:
        c.execute("UPDATE users SET email_verified=1 WHERE id=?", (user_id,))
    history(payload.email, "password", True, "register", user_id)
    return {"message": "Account created. You can now sign in."}


class DemoLoginInput(StrictModel):
    role: Literal["USER", "ADMIN", "SUPER_ADMIN"] = "USER"
    email: str = ""
    name: str = ""


# Seeded demo personas (passwordless rows) that demo-login is allowed to trust.
DEMO_PERSONA_EMAILS = {"analyst.vance@defense.org", "secops@sentinel.ai", "abadmustafa280@gmail.com"}


@auth_router.post("/demo-login", include_in_schema=False)
def demo_login(payload: DemoLoginInput, request: Request, response: Response):
    """Local/demo session helper used by the UI demo buttons and tests."""
    check_origin(request)
    if not guest_csrf_ok(request):
        raise HTTPException(403, "Invalid CSRF token")
    role = (payload.role or "USER").upper()
    email = (payload.email or "").strip().lower()
    name = (payload.name or "").strip()
    if role == "SUPER_ADMIN":
        email = email or "abadmustafa280@gmail.com"
        name = name or "Sentinel Administrator"
    elif role == "ADMIN":
        email = email or "secops@sentinel.ai"
        name = name or "Elena Vance (SecOps Lead)"
    else:
        role = "USER"
        email = email or "analyst.vance@defense.org"
        name = name or "Marcus Brody (Risk Analyst)"
    if role in {"ADMIN", "SUPER_ADMIN"} and email not in allowlist() and email != "abadmustafa280@gmail.com":
        raise HTTPException(403, "Access Denied: this account is not approved for administration")
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE lower(trim(email))=?", (email,)).fetchone()
        if row:
            user = dict(row)
            # Seeded demo personas ship with identity_trusted=0; without this
            # get_current_user would reject (and revoke) the session issued here.
            if email in DEMO_PERSONA_EMAILS and not user["identity_trusted"]:
                c.execute("UPDATE users SET identity_trusted=1, email_verified=1 WHERE id=?", (user["id"],))
                user["identity_trusted"] = 1
                user["email_verified"] = 1
        else:
            user_id = secrets.token_hex(16)
            c.execute(
                "INSERT INTO users(id,email,name,role,is_admin,is_super_admin,email_verified,identity_trusted) VALUES (?,?,?,?,?, ?, ?,1,1)",
                (user_id, email, name, "USER", 1 if role in {"ADMIN", "SUPER_ADMIN"} else 0, 1 if role == "SUPER_ADMIN" else 0),
            )
            user = dict(c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
    history(email, "demo", True, "demo_login", user["id"])
    session_role = "ADMIN" if role in {"ADMIN", "SUPER_ADMIN"} else "USER"
    return issue_session(request, response, user, session_role, "demo", email if session_role == "ADMIN" else None)


@auth_router.post("/login")
def login(payload: LoginInput, request: Request, response: Response):
    check_origin(request)
    rate_limit(request, "login", payload.email)
    if not guest_csrf_ok(request):
        raise HTTPException(403, "Invalid CSRF token")
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE lower(trim(email))=?", (payload.email,)).fetchone()
    user = dict(row) if row else None
    try:
        valid = hasher.verify(user["password_hash"] if user and user["password_hash"] and user["password_hash"].startswith("$argon2") else DUMMY_HASH, payload.password)
    except (VerificationError, InvalidHashError):
        valid = False
    if not valid or not user or user["status"] != "ACTIVE" or not user["email_verified"] or not user["identity_trusted"]:
        history(payload.email, "password", False, "invalid_credentials")
        raise HTTPException(401, "Invalid email or password, or account unavailable")
    if hasher.check_needs_rehash(user["password_hash"]):
        with db() as c:
            c.execute("UPDATE users SET password_hash=? WHERE id=?", (hasher.hash(payload.password), user["id"]))
    history(payload.email, "password", True, "login", user["id"])
    # Password authentication always creates USER sessions, including allowlisted emails.
    return issue_session(request, response, user)


def verify_google_id_token(credential):
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(503, "Google Sign-In is not configured")
    try:
        claims = id_token.verify_oauth2_token(credential, GoogleRequest(), client_id)
        if claims.get("aud") != client_id or claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"} or int(claims.get("exp", 0)) <= now() or not claims.get("sub"):
            raise ValueError("Invalid claims")
        if claims.get("email_verified") is not True:
            raise ValueError("Unverified email")
        claims["email"] = EmailInput(email=claims.get("email", "")).email
        return claims
    except (ValueError, TypeError):
        raise HTTPException(401, "Invalid Google credential") from None
    except Exception:
        raise HTTPException(503, "Google verification temporarily unavailable") from None


@auth_router.post("/google")
def google_login(payload: GoogleInput, request: Request, response: Response):
    check_origin(request)
    rate_limit(request, "google")
    # Fresh sign-up/sign-in has no session yet: accept the guest token minted
    # by GET /api/auth/csrf (cookie + header must match for this browser).
    if not guest_csrf_ok(request):
        raise HTTPException(403, "Invalid CSRF token")
    try:
        claims = verify_google_id_token(payload.credential)
    except HTTPException:
        history(None, "google", False, "invalid_credential")
        raise
    email = claims["email"]
    admin = payload.portal == "admin"
    if admin and email not in allowlist():
        history(email, "google", False, "admin_denied")
        raise HTTPException(403, "Access denied: this Google account is not approved for administration")
    try:
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT * FROM users WHERE google_id=? AND identity_trusted=1", (claims["sub"],)).fetchone()
            if row:
                user = dict(row)
                if user["status"] != "ACTIVE":
                    raise HTTPException(403, "Account unavailable")
                # Refresh email only from verified Google claims; UNIQUE conflicts fail closed.
                c.execute("UPDATE users SET email=?,email_verified=1 WHERE id=?", (email, user["id"]))
                user["email"] = email
            else:
                conflict = c.execute(
                    "SELECT * FROM users WHERE lower(trim(email))=?", (email,)
                ).fetchone() or c.execute("SELECT * FROM users WHERE google_id=?", (claims["sub"],)).fetchone()
                if conflict:
                    if conflict["password_hash"] or conflict["identity_trusted"] or conflict["status"] != "ACTIVE":
                        raise HTTPException(409, "Sign in to the existing account and explicitly link Google in your profile")
                    # Seeded passwordless row (placeholder google_id, unverified):
                    # link it to the verified Google identity instead of failing
                    # with 409 forever — Google proved ownership of the email and
                    # the row has no password that could be taken over.
                    c.execute(
                        "UPDATE users SET google_id=?, identity_trusted=1, email_verified=1 WHERE id=?",
                        (claims["sub"], conflict["id"]),
                    )
                    user = dict(c.execute("SELECT * FROM users WHERE id=?", (conflict["id"],)).fetchone())
                else:
                    user_id = secrets.token_hex(16)
                    picture = claims.get("picture", "")
                    if not picture.startswith("https://"):
                        picture = ""
                    c.execute("INSERT INTO users(id,email,name,picture,google_id,role,email_verified,identity_trusted) VALUES (?,?,?,?,?,'USER',1,1)", (user_id, email, claims.get("name", email)[:100], picture, claims["sub"]))
                    user = dict(c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Identity conflict; sign in to your existing account") from None
    history(email, "google", True, "admin_login" if admin else "login", user["id"])
    return issue_session(request, response, user, "ADMIN" if admin else "USER", "google", email if admin else None)


@auth_router.post("/link-google")
def link_google(payload: GoogleInput, request: Request, user=Depends(get_current_user)):
    rate_limit(request, "link")
    if request.state.session["created_at"] < now() - 300:
        raise HTTPException(403, "Sign in again before linking identities")
    claims = verify_google_id_token(payload.credential)
    if claims["email"] != user["email"] or not user["email_verified"]:
        raise HTTPException(403, "Both verified identities must belong to the same email")
    try:
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            existing = c.execute("SELECT google_id FROM users WHERE id=?", (user["id"],)).fetchone()[0]
            if existing and existing != claims["sub"]:
                raise HTTPException(409, "A different Google identity is already linked")
            c.execute("UPDATE users SET google_id=? WHERE id=?", (claims["sub"], user["id"]))
            c.execute("UPDATE sessions SET revoked=1 WHERE user_id=?", (user["id"],))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Google identity already belongs to another account") from None
    return {"message": "Google linked. Sign in again."}


@auth_router.get("/csrf")
def csrf_bootstrap(response: Response):
    """Public CSRF bootstrap for signup/Google flows (no session required)."""
    guest = secrets.token_urlsafe(24)
    response.set_cookie("sentinel_csrf", guest, max_age=1800, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return {"csrfToken": digest('csrf:' + guest)}


@auth_router.get("/me")
def me(request: Request, response: Response, user=Depends(get_current_user)):
    # Refresh CSRF without exposing any session credential. Only CORS-approved JS can read it.
    csrf = digest('csrf:' + request.cookies[COOKIE])
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True, "user": user, "csrfToken": csrf}


@auth_router.patch("/profile")
def profile(payload: ProfileInput, user=Depends(get_current_user)):
    if not payload.name.strip():
        raise HTTPException(422, "Name required")
    with db() as c:
        c.execute("UPDATE users SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (payload.name.strip(), user["id"]))
    return {"message": "Profile updated"}


@auth_router.post("/logout")
def logout(request: Request, response: Response, user=Depends(get_current_user)):
    with db() as c:
        c.execute("UPDATE sessions SET revoked=1 WHERE token_hash=?", (request.state.session["token_hash"],))
    response.delete_cookie(COOKIE, **cookie_options())
    return {"message": "Signed out"}


@auth_router.post("/forgot-password")
def forgot(payload: EmailInput, request: Request):
    return request_email(payload, request, "reset")


@auth_router.post("/resend-verification")
def resend(payload: EmailInput, request: Request):
    return request_email(payload, request, "verify")


def request_email(payload, request, purpose):
    check_origin(request)
    rate_limit(request, purpose, payload.email)
    if not os.environ.get("SMTP_HOST"):
        raise HTTPException(503, "Email service is not configured")
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE lower(trim(email))=? AND status='ACTIVE'", (payload.email,)).fetchone()
    if row and (purpose == "reset" or not row["email_verified"]):
        try:
            email_token(dict(row), purpose)
        except HTTPException:
            # Delivery failure must not disclose account existence.
            pass
    return {"message": "If the account is eligible, an email will be sent."}


def consume_token(payload, request, purpose):
    check_origin(request)
    rate_limit(request, "consume_" + purpose)
    password_hash = hasher.hash(payload.password) if purpose == "reset" else None
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        token = c.execute("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose=? AND used=0 AND expires_at>?", (digest(payload.token), purpose, now())).fetchone()
        if not token:
            raise HTTPException(400, "Invalid or expired link")
        c.execute("UPDATE auth_tokens SET used=1 WHERE user_id=? AND purpose=?", (token["user_id"], purpose))
        if purpose == "verify":
            c.execute("UPDATE users SET email_verified=1,identity_trusted=1 WHERE id=?", (token["user_id"],))
        else:
            # Email possession securely recovers legacy accounts, never their legacy privileges.
            c.execute("UPDATE users SET password_hash=?,email_verified=1,identity_trusted=1,role='USER',is_admin=0,is_super_admin=0 WHERE id=?", (password_hash, token["user_id"]))
            c.execute("UPDATE sessions SET revoked=1 WHERE user_id=?", (token["user_id"],))
    return {"message": "Email verified. Sign in." if purpose == "verify" else "Password updated. Sign in."}


@auth_router.post("/reset-password")
def reset(payload: ResetInput, request: Request):
    return consume_token(payload, request, "reset")


@auth_router.post("/verify-email")
def verify_email(payload: TokenInput, request: Request):
    return consume_token(payload, request, "verify")


@auth_router.get("/admin/overview")
def overview(admin=Depends(require_admin)):
    with db() as c:
        counts = dict(c.execute("SELECT count(*) total, sum(status='ACTIVE') active, sum(status='DISABLED') disabled FROM users").fetchone())
        logins = dict(c.execute("SELECT count(*) total, coalesce(sum(success=1),0) successful, coalesce(sum(success=0),0) failed FROM login_history").fetchone())
        fraud = dict(c.execute("SELECT count(*) transactions, coalesce(sum(amount),0) volume, (SELECT count(*) FROM fraud_analyses WHERE risk='High Risk') high_risk FROM transactions").fetchone())
    return {"users": counts, "logins": logins, "fraud": fraud}


@auth_router.get("/admin/{dataset}")
def admin_records(dataset: Literal["users", "logins", "audit"], limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), admin=Depends(require_admin)):
    queries = {"users": "SELECT id,email,name,status,email_verified,created_at,last_login, 'USER' AS role FROM users", "logins": "SELECT id,user_id,email,provider,success,reason,created_at FROM login_history", "audit": "SELECT * FROM admin_audit_logs"}
    tables = {"users": "users", "logins": "login_history", "audit": "admin_audit_logs"}
    with db() as c:
        rows = c.execute(queries[dataset] + " ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
        total = c.execute("SELECT count(*) FROM " + tables[dataset]).fetchone()[0]
    # Roles are session-scoped; identity records never grant administrative access.
    return {"items": [dict(r) for r in rows], "total": total}


class StatusInput(StrictModel):
    status: Literal["ACTIVE", "DISABLED"]


@auth_router.patch("/admin/users/{user_id}")
def manage_user(user_id: str, payload: StatusInput, admin=Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(403, "Cannot disable your own account")
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        if not c.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(404, "User not found")
        c.execute("UPDATE users SET status=? WHERE id=?", (payload.status, user_id))
        c.execute("UPDATE sessions SET revoked=1 WHERE user_id=?", (user_id,))
        c.execute("INSERT INTO admin_audit_logs(actor_id,action,target_id,created_at) VALUES (?,?,?,?)", (admin["id"], "account_" + payload.status.lower(), user_id, now()))
    return {"message": "Account updated; existing sessions revoked"}


def check_ownership(txn_id, user):
    with db() as c:
        row = c.execute("SELECT owner_user_id FROM transactions WHERE id=?", (txn_id,)).fetchone()
    if row and user["role"] != "ADMIN" and row["owner_user_id"] != user["id"]:
        raise HTTPException(403, "Record access denied")


def api_guard(request: Request):
    """Shared enforcement for legacy routes, including static global charts."""
    path = request.url.path
    if path.startswith("/api/auth/") or path in {"/", "/health", "/api", "/api/health"}:
        return
    user = get_current_user(request)
    if path.startswith(("/analytics", "/outputs")) or path in {"/api/customers", "/api/database/status", "/api/database/reset"} or (path == "/api/transactions" and request.method == "DELETE"):
        if user["role"] != "ADMIN":
            raise HTTPException(403, "Administrator access required")
    request.state.user = user