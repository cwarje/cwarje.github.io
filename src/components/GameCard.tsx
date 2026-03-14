import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import type { GameType } from '../networking/types';
import { GAME_REGISTRY } from '../games/registry';

interface GameCardProps {
  gameType: GameType;
  onSelect: (gameType: GameType) => void;
  onInfo?: (gameType: GameType) => void;
  disabled?: boolean;
  isExpanded?: boolean;
}

export default function GameCard({ gameType, onSelect, onInfo, disabled, isExpanded }: GameCardProps) {
  const gameDef = GAME_REGISTRY[gameType];
  const { theme } = gameDef;
  const Icon = gameDef.icon;

  return (
    <motion.div
      whileHover={disabled || isExpanded ? {} : { scale: 1.02, y: -4 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={() => !disabled && onSelect(gameType)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(gameType);
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-expanded={isExpanded}
      className={`relative w-full flex flex-col p-6 min-h-[140px] rounded-2xl bg-gradient-to-br ${theme.gradient} backdrop-blur-md border ${theme.cardBorder} ${isExpanded ? 'rounded-b-none border-b-0' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : `${theme.hoverBorder} cursor-pointer`} transition-colors duration-300 group`}
    >
      <span
        className={`absolute top-3 right-3 px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider ${theme.playersTag}`}
      >
        {gameDef.playersLabel}
      </span>
      <div className="flex-1 flex items-center justify-start">
        <div className="flex items-center gap-4">
          <div className="shrink-0 flex items-center justify-center">
            <Icon className={`w-14 h-14 ${theme.iconColor}`} />
          </div>
          <h3 className="text-xl font-bold text-white">{gameDef.title}</h3>
        </div>
      </div>
      {onInfo && (
        <button
          type="button"
          aria-label={`About ${gameDef.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onInfo(gameType);
          }}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/25 flex items-center justify-center transition-all cursor-pointer z-10"
        >
          <Info className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
        </button>
      )}
    </motion.div>
  );
}
