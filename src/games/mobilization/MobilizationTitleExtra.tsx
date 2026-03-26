import type { GameHudProps } from '../registry';
import type { Card, MobilizationState } from './types';

const ROUND_TITLES = [
  '-2pts for each trick',
  '-2pts for each club',
  '-5pts for each Queen',
  '-5pts for King of Clubs, -5pts for last trick',
  'Solitaire',
  '+2pts for each trick',
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

  return (
    <div className="mobilization-titleExtra mt-1 space-y-0.5 text-sm font-semibold text-white">
      <p className="leading-tight">{title}</p>
      {s.removedCards.length > 0 ? (
        <p className="text-xs font-medium leading-tight">
          {`Removed: ${s.removedCards.map(formatCardShort).join(', ')}`}
        </p>
      ) : null}
    </div>
  );
}
