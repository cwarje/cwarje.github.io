import type { GameHudProps } from '../registry';
import type { Card, MobilizationState } from './types';

type RoundTitle = string | readonly string[];

const ROUND_TITLES: readonly RoundTitle[] = [
  '-2pts for each trick',
  '-2pts for each Club',
  '-5pts for each Queen',
  ['-5pts for King of Clubs', '-5pts for last trick'],
  'Solitaire',
  '+2pts for each trick',
];

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
  const raw = ROUND_TITLES[s.roundIndex] ?? 'Mobilization';
  const lines = typeof raw === 'string' ? [raw] : [...raw];

  return (
    <div className="mobilization-titleExtra mt-1 space-y-0.5 text-sm font-semibold text-white">
      {lines.map((line, i) => (
        <p key={i} className="leading-tight">
          {line}
        </p>
      ))}
      {s.removedCards.length > 0 ? (
        <p className="text-xs font-medium leading-tight">
          {`Removed: ${s.removedCards.map(formatCardShort).join(', ')}`}
        </p>
      ) : null}
    </div>
  );
}
