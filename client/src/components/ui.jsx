import { useEffect, useMemo, useState } from 'react';

export function Avatar({ player, size = 48, ring = false, className = '' }) {
  if (!player) return null;
  const dim = player.connected === false || player.left;
  return (
    <div
      className={`relative grid shrink-0 place-items-center rounded-full font-bold ${dim ? 'opacity-40 grayscale' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 25%, ${player.color}ee, ${player.color}88)`,
        boxShadow: ring ? `0 0 0 3px #0b0b12, 0 0 0 6px ${player.color}` : `0 6px 20px ${player.color}44`,
        fontSize: size * 0.5,
      }}
      title={player.name}
    >
      <span className="leading-none">{player.avatar}</span>
    </div>
  );
}

const VARIANTS = {
  primary: 'bg-spotify text-ink hover:bg-spotify-bright shadow-[0_10px_30px_-10px_#1db954]',
  secondary: 'bg-panel-2 text-white border border-line hover:border-white/30',
  ghost: 'bg-transparent text-white/70 hover:text-white',
  danger: 'bg-hot text-white',
};

export function Button({ variant = 'primary', size = 'lg', className = '', children, ...props }) {
  const sizes = { lg: 'h-16 px-6 text-lg', md: 'h-12 px-5 text-base', sm: 'h-10 px-4 text-sm' };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-display font-bold tracking-tight transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ className = '', children }) {
  return <section className={`rounded-3xl border border-line bg-panel/80 p-5 backdrop-blur ${className}`}>{children}</section>;
}

export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left disabled:opacity-50"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-white/50">{hint}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-spotify' : 'bg-line'}`}>
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </span>
    </button>
  );
}

export function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="grid gap-1 rounded-2xl bg-ink/60 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-11 rounded-xl font-display text-lg font-bold transition ${value === o.value ? 'bg-spotify text-ink' : 'text-white/60 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Timer({ endsAt, durationMs, now, size = 64 }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - now()));
  useEffect(() => {
    let raf;
    const tick = () => {
      setLeft(Math.max(0, endsAt - now()));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [endsAt, now]);
  const frac = Math.min(1, left / durationMs);
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const urgent = left < 5000;
  const color = urgent ? '#ff4d6d' : left < 10000 ? '#ffb703' : '#1db954';
  return (
    <div className={`relative ${urgent && left > 0 ? 'animate-wiggle' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2b2b3b" strokeWidth="6" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-xl font-extrabold" style={{ color }}>
        {Math.ceil(left / 1000)}
      </span>
    </div>
  );
}

export function Countdown({ endsAt, now, children }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, endsAt - now())), 250);
    return () => clearInterval(t);
  }, [endsAt, now]);
  return children(Math.ceil(left / 1000));
}

export function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.tone === 'error' ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;
  const tone = { error: 'bg-hot text-white', success: 'bg-spotify text-ink', info: 'bg-white text-ink' }[toast.tone] || 'bg-white text-ink';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <div key={toast.id} onClick={onDone} className={`pointer-events-auto max-w-md animate-pop rounded-2xl px-5 py-3 font-semibold shadow-2xl ${tone}`}>
        {toast.message}
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ['#1db954', '#ffb703', '#ff4d6d', '#3a86ff', '#b15eff', '#ffffff'];
export function Confetti({ count = 80 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 2 + Math.random() * 1.6,
        dx: (Math.random() - 0.5) * 200,
        rot: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 6,
      })),
    [count],
  );
  return (
    <div aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.i}
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            width: p.w,
            animationDelay: `${p.delay}s`,
            '--dur': `${p.dur}s`,
            '--dx': `${p.dx}px`,
            '--rot': `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}

export function Cover({ src, size = 56, className = '', rounded = 'rounded-xl' }) {
  return src ? (
    <img src={src} alt="" width={size} height={size} className={`shrink-0 object-cover ${rounded} ${className}`} style={{ width: size, height: size }} />
  ) : (
    <div className={`grid shrink-0 place-items-center bg-gradient-to-br from-grape to-hot ${rounded} ${className}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      ♪
    </div>
  );
}
