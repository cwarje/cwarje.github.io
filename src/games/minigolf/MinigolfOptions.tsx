import { useState, useEffect } from 'react';
import type { GameOptionsPanelProps } from '../registry';

export default function MinigolfOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    onChange({ minigolfBallCollisions: enabled });
  }, [enabled, onChange]);

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Ball collisions</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
            !enabled
              ? 'bg-white/30 text-white'
              : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
          }`}
        >
          Off
        </button>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
            enabled
              ? 'bg-white/30 text-white'
              : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
          }`}
        >
          On
        </button>
      </div>
    </div>
  );
}
