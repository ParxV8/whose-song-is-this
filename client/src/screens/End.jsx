import { Avatar, Button, Confetti } from '../components/ui.jsx';
import { playerMap } from '../lib/util.js';

const PODIUM = [
  { place: 2, h: 'h-24', medal: '🥈' },
  { place: 1, h: 'h-32', medal: '🥇' },
  { place: 3, h: 'h-16', medal: '🥉' },
];

export default function End({ game }) {
  const { state, me, isHost, call, leave, notify } = game;
  const byId = playerMap(state.players);
  const board = (state.final?.leaderboard || []).map((e) => ({ ...e, p: byId[e.id] })).filter((e) => e.p);
  const awards = state.final?.awards || [];
  const winner = board[0];
  const iWon = winner?.id === me.id;

  return (
    <div className="mx-auto min-h-dvh max-w-md space-y-6 px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Confetti count={iWon ? 140 : 60} />
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
          Game over · {state.final?.roundsPlayed ?? 0} songs
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold">
          {winner ? (
            <>
              <span style={{ color: winner.p.color }}>{winner.p.name}</span> wins!
            </>
          ) : (
            'Game over'
          )}
        </h1>
      </header>

      <div className="flex items-end justify-center gap-3 pt-6">
        {PODIUM.map(({ place, h, medal }) => {
          const e = board[place - 1];
          if (!e) return <div key={place} className="w-24" />;
          return (
            <div key={place} className="flex w-24 animate-slide-up flex-col items-center" style={{ animationDelay: `${(3 - place) * 200}ms` }}>
              <div className={place === 1 ? 'animate-float' : ''}>
                <Avatar player={e.p} size={place === 1 ? 72 : 56} ring={place === 1} />
              </div>
              <p className="mt-2 max-w-full truncate font-bold">{e.p.name}</p>
              <p className="font-display text-sm text-white/60 tabular-nums">{e.score}</p>
              <div
                className={`mt-2 grid w-full place-items-start justify-center rounded-t-2xl pt-2 text-3xl ${h}`}
                style={{ background: `linear-gradient(${e.p.color}cc, ${e.p.color}22)` }}
              >
                {medal}
              </div>
            </div>
          );
        })}
      </div>

      {awards.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-bold">Awards</h2>
          <div className="grid gap-3">
            {awards.map((a, i) => {
              const p = byId[a.playerId];
              if (!p) return null;
              return (
                <div
                  key={a.id}
                  className="flex animate-pop items-center gap-4 rounded-3xl border border-line bg-panel/80 p-4"
                  style={{ animationDelay: `${400 + i * 150}ms` }}
                >
                  <span className="text-4xl">{a.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-sun">{a.title}</p>
                    <p className="truncate font-display text-lg font-bold">{p.name}</p>
                    <p className="text-sm text-white/50">{a.detail}</p>
                  </div>
                  <Avatar player={p} size={44} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Leaderboard</h2>
        <ol className="space-y-2">
          {board.map((e) => (
            <li key={e.id} className={`flex items-center gap-3 rounded-2xl p-2 pr-4 ${e.id === me.id ? 'bg-spotify/15' : 'bg-panel-2/70'}`}>
              <span className="w-6 text-right font-display text-lg font-bold text-white/40">{e.rank}</span>
              <Avatar player={e.p} size={40} />
              <span className="flex-1 truncate font-semibold">{e.p.name}</span>
              <span className="font-display text-xl font-extrabold tabular-nums">{e.score}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-2">
        {isHost ? (
          <Button className="w-full text-xl" onClick={() => call('host:playAgain').then((r) => !r.ok && notify(r.error, 'error'))}>
            🔁 Play again
          </Button>
        ) : (
          <p className="rounded-2xl bg-panel-2 py-4 text-center font-semibold text-white/70">Waiting for the host to start another game…</p>
        )}
        <Button variant="ghost" size="sm" className="w-full" onClick={leave}>
          Leave room
        </Button>
      </div>
    </div>
  );
}
