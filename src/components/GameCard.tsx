import { motion } from 'framer-motion';
import type { GameType } from '../networking/types';
import { Dice5, Heart, Ship } from 'lucide-react';

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
};

const ICON_COLORS: Record<GameType, string> = {
  yahtzee: 'text-amber-400',
  hearts: 'text-rose-400',
  battleship: 'text-cyan-400',
};

const BORDER_COLORS: Record<GameType, string> = {
  yahtzee: 'hover:border-amber-500/30',
  hearts: 'hover:border-rose-500/30',
  battleship: 'hover:border-cyan-500/30',
};

interface GameCardProps {
  gameType: GameType;
  onSelect: (gameType: GameType) => void;
}

export default function GameCard({ gameType, onSelect }: GameCardProps) {
  const info = GAME_INFO[gameType];
  const Icon = info.icon;

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(gameType)}
      className={`w-full text-left p-6 rounded-2xl glass border border-white/5 ${BORDER_COLORS[gameType]} transition-colors duration-300 group cursor-pointer`}
    >
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${info.gradient} flex items-center justify-center mb-4`}>
        <Icon className={`w-7 h-7 ${ICON_COLORS[gameType]}`} />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{info.title}</h3>
      <p className="text-sm text-gray-400 mb-4 leading-relaxed">{info.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{info.players}</span>
        <span className="text-xs font-medium text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
          Play &rarr;
        </span>
      </div>
    </motion.button>
  );
}
