import { useState } from 'react';
import { Avatar, Button, Card, Cover, Segmented, Toggle } from '../components/ui.jsx';
import PlaylistPicker from '../components/PlaylistPicker.jsx';
import { apiPost, startSpotifyLogin } from '../lib/api.js';
import { buzz } from '../lib/util.js';
import { primeAudio } from '../audio/providers.js';

function RoomCode({ code, notify }) {
  const link = `${window.location.origin}/room/${code}`;
  async function share() {
    buzz();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Whose Song Is This?', text: `Join my room: ${code}`, url: link });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      notify('Invite link copied!', 'success');
    } catch {
      notify(link);
    }
  }
  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Room code</p>
      <button onClick={share} className="group mt-1 inline-flex flex-col items-center">
        <span className="font-display text-7xl font-extrabold tracking-[0.15em] text-gradient">{code}</span>
        <span className="mt-1 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white/80 group-active:scale-95">
          📲 Share invite link
        </span>
      </button>
    </div>
  );
}

function Step({ n, done, title, children }) {
  return (
    <div className="flex gap-3">
      <div className={`grid size-8 shrink-0 place-items-center rounded-full font-display font-bold ${done ? 'bg-spotify text-ink' : 'bg-line text-white/70'}`}>
        {done ? '✓' : n}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className="mb-3 font-display text-lg font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function MySetup({ game }) {
  const { me, call, notify, session, refreshSession } = game;
  const connected = !!me.spotify;
  const demoOnly = !session.config?.spotifyConfigured && session.config?.demoEnabled;

  if (me.playlist) {
    const pl = me.playlist;
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <Cover src={pl.image} size={84} rounded="rounded-2xl" className="shadow-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-spotify">Your playlist</p>
            <p className="truncate font-display text-xl font-bold">{pl.name}</p>
            <p className="text-sm text-white/60">
              {pl.trackCount} songs
              {pl.previewCount > 0 ? ` · ${pl.previewCount} with previews` : ''}
            </p>
          </div>
        </div>
        <Button
          className="w-full"
          variant={me.ready ? 'secondary' : 'primary'}
          onClick={() => {
            buzz(40);
            call('player:ready', { ready: !me.ready }).then((r) => !r.ok && notify(r.error, 'error'));
          }}
        >
          {me.ready ? '✓ Ready! (tap to undo)' : "I'm ready"}
        </Button>
        <button
          className="w-full text-sm text-white/50 underline-offset-4 hover:underline"
          onClick={() => call('playlist:unlink')}
        >
          Change playlist
        </button>
      </Card>
    );
  }

  return (
    <Card className="space-y-6">
      {!demoOnly && (
        <Step n={1} done={connected} title={connected ? `Spotify connected` : 'Connect Spotify'}>
          {connected ? (
            <div className="flex items-center justify-between gap-2 text-sm text-white/60">
              <span>Signed in as {me.spotify.name}</span>
              <button
                className="underline-offset-4 hover:underline"
                onClick={() => apiPost('/api/auth/disconnect').then(refreshSession)}
              >
                Switch
              </button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={() => startSpotifyLogin(window.location.pathname).catch((e) => notify(e.message, 'error'))}
            >
              <SpotifyGlyph /> Connect Spotify
            </Button>
          )}
        </Step>
      )}
      <Step n={demoOnly ? 1 : 2} done={false} title="Pick a playlist">
        {connected ? (
          <PlaylistPicker game={game} />
        ) : demoOnly ? (
          <Button variant="secondary" className="w-full" onClick={() => call('playlist:link', { demo: true })}>
            🧪 Use a demo playlist
          </Button>
        ) : (
          <p className="text-sm text-white/50">Connect Spotify first, then choose a playlist with at least 10 songs.</p>
        )}
      </Step>
    </Card>
  );
}

function SpotifyGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
      <path d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm4.8 15.15a.66.66 0 0 1-.9.22c-2.47-1.5-5.58-1.85-9.25-1.01a.66.66 0 1 1-.29-1.28c4.01-.92 7.46-.52 10.22 1.17.31.19.41.6.22.9Zm1.28-2.85a.82.82 0 0 1-1.13.27c-2.83-1.74-7.14-2.24-10.48-1.23a.82.82 0 1 1-.48-1.57c3.82-1.16 8.57-.6 11.82 1.4.38.23.5.74.27 1.13Zm.11-2.97C14.8 8.8 9.2 8.6 5.96 9.6a.98.98 0 1 1-.57-1.88c3.72-1.13 9.9-.91 13.8 1.4a.98.98 0 0 1-1 1.7Z" />
    </svg>
  );
}

