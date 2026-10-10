"""
Sentinel AI - Google OAuth 2.0 & Session Security Architecture
Handles OAuth 2.0 flow, CSRF state verification, JWT session tokens,
secure HTTP-only cookies, and Admin whitelist authorization.
"""

import os
import time
import json
import base64
import hmac
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import requests
import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

try:
    import database
except ImportError:
    from backend import database

# ============================================================================
# CONFIGURATION & SECURITY PARAMS
# ============================================================================

JWT_SECRET_KEY = os.environ.get(
    "SENTINEL_JWT_SECRET",
    "sentinel-defense-grade-jwt-secret-key-2026-prod-ac9872"
)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days session

# Google OAuth 2.0 credentials from environment
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/api/auth/google/callback"
)

# Cookies
SESSION_COOKIE_NAME = "sentinel_session"
STATE_COOKIE_NAME = "sentinel_oauth_state"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def is_secure_connection(request: Request) -> bool:
    """Determine whether cookies should have the Secure attribute."""
    # Explicit override in production
    if os.environ.get("SECURE_COOKIES", "").lower() in {"1", "true", "yes"}:
        return True
    if os.environ.get("ENVIRONMENT", "").lower() in {"production", "staging"}:
        return True
    # Check headers (X-Forwarded-Proto from reverse proxies)
    proto = request.headers.get("x-forwarded-proto", "")
    if proto.lower() == "https":
        return True
    return request.url.scheme == "https"


# ============================================================================
# CSRF STATE NONCE VERIFICATION
# ============================================================================

def generate_state_token(role: str = "USER", redirect_tab: Optional[str] = None) -> Tuple[str, str]:
    """
    Generate a cryptographically tamper-proof OAuth state parameter.
    Returns (signed_state_string, raw_nonce).
    """
    raw_nonce = secrets.token_urlsafe(32)
    payload = {
        "nonce": raw_nonce,
        "role": role.upper(),
        "redirect_tab": redirect_tab or ("RULES" if role.upper() == "ADMIN" else "DASHBOARD"),
        "ts": int(time.time())
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode('utf-8')).decode('utf-8').rstrip('=')
    
    # Sign with HMAC-SHA256 to prevent spoofing/tampering
    sig = hmac.new(JWT_SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode('utf-8').rstrip('=')
    
    signed_state = f"{payload_b64}.{sig_b64}"
    return signed_state, raw_nonce


def verify_state_token(received_state: str, expected_nonce: Optional[str] = None) -> Dict[str, Any]:
    """
    Verify the CSRF state parameter returned from Google.
    Ensures signature validity, expiration (15 mins), and matches state cookie.
    """
    if not received_state or '.' not in received_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state parameter structure (CSRF protection failed)."
        )

    parts = received_state.split('.')
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed state parameter token."
        )

    payload_b64, sig_b64 = parts

    # Re-compute signature
    expected_sig = hmac.new(JWT_SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).digest()
    expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode('utf-8').rstrip('=')

    if not hmac.compare_digest(sig_b64, expected_sig_b64):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="State parameter signature verification failed (Potential CSRF attack)."
        )

    # Decode JSON payload
    try:
        padded = payload_b64 + '=' * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(padded)
        payload = json.loads(payload_bytes.decode('utf-8'))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to decode state parameter payload: {str(e)}"
        )

    # Check expiration (valid for 15 minutes)
    if time.time() - payload.get("ts", 0) > 900:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth state parameter has expired. Please initiate login again."
        )

    # If cookie nonce is present, enforce exact nonce equality
    if expected_nonce and payload.get("nonce") != expected_nonce:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth state nonce mismatch with session cookie (Potential CSRF attack)."
        )

    return payload


# ============================================================================
# JWT SESSION TOKEN MANAGEMENT
# ============================================================================

def create_sentinel_jwt(user: Dict[str, Any]) -> str:
    """Issue a signed JWT containing user identity and authorization claims."""
    now = datetime.utcnow()
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    is_super = bool(
        user.get("is_super_admin", 0) or
        user.get("role") == "SUPER_ADMIN" or
        database.is_super_admin_email(user.get("email", ""))
    )
    is_adm = bool(user.get("is_admin", 0) or user.get("role") in ("ADMIN", "SUPER_ADMIN") or is_super)
    claims = {
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture", ""),
        "role": user["role"],
        "is_admin": is_adm,
        "is_super_admin": is_super,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "iss": "sentinel-ai",
        "aud": "sentinel-ai"
    }
    return jwt.encode(claims, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_sentinel_jwt(token: str) -> Dict[str, Any]:
    """Decode and validate an active Sentinel session JWT."""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            issuer="sentinel-ai",
            audience="sentinel-ai"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please log in again."
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid session token: {str(e)}"
        )


