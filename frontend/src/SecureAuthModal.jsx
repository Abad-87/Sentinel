import { useState } from 'react';
import GoogleSignIn from './GoogleSignIn';
import { authApi } from './api';
import './SecureAuth.css';

export default function SecureAuthModal({ isOpen, onClose, initialRole = 'USER', onLoginSuccess }) {
  if (!isOpen) return null;
  return <AuthForm key={initialRole} admin={initialRole === 'ADMIN'} onClose={onClose} onLoginSuccess={onLoginSuccess} />;
}

function AuthForm({ admin, onClose, onLoginSuccess }) {
  const hash = window.location.hash;
  const initialMode = hash.startsWith('#reset-password') ? 'reset-password' : hash.startsWith('#verify-email') ? 'verify-email' : 'login';
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', token: new URLSearchParams(hash.split('?')[1]).get('token') || '' });
  const title = admin ? 'Restricted administrator portal' : ({ login: 'Welcome to Sentinel', register: 'Create your account', 'forgot-password': 'Recover your account', 'reset-password': 'Set a new password', 'verify-email': 'Verify your email', 'resend-verification': 'Resend verification' }[mode]);
  async function run(operation) {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await operation();
      if (data.user) { onLoginSuccess(data.user, data.redirectTab); onClose(); }
      else { setMessage(data.message); if (['verify-email', 'reset-password'].includes(mode)) window.history.replaceState(null, '', '/#landing'); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    if (['register', 'reset-password'].includes(mode) && form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    const body = mode === 'register' ? { name: form.name, email: form.email, password: form.password }
      : mode === 'login' ? { email: form.email, password: form.password }
      : mode === 'reset-password' ? { token: form.token, password: form.password }
      : mode === 'verify-email' ? { token: form.token } : { email: form.email };
    run(() => authApi(`/${mode}`, body));
  }
  function field(name, label, type = 'text', minimum) {
    return <label className="sentinel-field" key={name}>{label}<input name={name} type={type} required value={form[name]} minLength={minimum} maxLength={name === 'password' || name === 'confirm' ? 128 : name === 'token' ? 256 : 254}
      autoComplete={name === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : name === 'email' ? 'email' : name === 'name' ? 'name' : 'off'}
      onChange={event => setForm(previous => ({ ...previous, [name]: event.target.value }))} /></label>;
  }
  return <div className="sentinel-auth-backdrop"><section className="sentinel-auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button className="sentinel-close" aria-label="Close sign in" onClick={onClose}>×</button>
    <p className="sentinel-eyebrow">SENTINEL AI · {admin ? 'ADMIN' : 'USER'}</p><h1 id="auth-title">{title}</h1>
    <p>{admin ? 'Google Sign-In only. Access is limited to explicitly approved administrators.' : 'Secure access to your fraud analysis and transaction history.'}</p>
    {(admin || mode === 'login') && <GoogleSignIn disabled={busy} onCredential={credential => run(() => authApi('/google', { credential, portal: admin ? 'admin' : 'user' }))} />}
    {!admin && <form onSubmit={submit}>
      {mode === 'register' && field('name', 'Full name')}
      {['login', 'register', 'forgot-password', 'resend-verification'].includes(mode) && field('email', 'Email address', 'email')}
      {['login', 'register', 'reset-password'].includes(mode) && field('password', 'Password', 'password', mode === 'login' ? 1 : 12)}
      {['register', 'reset-password'].includes(mode) && field('confirm', 'Confirm password', 'password', 12)}
      {['verify-email', 'reset-password'].includes(mode) && field('token', 'Email link token')}
      <button className="sentinel-primary" disabled={busy}>{busy ? 'Please wait…' : ({ login: 'Sign in', register: 'Register', 'forgot-password': 'Send reset link', 'reset-password': 'Reset password', 'verify-email': 'Verify email', 'resend-verification': 'Send verification link' }[mode])}</button>
    </form>}
    {busy && <p role="status">Authenticating…</p>}{error && <p className="sentinel-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!admin && <nav className="sentinel-auth-links">{[['login', 'Sign in'], ['register', 'Register'], ['forgot-password', 'Forgot password?'], ['resend-verification', 'Verify email']].map(([next, label]) => <button key={next} onClick={() => { setMode(next); setError(''); setMessage(''); }} disabled={busy}>{label}</button>)}</nav>}
  </section></div>;
}