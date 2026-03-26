import type { GameHudProps } from '../registry';
import type { Card, MobilizationState } from './types';

const ROUND_TITLES = [
  'No Tricks',
  'Clubs',
  'Queens',
  'King Of Clubs and Last Trick',
  'Solitaire',
  'Positive Tricks',
] as const;

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function suitSymbol(suit: Card['suit']): string {
  if (suit === 'hearts') return '\u2665';
  if (suit === 'diamonds') return '\u2666';
  if (suit === 'clubs') return '\u2663';
  return '\u2660';
}

function formatCardShort(c: Card): string {
  return `${rankDisplay(c.rank)}${suitSymbol(c.suit)}`;
}

export default function MobilizationTitleExtra({ state }: GameHudProps) {
  const s = state as MobilizationState;
  if (s.gameOver) return null;
  const title = ROUND_TITLES[s.roundIndex] ?? 'Mobilization';
  const removedLine =
    s.removedCards.length === 0
      ? 'Removed: none'
      : `Removed: ${s.removedCards.map(formatCardShort).join(', ')}`;

  return (
    <div className="mobilization-titleExtra mt-1 space-y-0.5 text-sm font-semibold text-cyan-100/95">
      <p className="leading-tight">{title}</p>
      <p className="text-xs font-medium text-cyan-200/80 leading-tight">{removedLine}</p>
    </div>
  );
}