function PlayerRow({ p, game }) {
  const { state, isHost, call } = game;
  const isMe = p.id === state.me;
  let status;
  if (!p.connected) status = <span className="text-white/40">offline</span>;
  else if (p.ready) status = <span className="font-bold text-spotify">Ready ✓</span>;
  else if (p.playlist) status = <span className="text-sun">Linked</span>;
  else if (p.spotify) status = <span className="text-white/50">Picking playlist…</span>;
  else status = <span className="text-white/50">Connecting…</span>;

  return (
    <li className="flex animate-slide-up items-center gap-3 rounded-2xl bg-panel-2/70 p-2 pr-3">
      <Avatar player={p} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {p.name}
          {isMe && <span className="text-white/40"> (you)</span>}
          {p.id === state.hostId && <span title="Host"> 👑</span>}
        </p>
        <p className="truncate text-sm">
          {status}
          {p.playlist && <span className="text-white/40"> · {p.playlist.trackCount} songs</span>}
        </p>
      </div>
      {isHost && !isMe && (
        <button
          onClick={() => confirm(`Remove ${p.name}?`) && call('host:kick', { playerId: p.id })}
          className="grid size-9 place-items-center rounded-full text-white/30 hover:bg-white/10 hover:text-white"
          aria-label={`Remove ${p.name}`}
        >
          ✕
        </button>
      )}
    </li>
  );
}

function Settings({ game }) {
  const { state, isHost, call, notify } = game;
  const s = state.settings;
  const update = (patch) => call('host:settings', patch).then((r) => !r.ok && notify(r.error, 'error'));
  if (!isHost) {
    return (
      <Card>
        <h3 className="mb-2 font-display text-lg font-bold">Game settings</h3>
        <p className="text-white/60">
          {s.rounds ? `${s.rounds} rounds` : 'Unlimited rounds'} · {s.hardMode ? 'Hard mode 🔥' : 'Normal mode'} ·{' '}
          {s.audioMode === 'host' ? 'Music on host’s phone' : 'Music on every phone'}
        </p>
      </Card>
    );
  }
  return (
    <Card className="space-y-4">
      <h3 className="font-display text-lg font-bold">Game settings</h3>
      <div>
        <p className="mb-2 text-sm font-semibold text-white/60">Rounds</p>
        <Segmented
          value={s.rounds}
          onChange={(rounds) => update({ rounds })}
          options={[
            { value: 5, label: '5' },
            { value: 10, label: '10' },
            { value: 15, label: '15' },
            { value: 0, label: '∞' },
          ]}
        />
      </div>
      <Toggle checked={s.hardMode} onChange={(hardMode) => update({ hardMode })} label="Hard mode 🔥" hint="Hide album art and title until the reveal" />
      <Toggle
        checked={s.audioMode === 'everyone'}
        onChange={(v) => update({ audioMode: v ? 'everyone' : 'host' })}
        label="Play on every phone"
        hint="Off = only your device plays music (best around a table)"
      />
      <Toggle checked={s.autoAdvance} onChange={(autoAdvance) => update({ autoAdvance })} label="Auto-advance" hint="Move to the next song after the reveal" />
      {state.players.some((p) => p.playlist?.previewCount > 0) && (
        <Toggle
          checked={s.requirePreview}
          onChange={(requirePreview) => update({ requirePreview })}
          label="Only songs with previews"
          hint="Skip tracks without a 30-sec preview clip"
        />
      )}
    </Card>
  );
}

export default function Lobby({ game }) {
  const { state, me, isHost, call, notify, leave } = game;
  const [starting, setStarting] = useState(false);
  const lobby = state.lobby || {};

  async function start() {
    primeAudio();
    buzz(60);
    setStarting(true);
    const res = await call('host:start');
    setStarting(false);
    if (!res.ok) notify(res.error, 'error');
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pb-40 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <RoomCode code={state.code} notify={notify} />

      <MySetup game={game} />

      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-display text-lg font-bold">Players</h3>
          <span className="text-sm text-white/50">
            {state.players.filter((p) => p.ready).length}/{state.players.length} ready
          </span>
        </div>
        <ul className="space-y-2">
          {state.players.map((p) => (
            <PlayerRow key={p.id} p={p} game={game} />
          ))}
        </ul>
      </Card>

      <Settings game={game} />

      <button onClick={leave} className="w-full py-2 text-sm text-white/40 hover:text-white">
        Leave room
      </button>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        <div className="mx-auto max-w-md">
          {isHost ? (
            <>
              <Button className="w-full text-xl" disabled={!lobby.canStart || starting} onClick={start}>
                {starting ? 'Shuffling…' : '▶ Start game'}
              </Button>
              {lobby.reason && <p className="mt-2 text-center text-sm text-white/50">{lobby.reason}</p>}
            </>
          ) : (
            <p className="rounded-2xl bg-panel-2 py-4 text-center font-semibold text-white/70">
              {me?.ready ? 'Waiting for the host to start… 🎶' : 'Link a playlist and tap Ready'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
