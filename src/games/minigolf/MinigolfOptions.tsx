import { useState, useEffect } from 'react';
import type { MinigolfThemeOption } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';
import { MINIGOLF_THEME_OPTIONS, getMinigolfThemeOptionLabel } from './themes';

export default function MinigolfOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [theme, setTheme] = useState<MinigolfThemeOption>('classic');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    onChange({ minigolfTheme: theme, minigolfBallCollisions: enabled });
  }, [theme, enabled, onChange]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Course theme</p>
        <div className="flex flex-wrap gap-2">
          {MINIGOLF_THEME_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`flex-1 min-w-[4.5rem] py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                theme === value
                  ? 'bg-white/30 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
              }`}
            >
              {getMinigolfThemeOptionLabel(value)}
            </button>
          ))}
        </div>
      </div>
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
    </div>
  );
}
