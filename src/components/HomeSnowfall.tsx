import { useMemo, useSyncExternalStore, type CSSProperties } from 'react';

const FLAKE_COUNT = 50;

function getReducedMotionMediaQuery(): MediaQueryList | null {
  if (typeof window.matchMedia !== 'function') return null;
  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  const mq = getReducedMotionMediaQuery();
  if (!mq) return () => {};
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getReducedMotionSnapshot(): boolean {
  return getReducedMotionMediaQuery()?.matches ?? false;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

interface Snowflake {
  id: number;
  left: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: number;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSnowflakes(count: number): Snowflake[] {
  const rand = mulberry32(0x58a5_12e7);
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: rand() * 100,
    size: 2 + rand() * 4,
    opacity: 0.35 + rand() * 0.45,
    duration: 8 + rand() * 14,
    delay: -(rand() * 20),
    drift: -30 + rand() * 60,
  }));
}

export default function HomeSnowfall() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const flakes = useMemo(() => buildSnowflakes(FLAKE_COUNT), []);

  if (reducedMotion) {
    return null;
  }

  return (
    <div
      data-testid="home-snowfall"
      className="home-snowfall fixed inset-0 z-[1] pointer-events-none overflow-hidden"
      aria-hidden
    >
      {flakes.map((flake) => (
        <span
          key={flake.id}
          className="home-snowflake absolute rounded-full bg-white"
          style={
            {
              left: `${flake.left}%`,
              width: flake.size,
              height: flake.size,
              opacity: flake.opacity,
              animationDuration: `${flake.duration}s`,
              animationDelay: `${flake.delay}s`,
              '--snow-drift': `${flake.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}