def set_auth_cookies(response: Response, token: str, request: Request):
    """Set secure HTTP-only SameSite session cookie."""
    secure_flag = is_secure_connection(request)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=60 * ACCESS_TOKEN_EXPIRE_MINUTES,
        httponly=True,
        samesite="lax",
        secure=secure_flag,
        path="/"
    )


def clear_auth_cookies(response: Response):
    """Remove session and state cookies upon logout."""
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(key=STATE_COOKIE_NAME, path="/")


# ============================================================================
# GOOGLE OAUTH 2.0 PROTOCOL INTEGRATION
# ============================================================================

def get_google_authorization_url(role: str = "USER", redirect_tab: Optional[str] = None) -> Tuple[str, str, str]:
    """Construct Google OAuth 2.0 consent dialog URL with signed CSRF state."""
    signed_state, raw_nonce = generate_state_token(role, redirect_tab)

    if not GOOGLE_CLIENT_ID:
        # Development / Demo fallback notice
        auth_url = f"{FRONTEND_URL}/?auth_notice=no_client_id&role={role}&state={signed_state}"
        return auth_url, signed_state, raw_nonce

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": signed_state,
        "access_type": "offline",
        "prompt": "select_account"
    }
    encoded = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{encoded}"
    return auth_url, signed_state, raw_nonce


def exchange_code_for_google_tokens(code: str) -> Dict[str, Any]:
    """Exchange authorization code for Google access and ID tokens."""
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    resp = requests.post(token_url, data=data, timeout=10)
    if not resp.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google token exchange failed: {resp.text}"
        )
    return resp.json()


def fetch_google_userinfo(access_token: str) -> Dict[str, Any]:
    """Fetch user profile metadata from Google UserInfo endpoint."""
    userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(userinfo_url, headers=headers, timeout=10)
    if not resp.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch Google profile: {resp.text}"
        )
    return resp.json()


def verify_google_id_token(id_token: str) -> Dict[str, Any]:
    """Verify Google ID token from Google Identity Services (One Tap / GIS Button)."""
    verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    resp = requests.get(verify_url, timeout=10)
    if not resp.ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to verify Google ID token with Google authorization servers."
        )
    payload = resp.json()

    # Enforce trusted issuer and a verified email claim before trusting claims
    if payload.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token was issued by an untrusted issuer."
        )
    if payload.get("email") and str(payload.get("email_verified", "")).lower() not in ("true", "1"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Google account email address is not verified."
        )

    # Check audience if client_id configured
    if GOOGLE_CLIENT_ID and payload.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token audience mismatch."
        )
    return payload


# ============================================================================
# ROLE RESTRICTION & ADMIN GATING
# ============================================================================

def resolve_user_role(email: str, requested_role: str) -> Tuple[str, bool]:
    """
    Enforce security criteria for role assignment.
    If requested_role is 'ADMIN', verify email against Admin Whitelist / Domains / Flags.
    Raises 403 if an unauthorized account attempts Admin authentication.
    """
    is_whitelisted_admin = database.is_email_authorized_admin(email)

    if requested_role.upper() == "ADMIN":
        if not is_whitelisted_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access Denied: The Google account '{email}' is not authorized for Administrator access. "
                    "Admin access is restricted to verified Sentinel security domains (@sentinel.ai) "
                    "or explicit security whitelist entries. Please log in through the Standard Analyst portal."
                )
            )
        return "ADMIN", True

    # Standard User request:
    # If the user is an authorized admin in DB/whitelist, preserve their admin privileges,
    # otherwise assign USER role.
    if is_whitelisted_admin:
        return "ADMIN", True
    return "USER", False


# ============================================================================
# FASTAPI DEPENDENCIES (ROUTE PROTECTION)
# ============================================================================

