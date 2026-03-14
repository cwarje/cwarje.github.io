import { useState, useEffect } from 'react';
import type { TwelvePileCount } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const PILE_OPTIONS: TwelvePileCount[] = [3, 4, 5, 6];
const DEFAULT_PILE_COUNT: TwelvePileCount = 4;

export default function TwelveOptions({ onChange, labelClass, playerCount, botCount }: GameOptionsPanelProps) {
  const [pileCount, setPileCount] = useState<TwelvePileCount>(DEFAULT_PILE_COUNT);

  const projectedPlayerCount = Math.min(4, playerCount + botCount);
  const isSupported = (count: TwelvePileCount) => projectedPlayerCount * count * 2 <= 36;
  const supported = PILE_OPTIONS.filter(isSupported);
  const effective = supported.includes(pileCount)
    ? pileCount
    : (supported[supported.length - 1] ?? DEFAULT_PILE_COUNT);

  useEffect(() => {
    onChange({ pileCount: effective });
  }, [effective, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Piles per player</p>
      <div className="flex gap-2">
        {PILE_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => setPileCount(count)}
            disabled={!isSupported(count)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              effective === count
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10 disabled:opacity-40 disabled:pointer-events-none'
            }`}
          >
            {count}
          </button>
        ))}
      </div>
    </div>
  );
}
