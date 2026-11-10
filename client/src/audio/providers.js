// Audio providers. Each one implements:
//   name                       — label for the UI
//   supports(playback)         — async → boolean
//   play(playback)             — async; throws NeedsGesture if the browser blocked autoplay
//   resume() / pause() / stop()
//   destroy()
//
// `playback` comes from the server: { uri, previewUrl, durationMs, title, artists }

import { apiGet, apiPost } from '../lib/api.js';

export class NeedsGesture extends Error {
  constructor() {
    super('needs_gesture');
    this.name = 'NeedsGesture';
  }
}

const isNotAllowed = (e) => e?.name === 'NotAllowedError';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1) 30-second preview via <audio>. Only works when Spotify returns
//    preview_url, which is null for most apps created after Nov 2024.

let sharedAudio = null;
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function audioEl() {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    sharedAudio.playsInline = true;
  }
  return sharedAudio;
}

// Call from a tap handler (e.g. "Start game") so iOS lets us play later.
export function primeAudio() {
  const a = audioEl();
  if (a.src && !a.paused) return;
  a.src = SILENT_WAV;
  a.play().catch(() => {});
}

export function createPreviewProvider({ onState } = {}) {
  const a = audioEl();
  const isReal = () => a.src && a.src !== SILENT_WAV;
  a.addEventListener('play', () => isReal() && onState?.({ playing: true }));
  a.addEventListener('pause', () => isReal() && onState?.({ playing: false }));
  a.addEventListener('ended', () => isReal() && onState?.({ playing: false }));
  return {
    name: 'preview',
    label: '30-sec preview',
    async supports(pb) {
      return !!pb.previewUrl;
    },
    async play(pb) {
      const a = audioEl();
      a.src = pb.previewUrl;
      a.currentTime = 0;
      try {
        await a.play();
      } catch (e) {
        if (isNotAllowed(e)) throw new NeedsGesture();
        throw e;
      }
    },
    resume: () => audioEl().play(),
    pause: () => audioEl().pause(),
    stop() {
      const a = audioEl();
      a.pause();
    },
    destroy() {},
  };
}

// ---------------------------------------------------------------------------
// 2) Spotify Web Playback SDK — full tracks for Premium users on desktop
//    browsers. Opt-in on the server (ENABLE_WEB_PLAYBACK_SDK=true). The SDK
//    does not run on mobile browsers, so phones fall through to the embed.

let sdkScript = null;
function loadSdk() {
  if (window.Spotify) return Promise.resolve();
  if (sdkScript) return sdkScript;
  sdkScript = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => reject(new Error('sdk_blocked'));
    document.body.appendChild(s);
  });
  return sdkScript;
}

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export function createSdkProvider({ enabled, onState }) {
  let player = null;
  let deviceId = null;
  let initPromise = null;
  let broken = !enabled || isMobile();

  async function init() {
    if (broken) return false;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        // Probe the token endpoint first: fails fast if not connected or no streaming scope.
        await apiGet('/api/playback/token');
        await Promise.race([loadSdk(), sleep(8000).then(() => Promise.reject(new Error('sdk_timeout')))]);
        player = new window.Spotify.Player({
          name: 'Whose Song Is This?',
          volume: 0.8,
          getOAuthToken: (cb) =>
            apiGet('/api/playback/token')
              .then((j) => cb(j.accessToken))
              .catch(() => {
                broken = true;
              }),
        });
        const ready = new Promise((resolve, reject) => {
          player.addListener('ready', ({ device_id }) => {
            deviceId = device_id;
            resolve();
          });
          // account_error = not Premium. Since 2026, /me no longer tells us up front.
          for (const evt of ['account_error', 'initialization_error', 'authentication_error']) {
            player.addListener(evt, ({ message }) => {
              broken = true;
              reject(new Error(`${evt}: ${message}`));
            });
          }
        });
        player.addListener('player_state_changed', (st) => {
          if (st) onState?.({ playing: !st.paused });
        });
        const ok = await player.connect();
        if (!ok) throw new Error('connect_failed');
        await Promise.race([ready, sleep(8000).then(() => Promise.reject(new Error('ready_timeout')))]);
        return true;
      } catch (e) {
        console.info('[audio] Web Playback SDK unavailable:', e.message);
        broken = true;
        player?.disconnect();
        player = null;
        return false;
      }
    })();
    return initPromise;
  }

  return {
    name: 'sdk',
    label: 'Full track (Spotify Premium)',
    warmUp: init,
    async supports(pb) {
      if (broken || !pb.uri) return false;
      return init();
    },
    async play(pb) {
      player.activateElement?.();
      // Jump ~30% in to land nearer the chorus.
      const positionMs = pb.durationMs ? Math.min(45_000, pb.durationMs * 0.3) : 0;
      await apiPost('/api/playback/play', { deviceId, uri: pb.uri, positionMs });
    },
    async resume() {
      player?.activateElement?.();
      await player?.resume();
    },
    pause: () => player?.pause(),
    stop: () => {
      player?.pause()?.catch?.(() => {});
    },
    destroy() {
      player?.disconnect();
      player = null;
    },
  };
}

