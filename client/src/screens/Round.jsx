import { useState } from 'react';
import { Avatar, Button, Timer } from '../components/ui.jsx';
import { buzz, possessive } from '../lib/util.js';

export function TrackCard({ track, label, spinning = true, color = '#1db954' }) {
  if (track.hidden) {
    return (
      <div className="flex flex-col items-center">
        <div className={`vinyl relative size-44 ${spinning ? 'animate-spin-slow' : ''}`} style={{ '--label': color }}>
          <span className="absolute inset-0 grid place-items-center font-display text-4xl font-extrabold text-ink">?</span>
        </div>
        <p className="mt-4 font-display text-xl font-bold text-white/80">Mystery track 🔥</p>
        {label}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        {track.image ? (
          <img src={track.image} alt="" className="size-48 rounded-3xl object-cover shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]" />
        ) : (
          <div className={`vinyl size-44 ${spinning ? 'animate-spin-slow' : ''}`} style={{ '--label': color }} />
        )}
      </div>
      <p className="mt-4 max-w-full truncate px-2 font-display text-2xl font-extrabold">{track.name}</p>
      <p className="max-w-full truncate px-2 text-white/60">{track.artists?.join(', ')}</p>
      {label}
    </div>
  );
}

export default function RoundScreen({ game }) {
  const { state, me, isHost, call, now, notify } = game;
  const r = state.round;
  const [pending, setPending] = useState(null);
  const host = state.players.find((p) => p.id === state.hostId);
  const options = state.players.filter((p) => r.options.includes(p.id) && p.id !== me.id);
  const chosen = r.myVote || pending;
  const waitingOn = Math.max(0, r.voterCount - r.votedCount);

  async function vote(id) {
    if (chosen) return;
    buzz(30);
    setPending(id);
    const res = await call('vote', { targetId: id });
    if (!res.ok) {
      setPending(null);
      notify(res.error, 'error');
    }
  }

  const listenLabel =
    !r.playback && state.settings.audioMode === 'host' ? (
      <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/70">
        <span className="eq"><span /><span /><span /><span /></span>
        Playing on {host ? possessive(host.name) : 'the host’s'} phone
      </p>
    ) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-44 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/50">Round</p>
          <p className="font-display text-3xl font-extrabold">
            {r.number}
            <span className="text-white/30">{r.total ? ` / ${r.total}` : ''}</span>
          </p>
        </div>
        <Timer endsAt={r.endsAt} durationMs={r.durationMs} now={now} />
      </header>

      <div className="my-6">
        <TrackCard track={r.track} label={listenLabel} />
      </div>

      <h2 className="mb-3 text-center font-display text-2xl font-extrabold">Whose song is this?</h2>

      {options.length === 0 ? (
        <p className="rounded-2xl bg-panel-2 p-4 text-center text-white/60">No one else to vote for this round — sit back and listen 🎧</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {options.map((p) => {
            const picked = chosen === p.id;
            const faded = chosen && !picked;
            return (
              <button
                key={p.id}
                onClick={() => vote(p.id)}
                disabled={!!chosen}
                className={`relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border-2 p-3 transition duration-200 active:scale-95 ${picked ? 'scale-[1.03]' : ''} ${faded ? 'opacity-30' : ''}`}
                style={{
                  borderColor: picked ? p.color : '#2b2b3b',
                  background: picked ? `${p.color}33` : '#15151fcc',
                  boxShadow: picked ? `0 0 40px -8px ${p.color}` : undefined,
                }}
              >
                <Avatar player={p} size={52} />
                <span className="max-w-full truncate font-display text-lg font-bold">{p.name}</span>
                {picked && <span className="absolute right-3 top-3 animate-pop text-xl">🔒</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5 text-center text-white/60">
        {chosen ? (
          <p className="animate-pop font-semibold">
            Locked in! {waitingOn > 0 ? `Waiting on ${waitingOn} more…` : 'Revealing…'}
          </p>
        ) : (
          <p>
            {r.votedCount}/{r.voterCount} voted
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {state.players
          .filter((p) => !p.left)
          .map((p) => (
            <div key={p.id} className={`transition ${p.hasVoted ? '' : 'opacity-30'}`}>
              <Avatar player={p} size={28} />
            </div>
          ))}
      </div>

      {isHost && (
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => call('host:next')}>
            Reveal now
          </Button>
          <Button variant="ghost" size="sm" onClick={() => confirm('End the game now?') && call('host:end')}>
            End game
          </Button>
        </div>
      )}
    </div>
  );
}
