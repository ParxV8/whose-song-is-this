import { useEffect, useState } from 'react';
import { Avatar, Button, Confetti, Countdown, Cover } from '../components/ui.jsx';
import { buzz, playerMap, possessive, sharedLine } from '../lib/util.js';

export default function Reveal({ game }) {
  const { state, me, isHost, call, now } = game;
  const r = state.round;
  const res = r.results;
  const byId = playerMap(state.players);
  const owners = res.owners.map((id) => byId[id]).filter(Boolean);
  const myVote = res.votes.find((v) => v.voterId === me.id);
  const iOwn = res.owners.includes(me.id);
  const myPoints = res.points[me.id] || 0;
  const celebrate = myVote?.correct || (iOwn && res.fooled > 0);

  // Stage 0: drumroll, 1: owner reveal, 2: details
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => {
      setStage(1);
      buzz(celebrate ? [40, 60, 40] : 80);
    }, 1100);
    const t2 = setTimeout(() => setStage(2), 1900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [r.number, celebrate]);

  const headline =
    owners.length > 1 ? sharedLine(owners.map((o) => o.name)) : owners[0] ? `It was ${possessive(owners[0].name)} song!` : 'Mystery owner!';

  let verdict = null;
  if (iOwn) verdict = res.fooled > 0 ? `You fooled ${res.fooled} ${res.fooled === 1 ? 'friend' : 'friends'} 😈` : 'Busted! Everyone knew 🙈';
  else if (myVote?.correct) verdict = 'You got it! 🎯';
  else if (myVote) verdict = `Nope — you guessed ${byId[myVote.targetId]?.name ?? '?'}`;
  else if (res.missed.includes(me.id)) verdict = 'Too slow! ⏰';

  const ranked = [...state.players].filter((p) => !p.left || p.score > 0).sort((a, b) => b.score - a.score);
  const accent = owners[0]?.color || '#1db954';

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-44 pt-[max(1rem,env(safe-area-inset-top))]">
      {stage >= 1 && celebrate && <Confetti />}

      <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
        Round {r.number}
        {r.total ? ` of ${r.total}` : ''}
      </p>

      <div className="relative mt-4 flex min-h-56 flex-col items-center justify-center">
        {stage === 0 ? (
          <div className="flex flex-col items-center">
            <span className="animate-drumroll text-6xl">🥁</span>
            <p className="mt-4 font-display text-3xl font-extrabold">And it was…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex -space-x-4">
              {owners.map((o, i) => (
                <div key={o.id} className="animate-pop" style={{ animationDelay: `${i * 120}ms` }}>
                  <Avatar player={o} size={owners.length > 1 ? 96 : 128} ring />
                </div>
              ))}
            </div>
            <h1 className="mt-5 animate-slide-up text-center font-display text-3xl font-extrabold leading-tight" style={{ color: accent }}>
              {headline}
            </h1>
            {verdict && (
              <p className="mt-2 animate-slide-up text-center text-lg font-semibold" style={{ animationDelay: '150ms' }}>
                {verdict}
                {myPoints > 0 && <span className="ml-2 inline-block animate-pop rounded-full bg-spotify px-3 py-0.5 font-display text-ink">+{myPoints}</span>}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="my-5 min-h-16">
        <div>
          {isHost ? (
            <Button className="w-full" onClick={() => call('host:next')}>
              {r.isLast ? '🏆 See final results' : 'Next song →'}
              {state.settings.autoAdvance && r.revealEndsAt && (
                <Countdown endsAt={r.revealEndsAt} now={now}>
                  {(s) => <span className="text-ink/60">({s})</span>}
                </Countdown>
              )}
            </Button>
          ) : (
            state.settings.autoAdvance &&
            r.revealEndsAt && (
              <Countdown endsAt={r.revealEndsAt} now={now}>
                {(s) => (
                  <p className="rounded-2xl bg-panel-2/90 py-3 text-center text-white/60 backdrop-blur">
                    {r.isLast ? 'Final results' : 'Next song'} in {s}…
                  </p>
                )}
              </Countdown>
            )
          )}
        </div>
      </div>

      {stage >= 2 && (
        <div className="animate-slide-up space-y-5">
          <div className="rounded-3xl border border-line bg-panel/80 p-4">
            <div className="flex items-center gap-4">
              <Cover src={res.track.image} size={72} />
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-bold">{res.track.name}</p>
                <p className="truncate text-white/60">{res.track.artists?.join(', ')}</p>
                {res.track.url && (
                  <a href={res.track.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-spotify">
                    Open in Spotify ↗
                  </a>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">Votes</h3>
            <ul className="space-y-2">
              {res.votes.map((v, i) => {
                const voter = byId[v.voterId];
                const target = byId[v.targetId];
                if (!voter) return null;
                return (
                  <li
                    key={v.voterId}
                    className={`flex animate-slide-up items-center gap-3 rounded-2xl p-2 pr-3 ${v.correct ? 'bg-spotify/15' : 'bg-panel-2/70'}`}
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <Avatar player={voter} size={36} />
                    <span className="min-w-0 flex-1 truncate">
                      <b>{voter.name}</b> <span className="text-white/40">→</span> {target?.name}
                    </span>
                    <span className="text-xs text-white/40">{(v.ms / 1000).toFixed(1)}s</span>
                    <span className={`w-14 text-right font-display font-bold ${v.correct ? 'text-spotify' : 'text-hot'}`}>
                      {v.correct ? `+${v.points}` : '✗'}
                    </span>
                  </li>
                );
              })}
              {owners.map(
                (o) =>
                  res.fooled > 0 && (
                    <li key={`own-${o.id}`} className="flex items-center gap-3 rounded-2xl bg-grape/15 p-2 pr-3">
                      <Avatar player={o} size={36} />
                      <span className="min-w-0 flex-1 truncate">
                        <b>{o.name}</b> fooled {res.fooled}
                      </span>
                      <span className="w-14 text-right font-display font-bold text-grape">+{res.fooled * 50}</span>
                    </li>
                  ),
              )}
              {res.missed.map((id) =>
                byId[id] ? (
                  <li key={`miss-${id}`} className="flex items-center gap-3 rounded-2xl bg-panel-2/40 p-2 pr-3 text-white/40">
                    <Avatar player={byId[id]} size={36} />
                    <span className="flex-1">{byId[id].name} didn’t vote</span>
                  </li>
                ) : null,
              )}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">Standings</h3>
            <ol className="space-y-1.5">
              {ranked.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 px-1">
                  <span className="w-5 text-right font-display font-bold text-white/40">{i + 1}</span>
                  <Avatar player={p} size={28} />
                  <span className={`flex-1 truncate ${p.id === me.id ? 'font-bold' : ''}`}>{p.name}</span>
                  {res.points[p.id] > 0 && <span className="text-sm font-bold text-spotify">+{res.points[p.id]}</span>}
                  <span className="w-14 text-right font-display font-bold tabular-nums">{p.score}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

    </div>
  );
}
