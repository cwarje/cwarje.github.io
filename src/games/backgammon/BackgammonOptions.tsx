import { useEffect, useState } from 'react';
import type { BackgammonMatchFormat } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const FORMAT_OPTIONS: readonly { value: BackgammonMatchFormat; label: string }[] = [
  { value: 'single', label: 'Single game' },
  { value: 'best-of-3', label: 'Best of 3' },
];

export default function BackgammonOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [matchFormat, setMatchFormat] = useState<BackgammonMatchFormat>('single');

  useEffect(() => {
    onChange({ backgammonMatchFormat: matchFormat });
  }, [matchFormat, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Match format</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {FORMAT_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMatchFormat(value)}
            className={`flex-1 min-w-0 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              matchFormat === value
                ? 'bg-amber-700 text-white'
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