// ---------------------------------------------------------------------------
// 3) Spotify Embed (iFrame API). Needs no token at all: plays the full track
//    if the listener is logged into Spotify in that browser, otherwise a
//    preview clip. Works on phones. Mobile browsers may require a tap on the
//    embed's own play button.

let iframeApi = null;
function loadIframeApi() {
  if (iframeApi) return iframeApi;
  iframeApi = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      iframeApi = null;
      reject(new Error('embed_timeout'));
    }, 10_000);
    window.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timer);
      resolve(api);
    };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      iframeApi = null;
      reject(new Error('embed_blocked'));
    };
    document.body.appendChild(s);
  });
  return iframeApi;
}

export function createEmbedProvider({ getContainer, onState }) {
  let controller = null;
  let host = null;
  let playing = false;
  const waiters = new Set();

  const notify = (evt) => {
    for (const w of [...waiters]) w(evt);
  };
  const waitFor = (pred, ms) =>
    new Promise((resolve) => {
      const done = (v) => {
        waiters.delete(check);
        clearTimeout(t);
        resolve(v);
      };
      const check = (evt) => pred(evt) && done(true);
      const t = setTimeout(() => done(false), ms);
      waiters.add(check);
    });

  async function ensure(uri) {
    const container = getContainer();
    if (!container) throw new Error('no_container');
    if (controller && host === container && container.isConnected) {
      const ready = waitFor((e) => e.type === 'ready', 4000);
      controller.loadUri(uri);
      await ready;
      return;
    }
    const api = await loadIframeApi();
    container.innerHTML = '';
    const target = document.createElement('div');
    container.appendChild(target);
    host = container;
    const ready = waitFor((e) => e.type === 'ready', 6000);
    controller = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('embed_timeout')), 8000);
      api.createController(target, { uri, width: '100%', height: 80 }, (c) => {
        clearTimeout(t);
        c.addListener('ready', () => notify({ type: 'ready' }));
        c.addListener('playback_update', (e) => {
          playing = !e.data.isPaused;
          onState?.({ playing });
          notify({ type: 'update', playing });
        });
        resolve(c);
      });
    });
    await ready;
  }

  return {
    name: 'embed',
    label: 'Spotify player',
    async supports(pb) {
      return !!pb.uri;
    },
    async play(pb) {
      await ensure(pb.uri);
      const started = waitFor((e) => e.type === 'update' && e.playing, 2500);
      controller.play();
      if (!(await started)) throw new NeedsGesture();
    },
    async resume() {
      controller?.resume();
      if (!(await waitFor((e) => e.type === 'update' && e.playing, 2000))) controller?.togglePlay();
    },
    pause: () => controller?.pause(),
    stop: () => {
      if (playing) controller?.pause();
    },
    destroy() {
      controller?.destroy?.();
      controller = null;
    },
  };
}
