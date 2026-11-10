const KEY = 'wsit:session';

export const getToken = () => localStorage.getItem(KEY);
export const clearToken = () => localStorage.removeItem(KEY);

// Gets (or creates) this browser's session. The session token is opaque —
// Spotify tokens are kept on the server and never sent to the browser.
export async function ensureSession() {
  const token = getToken();
  if (token) {
    const r = await fetch('/api/session', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r.json();
  }
  const r = await fetch('/api/session', { method: 'POST' });
  if (!r.ok) throw new Error('Game server is unavailable');
  const j = await r.json();
  localStorage.setItem(KEY, j.token);
  return j;
}

async function request(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export const apiGet = (path) => request('GET', path);
export const apiPost = (path, body) => request('POST', path, body || {});

export async function startSpotifyLogin(returnTo = window.location.pathname) {
  const { url } = await apiPost('/api/auth/start', { returnTo });
  window.location.href = url;
}
