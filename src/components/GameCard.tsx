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
      {gameDef.showNewBadge && (
        <span className="absolute top-3 left-3 inline-grid grid-cols-1 grid-rows-1 place-items-center px-2 py-0.5 rounded-md bg-amber-400/95 shadow-sm">
          {/* Invisible layer locks badge height to the same box as solid `text-amber-950` copy */}
          <span
            className="col-start-1 row-start-1 invisible whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-amber-950"
            aria-hidden
          >
            New
          </span>
          <span className="col-start-1 row-start-1 new-badge-text-sheen text-[10px] font-bold uppercase tracking-wider">
            New
          </span>
        </span>
      )}
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