def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """Retrieve authenticated user from cookie or Authorization header, or None."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        return None

    try:
        claims = decode_sentinel_jwt(token)
        user = database.get_user_by_id(claims["sub"])
        if not user:
            # Fallback to claims info if DB row deleted
            return {
                "id": claims["sub"],
                "email": claims["email"],
                "name": claims["name"],
                "picture": claims.get("picture", ""),
                "role": claims["role"],
                "is_admin": claims.get("is_admin", False),
                "is_super_admin": claims.get("is_super_admin", False)
            }
        return user
    except Exception:
        return None


def get_current_user(current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)) -> Dict[str, Any]:
    """Enforce authenticated session for protected endpoints."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in with Google to access this resource."
        )
    return current_user


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Enforce ADMIN or SUPER_ADMIN role for high-privilege operations."""
    is_admin = bool(
        current_user.get("role") in ("ADMIN", "SUPER_ADMIN") or
        current_user.get("is_admin") or
        current_user.get("is_super_admin") or
        database.is_super_admin_email(current_user.get("email", ""))
    )
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required. Your account lacks the necessary administrative permissions."
        )
    return current_user


def require_super_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Enforce SUPER_ADMIN role (abadmustafa280@gmail.com) for root global controls."""
    is_super = bool(
        current_user.get("role") == "SUPER_ADMIN" or
        current_user.get("is_super_admin") or
        database.is_super_admin_email(current_user.get("email", ""))
    )
    if not is_super:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Administrator access required. This action is restricted to the master account."
        )
    return current_user


