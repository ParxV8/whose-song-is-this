import { useEffect, useRef, useState } from 'react';
import { createAudioEngine } from './engine.js';

// Persistent audio dock, mounted once at the app root so music keeps playing
// from voting through the reveal. Only renders controls on the device(s) the
// server marked as audio devices (the host by default).
export default function AudioDock({ game }) {
  const { state, session } = game;
  const r = state.round;
  const pb = r?.playback;
  const inRound = state.phase === 'voting' || state.phase === 'reveal';
  const active = inRound && !!pb;
  const hideMeta = state.settings.hardMode && state.phase === 'voting';

  const embedRef = useRef(null);
  const engineRef = useRef(null);
  const [status, setStatus] = useState({ provider: null, playing: false, needsTap: false, loading: false });

  if (!engineRef.current) {
    engineRef.current = createAudioEngine({
      sdkEnabled: !!session.config?.sdkEnabled,
      getEmbedContainer: () => embedRef.current,
      onStatus: (patch) => setStatus((s) => ({ ...s, ...patch })),
    });
  }

  const isAudioDevice = !!pb || (state.settings.audioMode === 'host' ? game.isHost : true);
  useEffect(() => {
    if (isAudioDevice && session.config?.sdkEnabled) engineRef.current.warmUp();
  }, [isAudioDevice, session.config?.sdkEnabled]);

  const trackKey = active ? `${r.number}|${pb.uri || pb.previewUrl || pb.title}` : null;
  useEffect(() => {
    const engine = engineRef.current;
    if (!trackKey) {
      engine.stop();
      return;
    }
    engine.load(pb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);

  // Stop (but don't tear down) on unmount — StrictMode remounts in dev, and
  // the SDK player / embed controller are reused across rooms.
  useEffect(() => () => engineRef.current?.stop(), []);

  const showEmbed = active && status.provider === 'embed';
  const noAudio = active && status.provider === 'none';

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${active ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto max-w-md px-3 pb-3">
        <div className="rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => engineRef.current.toggle(status.playing)}
              disabled={!active || noAudio || status.loading}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-spotify text-xl text-ink transition active:scale-90 disabled:opacity-40"
              aria-label={status.playing ? 'Pause' : 'Play'}
            >
              {status.loading ? '…' : status.playing ? '❚❚' : '▶'}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                <span className={`eq ${status.playing ? '' : 'paused'}`}><span /><span /><span /><span /></span>
                {status.loading ? 'Loading audio…' : status.label || 'Audio'}
              </div>
              <div className="truncate text-sm text-white/80">
                {noAudio
                  ? `No audio — read it out: “${pb.title}” · ${pb.artists?.join(', ')}`
                  : status.needsTap && status.provider === 'embed'
                    ? 'Tap ▶ in the Spotify player to start'
                    : status.needsTap
                      ? 'Tap play to start the music'
                      : hideMeta
                        ? 'Hard mode: title hidden'
                        : pb
                          ? `${pb.title} · ${pb.artists?.join(', ')}`
                          : ''}
              </div>
            </div>
          </div>
          {/* Embed iframe lives here permanently (React doesn't manage its children).
              In hard mode it's blurred during voting but stays tappable. */}
          <div
            ref={embedRef}
            className={`overflow-hidden rounded-xl transition-all duration-300 ${showEmbed ? 'mt-3 h-20' : 'h-0'} ${showEmbed && hideMeta ? 'blur-[6px] saturate-0' : ''}`}
          />
        </div>
      </div>
    </div>
  );
}
