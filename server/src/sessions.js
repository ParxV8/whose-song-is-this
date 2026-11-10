// In-memory session store. Each browser gets an opaque session token; the
// Spotify access/refresh tokens live here and never leave the server
// (except a short-lived access token for the host's own Web Playback SDK,
// which is opt-in — see /api/playback/token).
import crypto from 'node:crypto';

const sessions = new Map();
const pendingAuth = new Map();
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const PENDING_TTL = 10 * 60 * 1000;

export function createSession() {
  const s = {
    token: crypto.randomBytes(24).toString('base64url'),
    playerId: crypto.randomBytes(6).toString('hex'),
    createdAt: Date.now(),
    lastSeen: Date.now(),
    spotify: null, // { tokens: {accessToken, refreshToken, expiresAt, scope}, profile: {id, name, image} }
  };
  sessions.set(s.token, s);
  return s;
}

export function getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const s = sessions.get(token);
  if (s) s.lastSeen = Date.now();
  return s || null;
}

export function fromRequest(req) {
  const h = req.headers.authorization || '';
  return getSession(h.startsWith('Bearer ') ? h.slice(7) : null);
}

export function summary(s) {
  const sp = s.spotify;
  return {
    token: s.token,
    playerId: s.playerId,
    spotify: sp?.profile
      ? { connected: true, name: sp.profile.name, image: sp.profile.image, canStream: sp.tokens.scope.includes('streaming') }
      : { connected: false },
  };
}

export function savePending(state, data) {
  pendingAuth.set(state, { ...data, createdAt: Date.now() });
}

export function takePending(state) {
  const p = pendingAuth.get(state);
  pendingAuth.delete(state);
  if (!p || Date.now() - p.createdAt > PENDING_TTL) return null;
  return p;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.lastSeen > SESSION_TTL) sessions.delete(k);
  for (const [k, p] of pendingAuth) if (now - p.createdAt > PENDING_TTL) pendingAuth.delete(k);
}, 60_000).unref();
