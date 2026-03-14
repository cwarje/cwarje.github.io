import type { GameType } from '../networking/types';

export const GAME_GRADIENT: Record<GameType, string> = {
  yahtzee: 'from-amber-500/20 to-orange-600/20',
  hearts: 'from-rose-500/20 to-pink-600/20',
  battleship: 'from-cyan-500/20 to-blue-600/20',
  'liars-dice': 'from-emerald-500/20 to-green-600/20',
  poker: 'from-violet-500/20 to-purple-600/20',
  'up-and-down-the-river': 'from-teal-500/20 to-sky-600/20',
  twelve: 'from-blue-500/20 to-indigo-600/20',
};

export const CARD_BORDER: Record<GameType, string> = {
  yahtzee: 'border-amber-500/20',
  hearts: 'border-rose-500/20',
  battleship: 'border-cyan-500/20',
  'liars-dice': 'border-emerald-500/20',
  poker: 'border-violet-500/20',
  'up-and-down-the-river': 'border-teal-500/20',
  twelve: 'border-blue-500/20',
};

export const BORDER_COLORS: Record<GameType, string> = {
  yahtzee: 'hover:border-amber-500/30',
  hearts: 'hover:border-rose-500/30',
  battleship: 'hover:border-cyan-500/30',
  'liars-dice': 'hover:border-emerald-500/30',
  poker: 'hover:border-violet-500/30',
  'up-and-down-the-river': 'hover:border-teal-500/30',
  twelve: 'hover:border-blue-500/30',
};

export const PLAYERS_TAG: Record<GameType, string> = {
  yahtzee: 'bg-amber-500/25 text-amber-200 border border-amber-500/30',
  hearts: 'bg-rose-500/25 text-rose-200 border border-rose-500/30',
  battleship: 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/30',
  'liars-dice': 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/30',
  poker: 'bg-violet-500/25 text-violet-200 border border-violet-500/30',
  'up-and-down-the-river': 'bg-teal-500/25 text-teal-200 border border-teal-500/30',
  twelve: 'bg-blue-500/25 text-blue-200 border border-blue-500/30',
};

export const ICON_COLORS: Record<GameType, string> = {
  yahtzee: 'text-amber-400',
  hearts: 'text-rose-400',
  battleship: 'text-cyan-400',
  'liars-dice': 'text-emerald-400',
  poker: 'text-violet-400',
  'up-and-down-the-river': 'text-teal-300',
  twelve: 'text-blue-300',
};

/** Primary button (e.g. Play) background and hover */
export const BUTTON_COLORS: Record<GameType, string> = {
  yahtzee: 'bg-amber-600 hover:bg-amber-500',
  hearts: 'bg-rose-600 hover:bg-rose-500',
  battleship: 'bg-cyan-600 hover:bg-cyan-500',
  'liars-dice': 'bg-emerald-600 hover:bg-emerald-500',
  poker: 'bg-violet-600 hover:bg-violet-500',
  'up-and-down-the-river': 'bg-teal-600 hover:bg-teal-500',
  twelve: 'bg-blue-600 hover:bg-blue-500',
};

/** Solid background for options panel (no glass) */
export const PANEL_BG: Record<GameType, string> = {
  yahtzee: 'bg-amber-950',
  hearts: 'bg-rose-950',
  battleship: 'bg-cyan-950',
  'liars-dice': 'bg-emerald-950',
  poker: 'bg-violet-950',
  'up-and-down-the-river': 'bg-teal-950',
  twelve: 'bg-blue-950',
};

/** Label / option group text color for options panel */
export const LABEL_COLORS: Record<GameType, string> = {
  yahtzee: 'text-amber-200',
  hearts: 'text-rose-200',
  battleship: 'text-cyan-200',
  'liars-dice': 'text-emerald-200',
  poker: 'text-violet-200',
  'up-and-down-the-river': 'text-teal-200',
  twelve: 'text-blue-200',
};
