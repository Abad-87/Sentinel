let csrfToken = '';
let sessionRequest;
export const apiUrl = (path) => `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')}${path}`;
export function setCsrfToken(value) { csrfToken = value || ''; }

export async function apiFetch(input, options = {}) {
  const target = new URL(input, window.location.origin);
  const configured = new URL(apiUrl('/') || '/', window.location.origin);
  // Never forward session/CSRF information to legacy localhost fallbacks in deployment.
  if (target.origin !== configured.origin && target.origin !== window.location.origin) {
    throw new Error('API origin does not match the configured backend');
  }
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !csrfToken) {
    sessionRequest ||= window.fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
      .then(async response => { if (response.ok) setCsrfToken((await response.json()).csrfToken); })
      .finally(() => { sessionRequest = undefined; });
    await sessionRequest;
  }
  const headers = new Headers(options.headers);
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken);
  return window.fetch(input, { ...options, headers, credentials: 'include' });
}

export async function authApi(path, body, method = 'POST') {
  const response = await apiFetch(apiUrl(`/api/auth${path}`), {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check the form fields and try again.');
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  return data;
}