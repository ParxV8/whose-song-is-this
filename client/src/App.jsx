import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { clearToken, ensureSession } from './lib/api.js';
import { Toast } from './components/ui.jsx';
import AudioDock from './audio/AudioDock.jsx';
import Home from './screens/Home.jsx';
import Lobby from './screens/Lobby.jsx';
import RoundScreen from './screens/Round.jsx';
import Reveal from './screens/Reveal.jsx';
import End from './screens/End.jsx';

const roomCodeFromPath = () => window.location.pathname.match(/^\/room\/([A-Za-z]{4})\/?$/)?.[1]?.toUpperCase() ?? null;

const SPOTIFY_ERRORS = {
  not_allowlisted:
    'Spotify blocked the sign-in. This app is in Development Mode, so its owner must add your Spotify email under “User Management” in the Spotify dashboard (max 5 users).',
  access_denied: 'Spotify sign-in was cancelled.',
  expired: 'That sign-in attempt expired — please try again.',
  session: 'Your session expired — please try again.',
  exchange_failed: 'Couldn’t finish connecting to Spotify. Please try again.',
};

export default function App() {
  const [session, setSession] = useState(null);
  const [bootError, setBootError] = useState(null);
  const [state, setState] = useState(null);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState(null);
  const [pendingCode, setPendingCode] = useState(roomCodeFromPath);
  const socketRef = useRef(null);
  const offsetRef = useRef(0);

  const notify = useCallback((message, tone = 'info') => setToast({ message, tone, id: Date.now() }), []);
  const clearToast = useCallback(() => setToast(null), []);
  const refreshSession = useCallback(() => ensureSession().then(setSession), []);

  // Result of the Spotify OAuth redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('spotify');
    if (!result) return;
    if (result === 'connected') notify('Spotify connected 🎉', 'success');
    else notify(SPOTIFY_ERRORS[params.get('reason')] || 'Spotify connection failed.', 'error');
    window.history.replaceState(null, '', window.location.pathname);
  }, [notify]);

  useEffect(() => {
    refreshSession().catch((e) => setBootError(e.message));
  }, [refreshSession]);

  useEffect(() => {
    if (!session?.token) return;
    const socket = io({ auth: { token: session.token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setOnline(true);
      const code = roomCodeFromPath();
      if (!code) return;
      socket.emit('room:resume', { code }, (res) => {
        if (!res?.ok) {
          notify(res?.error || 'Room not found', 'error');
          setPendingCode(null);
          setState(null);
          window.history.replaceState(null, '', '/');
        } else if (res.needsJoin) {
          setPendingCode(code);
        }
      });
    });
    socket.on('disconnect', () => setOnline(false));
    socket.on('connect_error', (err) => {
      setOnline(false);
      if (err.message === 'no_session') {
        // Server restarted and forgot us — get a fresh session.
        clearToken();
        refreshSession();
      }
    });
    socket.on('state', (st) => {
      offsetRef.current = st.serverNow - Date.now();
      setState(st);
      const path = `/room/${st.code}`;
      if (window.location.pathname !== path) window.history.replaceState(null, '', path);
    });
    const exit = (msg) => {
      setState(null);
      setPendingCode(null);
      window.history.replaceState(null, '', '/');
      if (msg) notify(msg, 'error');
    };
    socket.on('kicked', () => exit('You were removed from the room'));
    socket.on('left', () => exit());

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.token, notify, refreshSession]);

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => {
        const s = socketRef.current;
        if (!s?.connected) return resolve({ ok: false, error: 'Not connected — reconnecting…' });
        s.timeout(30_000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'The server didn’t respond' } : res));
      }),
    [],
  );
  const now = useCallback(() => Date.now() + offsetRef.current, []);
  const leave = useCallback(async () => {
    await call('room:leave');
    setState(null);
    setPendingCode(null);
    window.history.replaceState(null, '', '/');
  }, [call]);

  if (bootError) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-5xl">📡</p>
          <p className="mt-4 font-display text-2xl font-bold">Can’t reach the game server</p>
          <p className="mt-2 text-white/60">{bootError}</p>
          <button className="mt-6 rounded-2xl bg-spotify px-6 py-3 font-bold text-ink" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="vinyl size-24 animate-spin-slow" />
      </div>
    );
  }

  const me = state?.players.find((p) => p.id === state.me);
  const game = state && me ? { state, me, isHost: state.hostId === state.me, call, now, notify, session, refreshSession, leave } : null;

  let screen;
  if (!game) {
    screen = <Home call={call} initialCode={pendingCode} notify={notify} online={online} />;
  } else if (state.phase === 'lobby') screen = <Lobby game={game} />;
  else if (state.phase === 'voting') screen = <RoundScreen key={state.round.number} game={game} />;
  else if (state.phase === 'reveal') screen = <Reveal key={state.round.number} game={game} />;
  else screen = <End game={game} />;

  return (
    <>
      {!online && (
        <div className="fixed inset-x-0 top-0 z-50 bg-sun py-1.5 text-center text-sm font-bold text-ink">Reconnecting…</div>
      )}
      <main key={game ? `${state.phase}-${state.round?.number ?? 0}` : 'home'} className="animate-slide-up">
        {screen}
      </main>
      {game && <AudioDock game={game} />}
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
