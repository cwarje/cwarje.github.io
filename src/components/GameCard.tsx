import { motion } from 'framer-motion';
import type { GameType } from '../networking/types';
import { Dice5, Heart, Ship, Crosshair, Club, Info, ArrowUpDown } from 'lucide-react';

const GAME_INFO: Record<GameType, { title: string; description: string; players: string; icon: typeof Dice5; gradient: string }> = {
  yahtzee: {
    title: 'Yahtzee',
    description: 'Roll dice, pick categories, and chase that perfect score. Classic dice game for 1-4 players.',
    players: '1-4 Players',
    icon: Dice5,
    gradient: 'from-amber-500/20 to-orange-600/20',
  },
  hearts: {
    title: 'Hearts',
    description: 'Avoid tricks with hearts and the dreaded Queen of Spades. Or shoot the moon!',
    players: '4 Players',
    icon: Heart,
    gradient: 'from-rose-500/20 to-pink-600/20',
  },
  battleship: {
    title: 'Battleship',
    description: 'Place your fleet and hunt down the enemy ships. Strategic naval combat for two.',
    players: '2 Players',
    icon: Ship,
    gradient: 'from-cyan-500/20 to-blue-600/20',
  },
  'liars-dice': {
    title: "Liar's Dice",
    description: "Bluff, bid, and call liars. Losers face the revolver. Last player standing wins. Inspired by Liar's Bar.",
    players: '2-4 Players',
    icon: Crosshair,
    gradient: 'from-emerald-500/20 to-green-600/20',
  },
  poker: {
    title: 'Poker',
    description: 'Texas Hold\'em with blinds, betting rounds, and side pots. Bluff your way to the chips!',
    players: '2-8 Players',
    icon: Club,
    gradient: 'from-violet-500/20 to-purple-600/20',
  },
  'up-and-down-the-river': {
    title: 'Up and Down the River',
    description: 'Bid exact tricks as rounds climb up and back down. Precision beats luck.',
    players: '4 Players',
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

interface GameCardProps {
  gameType: GameType;
  onSelect: (gameType: GameType) => void;
  onInfo?: (gameType: GameType) => void;
  disabled?: boolean;
  actionLabel?: string;
}

export default function GameCard({ gameType, onSelect, onInfo, disabled, actionLabel = 'Play' }: GameCardProps) {
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
      className={`relative w-full text-left p-6 rounded-2xl glass border border-white/5 ${disabled ? 'opacity-40 cursor-not-allowed' : `${BORDER_COLORS[gameType]} cursor-pointer`} transition-colors duration-300 group`}
    >
      {onInfo && (
        <button
          type="button"
          aria-label={`About ${info.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onInfo(gameType);
          }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/25 flex items-center justify-center transition-all cursor-pointer z-10"
        >
          <Info className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
        </button>
      )}
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${info.gradient} flex items-center justify-center mb-4`}>
        <Icon className={`w-7 h-7 ${ICON_COLORS[gameType]}`} />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{info.title}</h3>
      <p className="text-sm text-gray-400 mb-4 leading-relaxed">{info.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{info.players}</span>
        {!disabled && (
          <span className="text-xs font-medium text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
            {actionLabel} &rarr;
          </span>
        )}
      </div>
    </motion.div>
  );
}
