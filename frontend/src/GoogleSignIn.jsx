import { useEffect, useRef, useState } from 'react';

let gisLoading;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisLoading) gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { gisLoading = undefined; reject(new Error('Google Sign-In could not load. Check your connection and retry.')); };
    document.head.appendChild(script);
  });
  return gisLoading;
}

export default function GoogleSignIn({ onCredential, disabled = false }) {
  const container = useRef(null);
  const callback = useRef(onCredential);
  const [status, setStatus] = useState('Loading Google Sign-In…');
  useEffect(() => { callback.current = onCredential; }, [onCredential]);
  useEffect(() => {
    let active = true;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    loadGoogle().then(() => {
      if (!active) return;
      window.google.accounts.id.initialize({ client_id: clientId, auto_select: false,
        callback: result => { if (active && result.credential) callback.current(result.credential); },
      });
      window.google.accounts.id.renderButton(container.current, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', width: Math.min(320, window.innerWidth - 80) });
      setStatus('Choose an account. If you close the Google window, you can try again.');
    }).catch(error => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, []);
  return <div className="sentinel-google"><div ref={container} style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.5 : 1 }} />
    <small role="status">{import.meta.env.VITE_GOOGLE_CLIENT_ID ? status : 'Google Sign-In needs VITE_GOOGLE_CLIENT_ID configuration.'}</small></div>;
}