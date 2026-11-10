import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { config } from './config.js';
import * as sessions from './sessions.js';
import * as spotify from './spotify.js';
import { afterChange, initRooms, roomsWithPlayer } from './rooms.js';
import { registerSocketHandlers } from './socket.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

const clientConfig = () => ({
  sdkEnabled: config.spotify.enableSdk,
  demoEnabled: config.demoPlaylists,
  spotifyConfigured: !!config.spotify.clientId,
});

const withSession = (handler) => async (req, res) => {
  const s = sessions.fromRequest(req);
  if (!s) return res.status(401).json({ error: 'no_session' });
  try {
    await handler(req, res, s);
  } catch (e) {
    if (!e.expose) console.error(e);
    res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.expose ? e.message : 'Server error' });
  }
};

function pushSpotifyStatus(session) {
  const info = session.spotify?.profile ? { name: session.spotify.profile.name } : null;
  for (const room of roomsWithPlayer(session.playerId)) {
    room.game.updatePlayer(session.playerId, { spotify: info });
    afterChange(room);
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/session', (_req, res) => {
  const s = sessions.createSession();
  res.json({ ...sessions.summary(s), config: clientConfig() });
});

app.get('/api/session', withSession((_req, res, s) => {
  res.json({ ...sessions.summary(s), config: clientConfig() });
}));

// --- Spotify OAuth (Authorization Code + PKCE, handled entirely server-side) ---

app.post('/api/auth/start', withSession((req, res, s) => {
  if (!config.spotify.clientId) return res.status(500).json({ error: 'SPOTIFY_CLIENT_ID is not set on the server' });
  const raw = String(req.body?.returnTo || '/');
  const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const { verifier, challenge } = spotify.createPkce();
  const state = crypto.randomBytes(16).toString('base64url');
  sessions.savePending(state, { token: s.token, verifier, returnTo });
  res.json({ url: spotify.buildAuthUrl({ state, challenge }) });
}));

app.get('/auth/callback', async (req, res) => {
  const pending = sessions.takePending(String(req.query.state || ''));
  const back = pending?.returnTo || '/';
  const done = (params) => res.redirect(`${back}${back.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`);
  if (!pending) return done({ spotify: 'error', reason: 'expired' });
  if (req.query.error) return done({ spotify: 'error', reason: String(req.query.error) });
  const s = sessions.getSession(pending.token);
  if (!s) return done({ spotify: 'error', reason: 'session' });
  try {
    const tokens = await spotify.exchangeCode(String(req.query.code || ''), pending.verifier);
    s.spotify = { tokens, profile: null };
    s.spotify.profile = await spotify.getProfile(s);
    pushSpotifyStatus(s);
    done({ spotify: 'connected' });
  } catch (e) {
    console.error('[auth] callback failed:', e.message);
    s.spotify = null;
    // In Development Mode, users missing from the app's allowlist get 403 on /me.
    done({ spotify: 'error', reason: e.status === 403 ? 'not_allowlisted' : 'exchange_failed' });
  }
});

app.post('/api/auth/disconnect', withSession((_req, res, s) => {
  s.spotify = null;
  pushSpotifyStatus(s);
  res.json({ ok: true });
}));

// --- Web Playback SDK support (opt-in via ENABLE_WEB_PLAYBACK_SDK) ---
// The SDK runs in the browser and needs an access token there. We hand out
// only a short-lived access token for the user's *own* account; the refresh
// token and everything else stay on the server.

const sdkGuard = (s) => {
  if (!config.spotify.enableSdk) throw Object.assign(new Error('Web Playback SDK is disabled'), { status: 404, expose: true });
  if (!s.spotify?.tokens.scope.includes('streaming'))
    throw Object.assign(new Error('Reconnect Spotify to enable full-track playback'), { status: 403, expose: true });
};

app.get('/api/playback/token', withSession(async (_req, res, s) => {
  sdkGuard(s);
  const accessToken = await spotify.getAccessToken(s);
  res.set('Cache-Control', 'no-store').json({ accessToken, expiresAt: s.spotify.tokens.expiresAt });
}));

app.post('/api/playback/play', withSession(async (req, res, s) => {
  sdkGuard(s);
  const { deviceId, uri, positionMs } = req.body || {};
  if (!deviceId || !/^spotify:track:[A-Za-z0-9]+$/.test(String(uri))) return res.status(400).json({ error: 'Bad request' });
  await spotify.startPlayback(s, { deviceId: String(deviceId), uri: String(uri), positionMs: Number(positionMs) || 0 });
  res.json({ ok: true });
}));

app.post('/api/playback/pause', withSession(async (req, res, s) => {
  sdkGuard(s);
  if (!req.body?.deviceId) return res.status(400).json({ error: 'Bad request' });
  await spotify.pausePlayback(s, { deviceId: String(req.body.deviceId) });
  res.json({ ok: true });
}));

// --- Static client (production build) ---

if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || /^\/(api|auth|socket\.io)(\/|$)/.test(req.path)) return next();
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10_000, pingTimeout: 8_000 });
initRooms(io);
registerSocketHandlers(io);

server.listen(config.port, config.host, () => {
  console.log(`🎵 Whose Song Is This? server on http://${config.host}:${config.port}`);
  console.log(`   Public URL:   ${config.publicUrl}`);
  console.log(`   Redirect URI: ${config.spotify.redirectUri}`);
  if (!config.spotify.clientId) console.warn('⚠️  SPOTIFY_CLIENT_ID is not set — Spotify sign-in will not work.');
  if (config.demoPlaylists) console.log('   Demo playlists: enabled');
});
