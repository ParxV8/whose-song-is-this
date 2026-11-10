// Audio abstraction: tries providers in priority order and falls back
// gracefully. Order: Web Playback SDK (Premium, desktop) → preview_url →
// Spotify embed → title/artist only.
import { NeedsGesture, createEmbedProvider, createPreviewProvider, createSdkProvider } from './providers.js';

export function createAudioEngine({ sdkEnabled, getEmbedContainer, onStatus }) {
  const set = (patch) => onStatus?.(patch);
  const providers = [
    createSdkProvider({ enabled: sdkEnabled, onState: ({ playing }) => current?.name === 'sdk' && set({ playing }) }),
    createPreviewProvider({ onState: ({ playing }) => current?.name === 'preview' && set({ playing }) }),
    createEmbedProvider({ getContainer: getEmbedContainer, onState: ({ playing }) => current?.name === 'embed' && set({ playing }) }),
  ];
  let current = null;
  let generation = 0;

  async function load(pb) {
    const gen = ++generation;
    stop();
    set({ loading: true, playing: false, needsTap: false, provider: null, label: null });
    for (const p of providers) {
      if (gen !== generation) return;
      let ok = false;
      try {
        ok = await p.supports(pb);
      } catch {
        ok = false;
      }
      if (!ok || gen !== generation) continue;
      try {
        await p.play(pb);
        if (gen !== generation) return p.stop();
        current = p;
        set({ loading: false, playing: true, needsTap: false, provider: p.name, label: p.label });
        return;
      } catch (e) {
        if (gen !== generation) return;
        if (e instanceof NeedsGesture) {
          current = p;
          set({ loading: false, playing: false, needsTap: true, provider: p.name, label: p.label });
          return;
        }
        console.warn(`[audio] ${p.name} failed, trying next`, e);
      }
    }
    current = null;
    set({ loading: false, playing: false, needsTap: false, provider: 'none', label: 'No audio available' });
  }

  async function toggle(isPlaying) {
    if (!current) return;
    try {
      if (isPlaying) {
        await current.pause();
        set({ playing: false });
      } else {
        await current.resume();
        set({ playing: true, needsTap: false });
      }
    } catch (e) {
      console.warn('[audio] toggle failed', e);
    }
  }

  function stop() {
    for (const p of providers) {
      try {
        p.stop();
      } catch {
        /* ignore */
      }
    }
  }

  return {
    load,
    toggle,
    stop: () => {
      generation++;
      stop();
      current = null;
      set({ playing: false, needsTap: false, loading: false });
    },
    warmUp: () => providers[0].warmUp?.(),
    destroy: () => {
      generation++;
      for (const p of providers) p.destroy();
    },
  };
}
