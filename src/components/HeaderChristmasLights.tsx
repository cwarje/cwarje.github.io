import { useEffect, useRef, useState } from 'react';

const BULB_COLORS = ['#ef4444', '#22c55e', '#fbbf24', '#3b82f6'] as const;
const BULB_COUNT = 32;
const FLICKER_MS = 520;
const DEAD_MIN_MS = 2500;
const DEAD_MAX_MS = 4500;
const BETWEEN_MIN_MS = 3500;
const BETWEEN_MAX_MS = 8500;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export type HeaderChristmasLightsPlacement = 'headerBottom' | 'viewportTop';

/** Light string when the holiday theme is on (header bottom or viewport top). */
export default function HeaderChristmasLights({
  placement = 'headerBottom',
}: {
  placement?: HeaderChristmasLightsPlacement;
}) {
  const [flickerIndex, setFlickerIndex] = useState<number | null>(null);
  const [deadIndex, setDeadIndex] = useState<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };

    const reduceMotion =
      typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      return clearTimers;
    }

    const scheduleBurnout = () => {
      const delay = randomBetween(BETWEEN_MIN_MS, BETWEEN_MAX_MS);
      const id = window.setTimeout(() => {
        const index = Math.floor(Math.random() * BULB_COUNT);
        setFlickerIndex(index);

        const flickerDoneId = window.setTimeout(() => {
          setFlickerIndex(null);
          setDeadIndex(index);

          const reviveId = window.setTimeout(() => {
            setDeadIndex(null);
            scheduleBurnout();
          }, randomBetween(DEAD_MIN_MS, DEAD_MAX_MS));
          timersRef.current.push(reviveId);
        }, FLICKER_MS);
        timersRef.current.push(flickerDoneId);
      }, delay);
      timersRef.current.push(id);
    };

    scheduleBurnout();
    return () => clearTimers();
  }, []);

  const anchorClass =
    placement === 'viewportTop' ? 'top-0' : 'bottom-0';
  const placementClass =
    placement === 'viewportTop' ? 'header-christmas-lights--viewport-top' : '';

  return (
    <div
      data-testid="header-christmas-lights"
      className={`header-christmas-lights pointer-events-none absolute inset-x-0 ${anchorClass} z-10 ${placementClass}`}
      aria-hidden
    >
      <div className="header-christmas-lights__wire" />
      {Array.from({ length: BULB_COUNT }, (_, index) => {
        let stateClass = '';
        if (flickerIndex === index) stateClass = 'christmas-lights__bulb--flicker';
        else if (deadIndex === index) stateClass = 'christmas-lights__bulb--out';

        return (
          <span
            key={index}
            className={`christmas-lights__bulb ${stateClass}`}
            style={{
              ['--light-color' as string]: BULB_COLORS[index % BULB_COLORS.length],
              ['--light-sag' as string]: `${Math.sin((index / (BULB_COUNT - 1)) * Math.PI) * 3}px`,
            }}
          />
        );
      })}
    </div>
  );
}