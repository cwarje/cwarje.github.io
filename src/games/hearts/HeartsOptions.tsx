import { useState, useEffect } from 'react';
import type { HeartsTargetScore } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

export default function HeartsOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [target, setTarget] = useState<HeartsTargetScore>(100);

  useEffect(() => {
    onChange({ targetScore: target });
  }, [target, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Game to</p>
      <div className="flex gap-2">
        {([50, 100] as const).map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => setTarget(score)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              target === score
                ? 'bg-rose-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}
