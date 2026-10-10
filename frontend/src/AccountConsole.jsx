import './SecureAuth.css';

export default function AccountConsole({ user, currentUser, onLogout }) {
  const account = user || currentUser;
  if (!account) return null;

  return (
    <section className="sentinel-account-panel" aria-labelledby="account-title">
      <p className="sentinel-eyebrow">SENTINEL AI</p>
      <h1 id="account-title">Your account</h1>
      <dl>
        <dt>Name</dt><dd>{account.name || 'Not provided'}</dd>
        <dt>Email</dt><dd>{account.email || 'Not provided'}</dd>
        <dt>Role</dt><dd>{account.role || 'USER'}</dd>
      </dl>
      {onLogout && <button type="button" className="sentinel-primary" onClick={onLogout}>Sign out</button>}
    </section>
  );
}
