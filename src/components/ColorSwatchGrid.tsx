import type { PlayerColor } from '../networking/types';
import { PLAYER_COLOR_HEX, PLAYER_COLOR_OPTIONS } from '../networking/playerColors';

interface ColorSwatchGridProps {
  value: PlayerColor;
  onChange: (color: PlayerColor) => void;
  selectedBorderClass?: string;
  unselectedBorderClass?: string;
  compact?: boolean;
}

export default function ColorSwatchGrid({
  value,
  onChange,
  selectedBorderClass = 'border-surface-900 scale-105',
  unselectedBorderClass = 'border-transparent hover:border-surface-400',
  compact = false,
}: ColorSwatchGridProps) {
  return (
    <div className={`grid grid-cols-8 ${compact ? 'gap-1' : 'gap-2'}`}>
      {PLAYER_COLOR_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full border-2 transition-all cursor-pointer touch-manipulation ${
            compact ? 'h-7 w-7' : 'h-7 w-7'
          } ${value === option.value ? selectedBorderClass : unselectedBorderClass}`}
          style={{ backgroundColor: PLAYER_COLOR_HEX[option.value] }}
          title={option.label}
          aria-label={`Set color to ${option.label}`}
        />
      ))}
    </div>
  );
}
