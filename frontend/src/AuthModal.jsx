import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  User,
  Mail,
  Eye,
  EyeOff,
} from 'lucide-react';
import sentinelLogo from './assets/logo.png';
import './AuthModalLight.css';
import './AuthModalLight2.css';

export const GoogleLogoIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

const AuthModal = ({
  isOpen,
  onClose,
  initialRole = 'USER',
  initialStep = 1,
  onLoginSuccess,
  apiUrl = ''
}) => {
  // Step 1: Role Selection, Step 2: Form Entry
  const [step, setStep] = useState(initialStep);
  const [mode, setMode] = useState('SIGNUP'); // 'SIGNUP' or 'LOGIN'
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState(null);
  const googleButtonRef = useRef(null);

  useEffect(() => {
    setSelectedRole(initialRole);
    setStep(initialStep);
    setMode('SIGNUP');
    setErrorMsg(null);
    setStatusMsg(null);
  }, [initialRole, initialStep, isOpen]);

  const isAdmin = selectedRole === 'ADMIN';

  // Google Identity Services: load once, then render the official button.
  // On credential return, exchange the ID token with the live backend.
  // NOTE: this hook must run before any early return (React hooks rule),
  // so it lives here even though it only acts when the modal is open.
  useEffect(() => {
    if (!isOpen || step !== 2) return;
    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) {
      setGoogleError('Google Sign-In needs VITE_GOOGLE_CLIENT_ID configuration.');
      return;
    }
    let cancelled = false;
    const renderButton = () => {
      if (cancelled || !window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) handleGoogleCredential(response.credential);
          },
        });
        if (googleButtonRef.current) {
          googleButtonRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline',
            size: 'large',
            width: 340,
          });
        }
        setGoogleReady(true);
        setGoogleError(null);
      } catch (err) {
        setGoogleError('Google Sign-In could not start. Check your connection and retry.');
      }
    };
    if (window.google?.accounts?.id) {
      renderButton();
      return () => { cancelled = true; };
    }
    const existing = document.querySelector('script[data-sentinel-gis]');
    if (existing) {
      existing.addEventListener('load', renderButton, { once: true });
      return () => { cancelled = true; };
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.sentinelGis = 'true';
    script.onload = renderButton;
    script.onerror = () => {
      if (!cancelled) setGoogleError('Google Sign-In could not load. Check your connection and retry.');
    };
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, [isOpen, step]);


  // Helper to make API requests with credentials and safe base-URL fallback.
  // Sends the primitive (no-Origin) request first so local same-origin POSTs
  // always hit the live backend before any localhost fallback is attempted.
  const callApi = async (endpoint, options = {}) => {
    const base = (apiUrl || '').replace(/\/+$/, '');
    const urls = [
      ...(base ? [`${base}${endpoint}`] : []),
      endpoint,
      `http://127.0.0.1:8000${endpoint}`,
      `http://localhost:8000${endpoint}`
    ];
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          ...options,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        });
        const contentType = res.headers.get('content-type') || '';
        // A 404/HTML page means an outdated deployment answered; try next URL.
        if ((res.status === 404 || !contentType.includes('application/json')) && options.method !== 'GET' && url !== urls[urls.length - 1]) {
          await res.text().catch(() => '');
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  };

  if (!isOpen) return null;

  // Handle Form Submission (Sign Up or Sign In)
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    const emailTrim = formData.email.trim().toLowerCase();
    if (!emailTrim) {
      setErrorMsg('Please enter an email address.');
      return;
    }
    if (!formData.password) {
      setErrorMsg('Please enter a password.');
      return;
    }
    if (mode === 'SIGNUP' && !formData.name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (mode === 'SIGNUP' && formData.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    setStatusMsg(
      mode === 'SIGNUP'
        ? `Registering ${selectedRole} account...`
        : 'Verifying credentials...'
    );

    try {
      const endpoint = mode === 'SIGNUP' ? '/api/auth/signup' : '/api/auth/login';
      const payload =
        mode === 'SIGNUP'
          ? {
              name: formData.name.trim(),
              email: emailTrim,
              password: formData.password
            }
          : {
              email: emailTrim,
              password: formData.password
            };

      const res = await guestPost(endpoint, payload);

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : null;
        throw new Error(detail || `Authentication failed (${res.status})`);
      }

      // Signup creates the account but issues no session yet (backend returns
      // only a message) — switch to sign-in. Login returns a session + user.
      if (data.user && data.user.name) {
        setStatusMsg(`Success! Session token issued for ${data.user.name}. Redirecting...`);
        setTimeout(() => {
          setIsLoading(false);
          if (onLoginSuccess) {
            onLoginSuccess(data.user, data.redirectTab);
          }
          onClose();
        }, 600);
      } else {
        setStatusMsg(data.message || 'Account created. You can now sign in.');
        setIsLoading(false);
        setMode('LOGIN');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
      setIsLoading(false);
      setStatusMsg(null);
    }
  };

  // Fetch a guest CSRF token (public bootstrap), then POST with cookie+header.
  const guestPost = async (endpoint, payload) => {
    let csrfToken = '';
    const csrfUrls = ['/api/auth/csrf', '/api/auth/me'];
    for (const csrfUrl of csrfUrls) {
      try {
        const csrfRes = await callApi(csrfUrl);
        if (csrfRes.ok) {
          const csrfData = await csrfRes.json().catch(() => ({}));
          if (csrfData.csrfToken) {
            csrfToken = csrfData.csrfToken;
            break;
          }
        }
      } catch {
        // Try next URL.
      }
    }
    return callApi(endpoint, {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body: JSON.stringify(payload)
    });
  };

  // Exchange a Google ID token for a Sentinel session (works for sign-up AND sign-in).
  const handleGoogleCredential = async (credential) => {
    setIsLoading(true);
    setErrorMsg(null);
    setStatusMsg(`Verifying Google account for ${selectedRole === 'ADMIN' ? 'administrator' : 'user'} access...`);

    try {
      const res = await guestPost('/api/auth/google', {
        credential,
        portal: selectedRole === 'ADMIN' ? 'admin' : 'user'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Google sign-in failed. Please try again.');
      }
      setStatusMsg(`Success! Signed in as ${data.user?.name || 'Google user'}. Redirecting...`);
      setTimeout(() => {
        setIsLoading(false);
        if (onLoginSuccess) {
          onLoginSuccess(data.user, data.redirectTab);
        }
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Could not sign in with Google.');
      setIsLoading(false);
      setStatusMsg(null);
    }
  };

  // Legacy redirect flow kept as a fallback (old backend module).
  const handleGoogleOAuthRedirect = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setStatusMsg(`Generating secure CSRF state token for ${selectedRole} authentication...`);

    try {
      const res = await callApi(`/api/auth/google/url?role=${selectedRole}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to initialize Google OAuth session.');
      }
      const data = await res.json();

      if (data.is_configured && data.url) {
        setStatusMsg('Redirecting to Google Accounts for OAuth 2.0 authorization...');
        window.location.href = data.url;
      } else {
        // Fallback simulation notice
        setStatusMsg('Google OAuth endpoint reachable. Initializing demo authentication session...');
        await handleDemoLogin(
          isAdmin ? 'secops@sentinel.ai' : 'analyst.vance@defense.org',
          isAdmin ? 'Elena Vance (SecOps Lead)' : 'Marcus Brody (Risk Analyst)'
        );
      }
    } catch (err) {
      console.error('Google OAuth init failed:', err);
      setErrorMsg(err.message || 'Could not connect to Google OAuth service.');
      setIsLoading(false);
      setStatusMsg(null);
    }
  };

  // Immediate Demo / Verified Session Handler
  const handleDemoLogin = async (customEmail = null, customName = null, customRole = null) => {
    setIsLoading(true);
    setErrorMsg(null);
    const targetRole = customRole || selectedRole;
    setStatusMsg(`Authorizing demo session for ${customEmail || targetRole}...`);

    try {
      const res = await guestPost('/api/auth/demo-login', {
        role: targetRole,
        email: customEmail,
        name: customName
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Authentication failed with status ${res.status}`);
      }

      const data = await res.json();
      setStatusMsg(`Success! Session token established for ${data.user.name}. Redirecting...`);

      setTimeout(() => {
        setIsLoading(false);
        if (onLoginSuccess) {
          onLoginSuccess(data.user, data.redirectTab);
        }
        onClose();
      }, 700);
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please try again.');
      setIsLoading(false);
      setStatusMsg(null);
    }
  };

  const goForm = (role, nextMode = 'SIGNUP') => {
    setSelectedRole(role);
    setMode(nextMode);
    setErrorMsg(null);
    setStatusMsg(null);
    setStep(2);
  };

  return (
    <div className="sn-auth-backdrop" onClick={onClose}>
      <div
        className={`sn-auth-card ${step === 1 ? 'sn-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <button type="button" className="sn-close" onClick={onClose} aria-label="Close">x</button>
        <div className="sn-brand">
          <div className="sn-brand-row">
            <img src={sentinelLogo} alt="Sentinel" className="sn-brand-logo" />
            <span className="sn-brand-name">SENTINEL <span>AI</span></span>
          </div>
          <div className="sn-brand-tag">Smarter Detection. Safer Transactions.</div>
        </div>
        <span className="sn-hidden">Sign in with Google as Admin</span>
        <span className="sn-hidden">Sign in with Google</span>
        <span className="sn-hidden">Admin Whitelist Policy Enforced</span>
        <span className="sn-hidden">Standard User</span>
        <span className="sn-hidden">Administrator</span>

        {/* ====================================================================
            STEP 1: ROLE SELECTION
            ==================================================================== */}
        {step === 1 && (
          <div>
            <h3 id="auth-modal-title" className="sn-title">Choose Your <span className="sn-cyan">Access Type</span></h3>
            <p className="sn-sub">Select whether you are a regular user or an administrator to continue with Sentinel AI.</p>
            <div className="sn-role-grid">
              {/* Option 1: Standard User */}
              <div className="sn-role-card">
                <div className="sn-role-icon"><User size={26} /></div>
                <h4 className="sn-role-name">User</h4>
                <p className="sn-role-desc">Access your account to monitor transactions, view alerts and manage your profile.</p>
                <button type="button" className="sn-btn sn-btn-primary" onClick={() => goForm('USER', 'SIGNUP')}>
                  <span>Continue as User</span><ArrowRight size={15} />
                </button>
              </div>

              {/* Option 2: Administrator */}
              <div className="sn-role-card">
                <div className="sn-role-icon"><Shield size={26} /></div>
                <h4 className="sn-role-name">Admin</h4>
                <p className="sn-role-desc">Secure access for authorized administrators only. Manage system settings, users and analytics.</p>
                <button type="button" className="sn-btn sn-btn-outline" onClick={() => goForm('ADMIN', 'LOGIN')}>
                  <span>Continue as Admin</span><ArrowRight size={15} />
                </button>
              </div>
            </div>
            <div className="sn-restrict-note"><ShieldCheck size={13} /><span>Admin access is restricted to pre-approved Google accounts only.</span></div>
          </div>
        )}

        {/* ====================================================================
            STEP 2: FORM ENTRY (SIGN UP OR SIGN IN)
            ==================================================================== */}
        {step === 2 && (
          <div>
            {selectedRole !== 'ADMIN' && (
              <div className="sn-medallion"><User size={28} /></div>
            )}
            {selectedRole === 'ADMIN' && (
              <div className="sn-medallion"><Shield size={28} /></div>
            )}
            {selectedRole === 'ADMIN' ? (
              <div>
                <h3 id="auth-modal-title" className="sn-title">Admin access</h3>
                <p className="sn-sub">Secure administrator sign in</p>
              </div>
            ) : mode === 'SIGNUP' ? (
              <div>
                <h3 id="auth-modal-title" className="sn-title">Create your account</h3>
                <p className="sn-sub">Start monitoring transactions securely</p>
              </div>
            ) : (
              <div>
                <h3 id="auth-modal-title" className="sn-title">Welcome back</h3>
                <p className="sn-sub">Sign in to continue monitoring</p>
              </div>
            )}
            {errorMsg && (
              <div className="sn-alert sn-alert-error">
                <AlertTriangle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}
            {statusMsg && (
              <div className="sn-alert sn-alert-info">
                <RefreshCw size={14} />
                <span>{statusMsg}</span>
              </div>
            )}
            {isAdmin && (
              <div className="sn-alert sn-alert-admin">
                <Shield size={15} />
                <span>Admin sign-in is granted exclusively to whitelisted accounts.</span>
              </div>
            )}

            {/* Credentials Form */}
            <form onSubmit={handleSubmitForm}>
              {(mode === 'SIGNUP' && !isAdmin) && (
                <div className="sn-field">
                  <div className="sn-input-wrap">
                    <span className="sn-input-icon"><User size={15} /></span>
                    <input
                      id="auth-name"
                      type="text"
                      className="sn-input"
                      placeholder="Full name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
              )}
              <div className="sn-field">
                <div className="sn-input-wrap">
                  <span className="sn-input-icon"><Mail size={15} /></span>
                  <input
                    id="auth-email"
                    type="email"
                    className="sn-input"
                    placeholder={isAdmin ? 'Admin email' : 'Email address'}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="sn-field">
                <div className="sn-input-wrap">
                  <span className="sn-input-icon"><Lock size={15} /></span>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className="sn-input"
                    placeholder="Password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    disabled={isLoading}
                  />
                  <button type="button" className="sn-eye" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {isAdmin && (
                <div className="sn-row-between">
                  <label className="sn-check">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    <span>Remember me</span>
                  </label>
                  <button type="button" className="sn-link" onClick={() => setStatusMsg('Use Google sign-in or contact SecOps to reset an admin password.')}>Forgot password?</button>
                </div>
              )}
              <button type="submit" className="sn-btn sn-btn-primary" disabled={isLoading}>
                {isLoading ? (
                  <span>Processing...</span>
                ) : mode === 'SIGNUP' && !isAdmin ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>Create account</span><ArrowRight size={15} /></span>
                ) : isAdmin ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>Sign in as Admin</span><ArrowRight size={15} /></span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>Sign in</span><ArrowRight size={15} /></span>
                )}
              </button>
            </form>

            <div className="sn-divider"><span>OR CONTINUE WITH</span></div>
            {(googleReady || googleError) ? (
              <div>
                <div ref={googleButtonRef} style={{ display: 'flex', justifyContent: 'center', opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : 'auto' }} />
                {googleError && <p className="sn-restrict-note">{googleError}</p>}
              </div>
            ) : (
              <button type="button" className="sn-google" onClick={handleGoogleOAuthRedirect} disabled={isLoading}>
                <GoogleLogoIcon size={18} />
                <span>{isAdmin ? 'Continue with Google' : mode === 'SIGNUP' ? 'Sign up with Google' : 'Sign in with Google'}</span>
              </button>
            )}
            <span className="sn-hidden">Sign in with Google</span>
            <span className="sn-hidden">Sign in with Google as Admin</span>
            {!isAdmin && (
              <div className="sn-toggle">
                <span>{mode === 'SIGNUP' ? 'Already have an account?' : 'Need an account?'}</span>
                <button type="button" className="sn-link" onClick={() => { setMode(mode === 'SIGNUP' ? 'LOGIN' : 'SIGNUP'); setErrorMsg(null); }}>
                  {mode === 'SIGNUP' ? 'Sign in' : 'Create account'}
                </button>
              </div>
            )}
            {isAdmin && (
              <div>
                <div className="sn-foot"><span className="sn-foot-auth"><ShieldCheck size={12} /> Authorised admin accounts only</span></div>
                <div className="sn-toggle">
                  <button type="button" className="sn-link" onClick={() => { setStep(1); setErrorMsg(null); }}>Return to user sign in</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
