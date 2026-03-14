import { motion } from 'framer-motion';
import type { GameType } from '../networking/types';
import { Dice5, Heart, Ship, Crosshair, Club, Info, ArrowUpDown, Crown } from 'lucide-react';
import { GAME_GRADIENT, CARD_BORDER, BORDER_COLORS, PLAYERS_TAG, ICON_COLORS } from './gameCardThemes';

const GAME_INFO: Record<GameType, { title: string; players: string; icon: typeof Dice5 }> = {
  yahtzee: { title: 'Yahtzee', players: '1-4 Players', icon: Dice5 },
  hearts: { title: 'Hearts', players: '4 Players', icon: Heart },
  battleship: { title: 'Battleship', players: '2 Players', icon: Ship },
  'liars-dice': { title: "Liar's Dice", players: '2-4 Players', icon: Crosshair },
  poker: { title: 'Poker', players: '2-8 Players', icon: Club },
  'up-and-down-the-river': { title: 'Up and Down the River', players: '4-6 Players', icon: ArrowUpDown },
  twelve: { title: 'Twelve', players: '2-4 Players', icon: Crown },
};

interface GameCardProps {
  gameType: GameType;
  onSelect: (gameType: GameType) => void;
  onInfo?: (gameType: GameType) => void;
  disabled?: boolean;
  isExpanded?: boolean;
}

export default function GameCard({ gameType, onSelect, onInfo, disabled, isExpanded }: GameCardProps) {
  const info = GAME_INFO[gameType];
  const Icon = info.icon;

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
      className={`relative w-full flex flex-col p-6 min-h-[140px] rounded-2xl bg-gradient-to-br ${GAME_GRADIENT[gameType]} backdrop-blur-md border ${CARD_BORDER[gameType]} ${isExpanded ? 'rounded-b-none border-b-0' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : `${BORDER_COLORS[gameType]} cursor-pointer`} transition-colors duration-300 group`}
    >
      <span
        className={`absolute top-3 right-3 px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider ${PLAYERS_TAG[gameType]}`}
      >
        {info.players}
      </span>
      <div className="flex-1 flex items-center justify-start">
        <div className="flex items-center gap-4">
          <div className="shrink-0 flex items-center justify-center">
            <Icon className={`w-14 h-14 ${ICON_COLORS[gameType]}`} />
          </div>
          <h3 className="text-xl font-bold text-white">{info.title}</h3>
        </div>
      </div>
      {onInfo && (
        <button
          type="button"
          aria-label={`About ${info.title}`}
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
