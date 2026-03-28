import type { ByggkasinoState } from './types';
import type { GameHudProps } from '../registry';

const DEAL_WORDS = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
  'Eleventh',
  'Twelfth',
] as const;

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function dealLine(roundNumber: number, gameOver: boolean, deckEmpty: boolean): string {
  if (gameOver) return 'Last deal';
  if (deckEmpty) return 'Last deal';
  const word = roundNumber >= 1 && roundNumber <= DEAL_WORDS.length ? DEAL_WORDS[roundNumber - 1] : null;
  if (word) return `${word} deal`;
  return `${roundNumber}${ordinalSuffix(roundNumber)} deal`;
}

function possessiveName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Someone's";
  return `${trimmed}'s`;
}

export default function ByggkasinoTitleExtra({ state }: GameHudProps) {
  const s = state as ByggkasinoState;
  const dealer = s.players[s.dealerIndex];
  const dealerLabel = dealer ? possessiveName(dealer.name) : "Someone's";

  const matchLine =
    s.matchLength === 'eachDealerOnce'
      ? 'Each player deals once'
      : `Game to ${s.targetScore} points`;

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-xs sm:text-sm text-white/80">{matchLine}</p>
      <p className="text-xs sm:text-sm text-white/80">
        Round {s.roundNumber} ({dealerLabel} deal)
      </p>
      <p className="text-xs sm:text-sm text-white/80">
        {dealLine(s.dealNumberInRound ?? 1, s.gameOver, s.deck.length === 0)}
      </p>
      <p className="text-xs text-white/50">{s.deck.length} cards in deck</p>
    </div>
  );
}
