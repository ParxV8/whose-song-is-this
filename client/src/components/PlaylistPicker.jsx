import { useEffect, useState } from 'react';
import { Button, Cover } from './ui.jsx';

const MIN = 10;

export default function PlaylistPicker({ game }) {
  const { call, notify, session } = game;
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [url, setUrl] = useState('');
  const [linking, setLinking] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    call('playlist:list').then((res) => {
      if (!alive) return;
      if (res.ok) setLists(res.playlists);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [call]);

  async function link(payload, key) {
    setLinking(key);
    const res = await call('playlist:link', payload);
    setLinking(null);
    if (!res.ok) notify(res.error, 'error');
    else notify(`Linked “${res.playlist.name}” · ${res.playlist.trackCount} songs`, 'success');
  }

  const filtered = (lists || []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) link({ input: url.trim() }, 'url');
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a playlist link…"
          inputMode="url"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-ink px-4 outline-none focus:border-spotify"
        />
        <Button size="md" disabled={!url.trim() || !!linking}>{linking === 'url' ? '…' : 'Link'}</Button>
      </form>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-white/50">Your playlists</h4>
          {lists?.length > 8 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-9 w-32 rounded-lg border border-line bg-ink px-3 text-sm outline-none focus:border-spotify"
            />
          )}
        </div>
        {error && <p className="rounded-xl bg-hot/15 p-3 text-sm text-hot">{error}</p>}
        {!lists && !error && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-panel-2" />
            ))}
          </div>
        )}
        {lists && !lists.length && (
          <p className="text-sm text-white/60">No playlists you own or collaborate on. Create one in Spotify, or paste a link to one of yours.</p>
        )}
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {filtered.map((p) => {
            const small = p.trackCount < MIN;
            return (
              <li key={p.id}>
                <button
                  disabled={small || !!linking}
                  onClick={() => link({ input: p.id }, p.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-panel-2 p-2 pr-4 text-left transition hover:bg-line active:scale-[0.98] disabled:opacity-40"
                >
                  <Cover src={p.image} size={56} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-sm text-white/50">
                      {p.trackCount} songs{p.collaborative ? ' · collab' : ''}
                      {small ? ` · needs ${MIN}+` : ''}
                    </span>
                  </span>
                  <span className="font-display text-xl text-spotify">{linking === p.id ? '…' : '→'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-white/40">
          Spotify only lets apps read playlists you own or collaborate on. Want to use someone else’s? Save a copy to your library first.
        </p>
      </div>
      {session.config?.demoEnabled && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => link({ demo: true }, 'demo')}>
          🧪 Use a demo playlist (testing)
        </Button>
      )}
    </div>
  );
}