def require_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Enforce authenticated user (either USER or ADMIN role)."""
    return current_user


# ============================================================================
# API ROUTER & ENDPOINTS
# ============================================================================

auth_router = APIRouter(prefix="/api/auth", tags=["Authentication & OAuth 2.0"])


class VerifyTokenRequest(BaseModel):
    credential: str
    role: str = "USER"
    state: Optional[str] = None


class SignUpRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "USER"


class LoginRequest(BaseModel):
    email: str
    password: str


class DemoLoginRequest(BaseModel):
    role: str = "USER"
    email: Optional[str] = None
    name: Optional[str] = None


class WhitelistAddRequest(BaseModel):
    email_or_domain: str
    type: str = "EMAIL"
    notes: Optional[str] = ""


@auth_router.get("/google/url")
def get_oauth_login_url(role: str = "USER", request: Request = None, response: Response = None):
    """
    Generate Google OAuth 2.0 authorization URL with CSRF state protection.
    Sets the signed state cookie to verify against subsequent callback.
    """
    target_role = "ADMIN" if role.upper() == "ADMIN" else "USER"
    auth_url, signed_state, raw_nonce = get_google_authorization_url(target_role)

    resp = JSONResponse({
        "url": auth_url,
        "state": signed_state,
        "role": target_role,
        # Public Google OAuth client identifier (safe to expose) so the
        # frontend can initialize Google Identity Services when configured.
        "clientId": GOOGLE_CLIENT_ID or None,
        "is_configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
    })

    # Store state nonce in temporary HTTP-only cookie for CSRF validation
    secure_flag = is_secure_connection(request) if request else False
    resp.set_cookie(
        key=STATE_COOKIE_NAME,
        value=raw_nonce,
        max_age=900,  # 15 minutes
        httponly=True,
        samesite="lax",
        secure=secure_flag,
        path="/"
    )
    return resp


@auth_router.get("/google/callback")
def google_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    request: Request = None
):
    """
    Handle Google OAuth 2.0 callback:
    1. Verify state parameter against CSRF attacks.
    2. Exchange authorization code for tokens.
    3. Retrieve user profile metadata.
    4. Enforce Admin authorization whitelist.
    5. Upsert user in database and issue JWT session.
    6. Redirect user to appropriate frontend view.
    """
    if error:
        return RedirectResponse(url=f"{FRONTEND_URL}/#landing?auth_error={requests.utils.quote(error)}")

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing required code or state parameter.")

    # 1. CSRF State Verification
    cookie_nonce = request.cookies.get(STATE_COOKIE_NAME) if request else None
    state_payload = verify_state_token(state, expected_nonce=cookie_nonce)
    requested_role = state_payload.get("role", "USER")
    redirect_tab = state_payload.get("redirect_tab", "DASHBOARD" if requested_role == "USER" else "RULES")

    # 2. Exchange code for tokens & fetch user info
    try:
        tokens = exchange_code_for_google_tokens(code)
        access_token = tokens["access_token"]
        google_profile = fetch_google_userinfo(access_token)
    except Exception as e:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/#landing?auth_error={requests.utils.quote(f'Google OAuth error: {str(e)}')}"
        )

    email = google_profile.get("email", "")
    name = google_profile.get("name", "Sentinel User")
    picture = google_profile.get("picture", "")
    google_id = google_profile.get("sub", "")

    # 3. Role Restriction & Admin Whitelist Authorization
    try:
        assigned_role, is_admin = resolve_user_role(email, requested_role)
    except HTTPException as auth_err:
        # Redirect to landing with clear error banner
        err_msg = requests.utils.quote(auth_err.detail)
        return RedirectResponse(url=f"{FRONTEND_URL}/#landing?auth_error={err_msg}&role={requested_role}")

    # 4. Upsert user in database
    user = database.upsert_user(
        google_id=google_id,
        email=email,
        name=name,
        picture=picture,
        role=assigned_role,
        is_admin=is_admin
    )

    # 5. Issue JWT & set secure session cookie
    token = create_sentinel_jwt(user)

    # 6. Redirect to frontend with role-specific landing
    target_hash = "rules" if assigned_role == "ADMIN" else "dashboard"
    redirect_url = f"{FRONTEND_URL}/#{target_hash}?auth=success&role={assigned_role}&name={requests.utils.quote(name)}"

    resp = RedirectResponse(url=redirect_url)
    set_auth_cookies(resp, token, request)
    resp.delete_cookie(key=STATE_COOKIE_NAME, path="/")
    return resp


@auth_router.post("/google/verify")
def verify_google_credential(payload: VerifyTokenRequest, request: Request, response: Response):
    """
    Verify client-side Google credential (from Google Identity Services One Tap / Sign In button).
    Validates token with Google, enforces Admin authorization, upserts user, and sets secure session cookie.
    """
    google_info = verify_google_id_token(payload.credential)

    email = google_info.get("email", "")
    name = google_info.get("name", "Sentinel User")
    picture = google_info.get("picture", "")
    google_id = google_info.get("sub", "")

    # Enforce role restriction
    assigned_role, is_admin = resolve_user_role(email, payload.role)

    # Upsert user record
    user = database.upsert_user(
        google_id=google_id,
        email=email,
        name=name,
        picture=picture,
        role=assigned_role,
        is_admin=is_admin
    )

    # Issue JWT session
    token = create_sentinel_jwt(user)

    redirect_tab = "RULES" if assigned_role == "ADMIN" else "DASHBOARD"
    set_auth_cookies(response, token, request)

    return {
        "status": "success",
        "message": f"Successfully authenticated as {name} ({assigned_role})",
        "token": token,
        "user": user,
        "redirectTab": redirect_tab
    }


@auth_router.post("/signup")
def sign_up(payload: SignUpRequest, request: Request, response: Response):
    """
    Direct registration endpoint supporting Role Selection -> Form Entry flow.
    Automatically designates abadmustafa280@gmail.com as SUPER_ADMIN.
    """
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password
    requested_role = payload.role.strip().upper()

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email, and password are required.")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    # Account conflict safety: never overwrite an existing identity.
    # (Prevents password takeover of an existing account and duplicate users.)
    existing_account = database.get_user_by_email(email)
    if existing_account:
        if existing_account.get("password_hash"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Please sign in instead."
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is registered with Google Sign-In. Please sign in with Google instead."
        )

    is_super = database.is_super_admin_email(email)

    if requested_role in ("ADMIN", "SUPER_ADMIN"):
        if not is_super and not database.is_email_authorized_admin(email):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Work email '{email}' is not authorized for Administrator access. "
                    "Admin access is restricted to verified Sentinel security domains (@sentinel.ai) "
                    "or explicit security whitelist entries. Please contact SecOps or sign up as a User."
                )
            )
        target_role = "SUPER_ADMIN" if is_super else "ADMIN"
    else:
        target_role = "SUPER_ADMIN" if is_super else "USER"

    try:
        user = database.create_user_with_password(
            name=name,
            email=email,
            password=password,
            role=target_role
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create account: {str(e)}")

    token = create_sentinel_jwt(user)
    set_auth_cookies(response, token, request)

    redirect_tab = "RULES" if user.get("role") in ("ADMIN", "SUPER_ADMIN") else "DASHBOARD"

    return {
        "status": "success",
        "message": f"Successfully registered as {name} ({user['role']})",
        "token": token,
        "user": user,
        "redirectTab": redirect_tab
    }


@auth_router.post("/login")
def login_with_password(payload: LoginRequest, request: Request, response: Response):
    """
    Direct email & password authentication.
    """
    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    user = database.authenticate_user_password(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_sentinel_jwt(user)
    set_auth_cookies(response, token, request)

    redirect_tab = "RULES" if user.get("role") in ("ADMIN", "SUPER_ADMIN") else "DASHBOARD"

    return {
        "status": "success",
        "message": f"Welcome back, {user['name']}!",
        "token": token,
        "user": user,
        "redirectTab": redirect_tab
    }


@auth_router.post("/demo-login")
def demo_login(payload: DemoLoginRequest, request: Request, response: Response):
    """
    Instant demo / test authentication simulator.
    Enables immediate testing of User vs Admin flows and Admin Whitelist protection
    even before production Google Client IDs are provisioned.
    """
    role = payload.role.upper()
    req_email = (payload.email or "").strip().lower()

    if role == "SUPER_ADMIN" or database.is_super_admin_email(req_email):
        email = database.SUPER_ADMIN_EMAIL
        name = payload.name or "Sentinel Administrator"
        picture = ""
        google_id = "demo_google_superadmin_root"
        assigned_role = "SUPER_ADMIN"
        is_admin = True
    elif role == "ADMIN":
        email = payload.email or "secops@sentinel.ai"
        name = payload.name or "Elena Vance (SecOps Lead)"
        picture = ""
        google_id = "demo_google_secops_9921"
        assigned_role, is_admin = resolve_user_role(email, role)
    else:
        email = payload.email or "analyst.vance@defense.org"
        name = payload.name or "Marcus Brody (Risk Analyst)"
        picture = ""
        google_id = "demo_google_analyst_1048"
        assigned_role, is_admin = resolve_user_role(email, role)

    user = database.upsert_user(
        google_id=google_id,
        email=email,
        name=name,
        picture=picture,
        role=assigned_role,
        is_admin=is_admin
    )

    token = create_sentinel_jwt(user)
    set_auth_cookies(response, token, request)

    redirect_tab = "RULES" if assigned_role in ("ADMIN", "SUPER_ADMIN") else "DASHBOARD"

    return {
        "status": "success",
        "message": f"Demo authentication established for {name} ({assigned_role})",
        "token": token,
        "user": user,
        "redirectTab": redirect_tab
    }


@auth_router.get("/me")
def get_session_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return the authenticated user profile and permissions from active session."""
    is_super = bool(
        current_user.get("is_super_admin", 0) or
        current_user.get("role") == "SUPER_ADMIN" or
        database.is_super_admin_email(current_user.get("email", ""))
    )
    is_admin = bool(
        current_user.get("is_admin", 0) or
        current_user.get("role") in ("ADMIN", "SUPER_ADMIN") or
        is_super
    )
    return {
        "authenticated": True,
        "user": current_user,
        "role": current_user["role"],
        "isAdmin": is_admin,
        "isSuperAdmin": is_super
    }


