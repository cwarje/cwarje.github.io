import { Bot } from 'lucide-react';
import type { PlayerColor } from '../networking/types';
import { DEFAULT_PLAYER_COLOR, normalizePlayerColor, PLAYER_COLOR_HEX } from '../networking/playerColors';

interface ColoredBotIconProps {
  color?: PlayerColor;
  muted?: boolean;
  className?: string;
  iconClassName?: string;
}

export default function ColoredBotIcon({
  color,
  muted = false,
  className = 'flex h-6 w-6 flex-shrink-0 items-center justify-center',
  iconClassName = 'h-3.5 w-3.5',
}: ColoredBotIconProps) {
  const iconColor = muted
    ? undefined
    : PLAYER_COLOR_HEX[normalizePlayerColor(color ?? DEFAULT_PLAYER_COLOR)] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];

  return (
    <span className={className} aria-hidden>
      <Bot
        className={`${iconClassName} ${muted ? 'text-surface-400' : ''}`}
        style={muted ? undefined : { color: iconColor }}
      />
    </span>
  );
}
