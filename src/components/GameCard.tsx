import { motion } from 'framer-motion';
import type { GameType } from '../networking/types';
import { Dice5, Heart, Ship, Crosshair, Club, Info, ArrowUpDown } from 'lucide-react';

const GAME_INFO: Record<GameType, { title: string; players: string; icon: typeof Dice5; gradient: string }> = {
  yahtzee: {
    title: 'Yahtzee',
    players: '1-4 Players',
    icon: Dice5,
    gradient: 'from-amber-500/20 to-orange-600/20',
  },
  hearts: {
    title: 'Hearts',
    players: '4 Players',
    icon: Heart,
    gradient: 'from-rose-500/20 to-pink-600/20',
  },
  battleship: {
    title: 'Battleship',
    players: '2 Players',
    icon: Ship,
    gradient: 'from-cyan-500/20 to-blue-600/20',
  },
  'liars-dice': {
    title: "Liar's Dice",
    players: '2-4 Players',
    icon: Crosshair,
    gradient: 'from-emerald-500/20 to-green-600/20',
  },
  poker: {
    title: 'Poker',
    players: '2-8 Players',
    icon: Club,
    gradient: 'from-violet-500/20 to-purple-600/20',
  },
  'up-and-down-the-river': {
    title: 'Up and Down the River',
    players: '4-6 Players',
    icon: ArrowUpDown,
    gradient: 'from-teal-500/20 to-sky-600/20',
  },
};

const ICON_COLORS: Record<GameType, string> = {
  yahtzee: 'text-amber-400',
  hearts: 'text-rose-400',
  battleship: 'text-cyan-400',
  'liars-dice': 'text-emerald-400',
  poker: 'text-violet-400',
  'up-and-down-the-river': 'text-teal-300',
};

const BORDER_COLORS: Record<GameType, string> = {
  yahtzee: 'hover:border-amber-500/30',
  hearts: 'hover:border-rose-500/30',
  battleship: 'hover:border-cyan-500/30',
  'liars-dice': 'hover:border-emerald-500/30',
  poker: 'hover:border-violet-500/30',
  'up-and-down-the-river': 'hover:border-teal-500/30',
};

const CARD_BORDER: Record<GameType, string> = {
  yahtzee: 'border-amber-500/20',
  hearts: 'border-rose-500/20',
  battleship: 'border-cyan-500/20',
  'liars-dice': 'border-emerald-500/20',
  poker: 'border-violet-500/20',
  'up-and-down-the-river': 'border-teal-500/20',
};

const PLAYERS_TAG: Record<GameType, string> = {
  yahtzee: 'bg-amber-500/25 text-amber-200 border border-amber-500/30',
  hearts: 'bg-rose-500/25 text-rose-200 border border-rose-500/30',
  battleship: 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/30',
  'liars-dice': 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/30',
  poker: 'bg-violet-500/25 text-violet-200 border border-violet-500/30',
  'up-and-down-the-river': 'bg-teal-500/25 text-teal-200 border border-teal-500/30',
};

interface GameCardProps {
  gameType: GameType;
  onSelect: (gameType: GameType) => void;
  onInfo?: (gameType: GameType) => void;
  disabled?: boolean;
}

export default function GameCard({ gameType, onSelect, onInfo, disabled }: GameCardProps) {
  const info = GAME_INFO[gameType];
  const Icon = info.icon;

  return (
    <motion.div
      whileHover={disabled ? {} : { scale: 1.02, y: -4 }}
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
      className={`relative w-full flex flex-col p-6 min-h-[140px] rounded-2xl bg-gradient-to-br ${info.gradient} backdrop-blur-md border ${CARD_BORDER[gameType]} ${disabled ? 'opacity-40 cursor-not-allowed' : `${BORDER_COLORS[gameType]} cursor-pointer`} transition-colors duration-300 group`}
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
