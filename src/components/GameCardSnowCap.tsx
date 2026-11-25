import { useId } from 'react';

/** Decorative snow cap for homepage game cards when the holiday theme is on. */
export default function GameCardSnowCap() {
  const gradientId = useId();

  return (
    <div
      data-testid="game-card-snow-cap"
      className="game-card-snow-cap pointer-events-none absolute inset-x-0 z-[1]"
      aria-hidden
    >
      <svg
        className="block h-full w-full"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        role="presentation"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
        <path
          className="game-card-snow-cap__shape"
          fill={`url(#${gradientId})`}
          d="
            M 0,8
            Q 0,0 8,0
            L 92,0
            Q 100,0 100,8
            L 100,11
            C 94,17 87,9 81,13
            C 75,17 68,9 62,13
            C 56,17 49,9 43,13
            C 37,17 30,9 24,13
            C 18,17 11,9 5,13
            C 2,15 0,13 0,11
            Z
          "
        />
      </svg>
    </div>
  );
}