// Spotify Web API client (server-side only).
// Notes on the 2026 API:
//  * GET /playlists/{id}/items replaced /tracks and only works for playlists
//    the user owns or collaborates on. Each entry holds the track in `item`
//    (older responses used `track`) — we accept both.
//  * The playlist object's `tracks` field was renamed `items`.
//  * /me no longer returns `product`, so Premium can't be detected up front;
//    the client finds out when the Web Playback SDK reports an account error.
//  * preview_url is null for most newer apps; the client falls back to the
//    embed player.
import crypto from 'node:crypto';
import { config, SCOPES } from './config.js';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(status, message, code = 'spotify') {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createPkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthUrl({ state, challenge }) {
  const params = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: 'code',
    redirect_uri: config.spotify.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES.join(' '),
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

async function tokenRequest(params) {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.spotify.clientId, ...params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new SpotifyError(res.status, json.error_description || json.error || 'Token request failed', 'token');
  return json;
}

function toTokens(j, previousRefresh) {
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || previousRefresh,
    expiresAt: Date.now() + (Number(j.expires_in || 3600) - 60) * 1000,
    scope: j.scope || '',
  };
}

export async function exchangeCode(code, verifier) {
  const j = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.spotify.redirectUri,
    code_verifier: verifier,
  });
  return toTokens(j);
}

export async function getAccessToken(session) {
  const sp = session.spotify;
  if (!sp) throw new SpotifyError(401, 'Connect Spotify first', 'not_connected');
  if (Date.now() < sp.tokens.expiresAt) return sp.tokens.accessToken;
  if (!sp.refreshing) {
    sp.refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: sp.tokens.refreshToken })
      .then((j) => {
        sp.tokens = toTokens(j, sp.tokens.refreshToken);
      })
      .finally(() => {
        sp.refreshing = null;
      });
  }
  try {
    await sp.refreshing;
  } catch {
    session.spotify = null;
    throw new SpotifyError(401, 'Your Spotify sign-in expired — please reconnect', 'expired');
  }
  return sp.tokens.accessToken;
}

export async function api(session, pathOrUrl, { method = 'GET', body, retries = 2 } = {}) {
  const token = await getAccessToken(session);
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && retries > 0) {
    const wait = Math.min(Number(res.headers.get('retry-after') || 1), 10) * 1000;
    await sleep(wait);
    return api(session, pathOrUrl, { method, body, retries: retries - 1 });
  }
  if (res.status === 401 && retries > 0 && session.spotify) {
    session.spotify.tokens.expiresAt = 0; // force refresh
    return api(session, pathOrUrl, { method, body, retries: retries - 1 });
  }
  if (res.status === 204 || res.status === 202) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new SpotifyError(res.status, json?.error?.message || `Spotify error ${res.status}`, 'api');
  return json;
}

const pickImage = (images) => images?.[1]?.url || images?.[0]?.url || null;

export async function getProfile(session) {
  const me = await api(session, '/me');
  return { id: me.id, name: me.display_name || me.id, image: me.images?.[0]?.url || null };
}

export async function listPlaylists(session) {
  const me = session.spotify?.profile;
  if (!me) throw new SpotifyError(401, 'Connect Spotify first', 'not_connected');
  const out = [];
  let url = '/me/playlists?limit=50';
  for (let page = 0; url && page < 6; page++) {
    const data = await api(session, url);
    for (const p of data.items || []) {
      if (!p) continue;
      // Spotify only exposes items of playlists you own or collaborate on.
      const readable = p.owner?.id === me.id || p.collaborative;
      if (!readable) continue;
      out.push({
        id: p.id,
        name: p.name,
        image: pickImage(p.images),
        trackCount: p.items?.total ?? p.tracks?.total ?? 0,
        collaborative: !!p.collaborative,
      });
    }
    url = data.next;
  }
  return out;
}

export function parsePlaylistId(input) {
  const s = String(input || '').trim();
  const m = s.match(/playlist[/:]([A-Za-z0-9]{22})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s;
  return null;
}

function mapTrack(entry) {
  if (!entry || entry.is_local) return null;
  const t = entry.item ?? entry.track;
  if (!t || t.type !== 'track' || t.is_local || !t.id) return null;
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).filter(Boolean),
    album: t.album?.name || null,
    image: pickImage(t.album?.images),
    previewUrl: t.preview_url || null,
    durationMs: t.duration_ms || null,
    isrc: t.external_ids?.isrc || null,
  };
}

const notReadable = () =>
  new SpotifyError(
    403,
    'Spotify only lets this app read playlists you own or collaborate on. Pick one of yours — or save a copy of it to your library first.',
    'forbidden',
  );

export async function loadPlaylist(session, playlistId) {
  let meta;
  try {
    meta = await api(session, `/playlists/${encodeURIComponent(playlistId)}`);
  } catch (e) {
    if (e.status === 404) throw new SpotifyError(404, "Couldn't find that playlist", 'not_found');
    if (e.status === 403) throw notReadable();
    throw e;
  }
  if (meta.items === undefined && meta.tracks === undefined) throw notReadable();

  const tracks = [];
  const maxPages = Math.ceil(config.spotify.maxTracksPerPlaylist / 50);
  let url = `/playlists/${encodeURIComponent(playlistId)}/items?limit=50&additional_types=track`;
  for (let page = 0; url && page < maxPages; page++) {
    let data;
    try {
      data = await api(session, url);
    } catch (e) {
      if (e.status === 403) throw notReadable();
      throw e;
    }
    for (const entry of data.items || []) {
      const t = mapTrack(entry);
      if (t) tracks.push(t);
    }
    url = data.next;
  }

  return {
    meta: {
      id: meta.id,
      name: meta.name,
      image: pickImage(meta.images),
      owner: meta.owner?.display_name || null,
      url: meta.external_urls?.spotify || null,
    },
    tracks,
  };
}

export async function startPlayback(session, { deviceId, uri, positionMs = 0 }) {
  await api(session, `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: { uris: [uri], position_ms: Math.max(0, Math.floor(positionMs)) },
  });
}

export async function pausePlayback(session, { deviceId }) {
  await api(session, `/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
}
