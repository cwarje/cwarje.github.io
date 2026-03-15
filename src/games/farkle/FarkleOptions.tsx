import { useState, useEffect } from 'react';
import type { FarkleTargetScore } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const TARGET_OPTIONS: readonly FarkleTargetScore[] = [3000, 5000, 10000];

export default function FarkleOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [target, setTarget] = useState<FarkleTargetScore>(10000);

  useEffect(() => {
    onChange({ farkleTargetScore: target });
  }, [target, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Game to</p>
      <div className="flex gap-2">
        {TARGET_OPTIONS.map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => setTarget(score)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              target === score
                ? 'bg-violet-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            {score.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}
