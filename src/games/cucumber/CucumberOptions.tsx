import { useState, useEffect } from 'react';
import type { CucumberEliminationThreshold } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const THRESHOLD_OPTIONS: readonly CucumberEliminationThreshold[] = [30, 50];

export default function CucumberOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [threshold, setThreshold] = useState<CucumberEliminationThreshold>(30);

  useEffect(() => {
    onChange({ cucumberEliminationThreshold: threshold });
  }, [threshold, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Elimination at</p>
      <div className="flex gap-2">
        {THRESHOLD_OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setThreshold(value)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              threshold === value
                ? 'bg-green-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            {value} pts
          </button>
        ))}
      </div>
    </div>
  );
}