@auth_router.post("/logout")
def logout(response: Response, current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    """Terminate the active session and purge secure cookies."""
    if current_user:
        try:
            with database.get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO audit_logs (transaction_id, action, notes)
                    VALUES (NULL, 'AUTH_LOGOUT', ?);
                """, (f"User logout: {current_user.get('email')}",))
                conn.commit()
        except Exception:
            pass

    clear_auth_cookies(response)
    return {
        "status": "success",
        "message": "Successfully logged out from Sentinel AI session."
    }


@auth_router.get("/users")
def get_registered_users(admin: Dict[str, Any] = Depends(require_admin)):
    """Admin-only endpoint: List all registered platform users."""
    return database.list_all_users()


@auth_router.get("/admin/whitelist")
def get_whitelist_entries(admin: Dict[str, Any] = Depends(require_admin)):
    """Admin-only endpoint: View configured Admin email domains and accounts."""
    return database.get_admin_whitelist()


@auth_router.post("/admin/whitelist")
def add_whitelist_entry(payload: WhitelistAddRequest, admin: Dict[str, Any] = Depends(require_admin)):
    """Admin-only endpoint: Add a new domain or email to the Admin Whitelist."""
    if not payload.email_or_domain:
        raise HTTPException(status_code=400, detail="Target email or domain cannot be empty.")
    database.add_to_admin_whitelist(payload.email_or_domain, payload.type, payload.notes or "")
    return {
        "status": "success",
        "message": f"Successfully whitelisted {payload.email_or_domain} ({payload.type})",
        "whitelist": database.get_admin_whitelist()
    }


@auth_router.delete("/admin/whitelist/{target}")
def delete_whitelist_entry(target: str, admin: Dict[str, Any] = Depends(require_admin)):
    """Admin-only endpoint: Remove a domain or email from the Admin Whitelist."""
    database.delete_from_admin_whitelist(target)
    return {
        "status": "success",
        "message": f"Removed {target} from Admin whitelist.",
        "whitelist": database.get_admin_whitelist()
    }
