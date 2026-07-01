import { useState, useEffect } from 'react';
import type { CasinoMatchLength } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const SCORE_OPTIONS: readonly { value: CasinoMatchLength; score: number }[] = [
  { value: 'to11', score: 11 },
  { value: 'to21', score: 21 },
];

const SPECIAL_OPTION = { value: 'eachDealerOnce' as const, label: 'Each deal once' };

export default function CasinoOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [matchLength, setMatchLength] = useState<CasinoMatchLength>('to21');

  useEffect(() => {
    onChange({ casinoMatchLength: matchLength });
  }, [matchLength, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Game to</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {SCORE_OPTIONS.map(({ value, score }) => (
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
            {score}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMatchLength(SPECIAL_OPTION.value)}
          className={`flex-1 min-w-0 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
            matchLength === SPECIAL_OPTION.value
              ? 'bg-lime-600 text-white'
              : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
          }`}
        >
          {SPECIAL_OPTION.label}
        </button>
      </div>
    </div>
  );
}
