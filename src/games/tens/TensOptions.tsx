import { useEffect, useState } from 'react';
import type { TensScoreThreshold } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const THRESHOLD_OPTIONS: readonly TensScoreThreshold[] = [100, 150, 200];

export default function TensOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [threshold, setThreshold] = useState<TensScoreThreshold>(150);

  useEffect(() => {
    onChange({ tensScoreThreshold: threshold });
  }, [threshold, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Game to</p>
      <div className="flex gap-2">
        {THRESHOLD_OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setThreshold(value)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              threshold === value
                ? 'bg-rose-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
