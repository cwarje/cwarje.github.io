import { useState, useEffect } from 'react';
import type { CasinoMatchLength } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const MATCH_OPTIONS: readonly { value: CasinoMatchLength; label: string }[] = [
  { value: 'to11', label: 'Game to 11' },
  { value: 'to21', label: 'Game to 21' },
  { value: 'eachDealerOnce', label: 'Each player deals once' },
];

export default function CasinoOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [matchLength, setMatchLength] = useState<CasinoMatchLength>('to21');

  useEffect(() => {
    onChange({ casinoMatchLength: matchLength });
  }, [matchLength, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Type</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {MATCH_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMatchLength(value)}
            className={`flex-1 min-w-0 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              matchLength === value
                ? 'bg-lime-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
