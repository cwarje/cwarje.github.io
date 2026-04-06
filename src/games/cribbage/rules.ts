import type { Card } from '../cross-crib/types';
import type { PeggingPlay } from './types';
import {
  cardValueFor15,
  rankForRun,
  scoreFifteens,
  scorePairs,
  scoreRunsWithDuplicates,
  scoreKnobs,
} from '../cross-crib/rules';

export { cardEquals } from '../cross-crib/rules';

/** Hand show: 4 hole cards + starter. Flush 4 in hand only = 4; all 5 same suit = 5. */
export function scoreHandFlush(hand4: Card[], starter: Card): number {
  if (hand4.length !== 4) return 0;
  const hs = hand4[0].suit;
  if (!hand4.every(c => c.suit === hs)) return 0;
  if (starter.suit === hs) return 5;
  return 4;
}

/** Crib: 4 crib cards + starter — 5 points only if all five share a suit. */
export function scoreCribFlush(crib4: Card[], starter: Card): number {
  const five = [...crib4, starter];
  if (five.length !== 5) return 0;
  const s = five[0].suit;
  return five.every(c => c.suit === s) ? 5 : 0;
}

export function scoreShowHand(hand4: Card[], starter: Card): number {
  const five = [...hand4, starter];
  const starterSuit = starter.suit;
  let total = scoreFifteens(five) + scorePairs(five) + scoreRunsWithDuplicates(five) + scoreKnobs(five, starterSuit);
  total += scoreHandFlush(hand4, starter);
  return total;
}

export function scoreCribShow(crib4: Card[], starter: Card): number {
  const five = [...crib4, starter];
  const starterSuit = starter.suit;
  let total = scoreFifteens(five) + scorePairs(five) + scoreRunsWithDuplicates(five) + scoreKnobs(five, starterSuit);
  total += scoreCribFlush(crib4, starter);
  return total;
}

function peggingPairPoints(sequence: PeggingPlay[]): number {
  const n = sequence.length;
  if (n < 2) return 0;
  const lastRank = sequence[n - 1].card.rank;
  let streak = 1;
  for (let i = n - 2; i >= 0; i--) {
    if (sequence[i].card.rank === lastRank) streak++;
    else break;
  }
  if (streak === 2) return 2;
  if (streak === 3) return 6;
  if (streak >= 4) return 12;
  return 0;
}

/** Longest strict monotonic run length ending at last card (≥3 to score). */
function peggingRunPoints(sequence: PeggingPlay[]): number {
  const n = sequence.length;
  if (n < 3) return 0;
  let best = 0;
  for (let len = Math.min(n, 7); len >= 3; len--) {
    const slice = sequence.slice(n - len);
    const ranks = slice.map(p => rankForRun(p.card.rank));
    let inc = true;
    let dec = true;
    for (let i = 1; i < ranks.length; i++) {
      const d = ranks[i] - ranks[i - 1];
      if (d !== 1) inc = false;
      if (d !== -1) dec = false;
    }
    if (!inc && !dec) continue;
    const sorted = [...ranks].sort((a, b) => a - b);
    let consec = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) {
        consec = false;
        break;
      }
    }
    if (consec) best = Math.max(best, len);
  }
  return best >= 3 ? best : 0;
}

/** Human-readable pegging score components; sums match `scorePeggingPlay`. */
export function peggingPlayScoreBreakdown(
  sequenceBefore: PeggingPlay[],
  played: PeggingPlay
): { points: number; hit31: boolean; summaryParts: string[] } {
  const seq = [...sequenceBefore, played];
  const total = seq.reduce((s, p) => s + cardValueFor15(p.card), 0);
  const summaryParts: string[] = [];
  let points = 0;
  if (total === 15) {
    summaryParts.push('15 for 2');
    points += 2;
  } else if (total === 31) {
    summaryParts.push('31 for 2');
    points += 2;
  }
  const pairPts = peggingPairPoints(seq);
  if (pairPts === 2) summaryParts.push('Pair for 2');
  else if (pairPts === 6) summaryParts.push('Three of a kind for 6');
  else if (pairPts === 12) summaryParts.push('Four of a kind for 12');
  points += pairPts;
  const runLen = peggingRunPoints(seq);
  if (runLen >= 3) {
    summaryParts.push(`Run of ${runLen} for ${runLen}`);
    points += runLen;
  }
  return { points, hit31: total === 31, summaryParts };
}

/** Points earned by playing `played` after `sequenceBefore` (exclusive of the new card). Returns { points, hit31 }. */
export function scorePeggingPlay(
  sequenceBefore: PeggingPlay[],
  played: PeggingPlay
): { points: number; hit31: boolean } {
  const b = peggingPlayScoreBreakdown(sequenceBefore, played);
  return { points: b.points, hit31: b.hit31 };
}

export function legalPeggingPlays(hand: Card[], _sequence: PeggingPlay[], runningTotal: number): Card[] {
  return hand.filter(c => runningTotal + cardValueFor15(c) <= 31);
}

export function playersStillHoldingCards(players: { hand: Card[] }[]): number {
  return players.filter(p => p.hand.length > 0).length;
}
