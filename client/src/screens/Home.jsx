import { useEffect, useState } from 'react';
import { AVATARS, COLORS, loadProfile, saveProfile } from '../lib/util.js';
import { Avatar, Button, Card } from '../components/ui.jsx';
import { primeAudio } from '../audio/providers.js';

export default function Home({ call, initialCode, notify, online }) {
  const [profile, setProfile] = useState(loadProfile);
  const [mode, setMode] = useState(initialCode ? 'join' : 'start');
  const [code, setCode] = useState(initialCode || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      setMode('join');
    }
  }, [initialCode]);

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));
  const nameOk = profile.name.trim().length > 0;

  async function go(kind) {
    if (!nameOk) return notify('Pick a display name first', 'error');
    primeAudio();
    saveProfile(profile);
    setBusy(true);
    const res = kind === 'create' ? await call('room:create', profile) : await call('room:join', { ...profile, code });
    setBusy(false);
    if (!res.ok) notify(res.error, 'error');
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <header className="flex flex-col items-center pt-4 text-center">
        <div className="vinyl relative mb-5 size-36 animate-spin-slow" style={{ '--label': profile.color }}>
          <span className="absolute inset-0 grid place-items-center text-3xl">{profile.avatar}</span>
        </div>
        <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight">
          Whose Song
          <br />
          <span className="text-gradient">Is This?</span>
        </h1>
        <p className="mt-3 max-w-xs text-white/60">Link your Spotify playlists. Guess which friend each song came from.</p>
      </header>

      <Card className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar player={profile} size={64} ring />
          <input
            value={profile.name}
            onChange={(e) => set({ name: e.target.value.slice(0, 20) })}
            placeholder="Your name"
            autoComplete="nickname"
            className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-ink px-4 font-display text-xl font-bold outline-none focus:border-spotify"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              onClick={() => set({ color: c })}
              className={`size-10 rounded-full transition active:scale-90 ${profile.color === c ? 'ring-4 ring-white ring-offset-2 ring-offset-panel' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="grid grid-cols-8 gap-1">
          {AVATARS.map((a) => (
            <button
              key={a}
              onClick={() => set({ avatar: a })}
              className={`grid aspect-square place-items-center rounded-xl text-2xl transition active:scale-90 ${profile.avatar === a ? 'bg-white/15' : 'hover:bg-white/5'}`}
            >
              {a}
            </button>
          ))}
        </div>
      </Card>

      {mode === 'start' ? (
        <div className="grid gap-3">
          <Button onClick={() => go('create')} disabled={busy || !online}>
            🎉 Create a room
          </Button>
          <Button variant="secondary" onClick={() => setMode('join')}>
            Join with a code
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            placeholder="CODE"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-20 rounded-2xl border-2 border-line bg-ink text-center font-display text-5xl font-extrabold tracking-[0.4em] outline-none placeholder:text-white/15 focus:border-spotify"
          />
          <Button onClick={() => go('join')} disabled={busy || code.length !== 4 || !online}>
            Join room →
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode('start')}>
            ← Back
          </Button>
        </div>
      )}
    </div>
  );
}
