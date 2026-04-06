import { useState, useEffect } from 'react';
import type { CribbageTargetScore } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

const TARGET_OPTIONS: readonly { value: CribbageTargetScore; label: string }[] = [
  { value: 121, label: 'Game to 121' },
  { value: 61, label: 'Game to 61' },
];

export default function CribbageOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [target, setTarget] = useState<CribbageTargetScore>(121);

  useEffect(() => {
    onChange({ cribbageTargetScore: target });
  }, [target, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Match length</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {TARGET_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTarget(value)}
            className={`flex-1 min-w-0 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              target === value
                ? 'bg-cyan-600 text-white'
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
