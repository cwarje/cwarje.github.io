import type { Card, Suit } from './types';

/** Card value for 15s: 2-10 = face, J/Q/K = 10, A = 1 */
export function cardValueFor15(card: Card): number {
  if (card.rank >= 2 && card.rank <= 10) return card.rank;
  if (card.rank >= 11 && card.rank <= 13) return 10; // J, Q, K
  return 1; // A
}

/** Rank for run comparison: A=1, 2-10, J=11, Q=12, K=13 */
export function rankForRun(rank: number): number {
  return rank === 14 ? 1 : rank;
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** Score fifteens: each subset summing to 15 = 2 points */
export function scoreFifteens(cards: Card[]): number {
  let total = 0;
  const n = cards.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) sum += cardValueFor15(cards[i]);
    }
    if (sum === 15) total += 2;
  }
  return total;
}

/** Score pairs: 2 of a kind = 2, 3 = 6, 4 = 12 */
export function scorePairs(cards: Card[]): number {
  const rankCounts: Record<number, number> = {};
  for (const c of cards) {
    rankCounts[c.rank] = (rankCounts[c.rank] ?? 0) + 1;
  }
  let total = 0;
  for (const count of Object.values(rankCounts)) {
    if (count >= 2) total += count * (count - 1); // pairs: 2->2, 3->6, 4->12
  }
  return total;
}

/** Find all maximal runs (consecutive ranks). Each run scores 1 pt per card. */
export function scoreRuns(cards: Card[]): number {
  const ranks = [...new Set(cards.map(c => rankForRun(c.rank)))].sort((a, b) => a - b);
  if (ranks.length < 3) return 0;

  const runLengths: number[] = [];
  let runLen = 1;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] + 1) {
      runLen++;
    } else {
      if (runLen >= 3) runLengths.push(runLen);
      runLen = 1;
    }
  }
  if (runLen >= 3) runLengths.push(runLen);

  if (runLengths.length === 0) return 0;

  const maxRun = Math.max(...runLengths);
  const mult = runLengths.filter(l => l === maxRun).length;
  return maxRun * mult;
}

/** For runs with duplicates: e.g. 3-3-4-5 has two 3-card runs. */
export function scoreRunsWithDuplicates(cards: Card[]): number {
  const rankCounts: Record<number, number> = {};
  for (const c of cards) {
    const runRank = rankForRun(c.rank);
    rankCounts[runRank] = (rankCounts[runRank] ?? 0) + 1;
  }
  const ranks = [...new Set(cards.map(c => rankForRun(c.rank)))].sort((a, b) => a - b);
  if (ranks.length < 3) return 0;

  const runLengths: { len: number; mult: number }[] = [];
  let runLen = 1;
  let runMult = (rankCounts[ranks[0]] ?? 1);
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] + 1) {
      runLen++;
      runMult *= (rankCounts[ranks[i]] ?? 1);
    } else {
      if (runLen >= 3) runLengths.push({ len: runLen, mult: runMult });
      runLen = 1;
      runMult = (rankCounts[ranks[i]] ?? 1);
    }
  }
  if (runLen >= 3) runLengths.push({ len: runLen, mult: runMult });

  let total = 0;
  for (const { len, mult } of runLengths) {
    total += len * mult;
  }
  return total;
}

/** Flush: all 5 cards same suit = 5 points */
export function scoreFlush(cards: Card[]): number {
  if (cards.length !== 5) return 0;
  const suit = cards[0].suit;
  if (cards.every(c => c.suit === suit)) return 5;
  return 0;
}

/** Knobs: Jack with same suit as starter = 1 point */
export function scoreKnobs(cards: Card[], starterSuit: Suit): number {
  return cards.some(c => c.rank === 11 && c.suit === starterSuit) ? 1 : 0;
}

/** Score a 5-card cribbage hand (row or column) with the given starter. */
export function scoreCribbageHand(cards: Card[], starterSuit: Suit): number {
  let total = 0;
  total += scoreFifteens(cards);
  total += scorePairs(cards);
  total += scoreRunsWithDuplicates(cards);
  total += scoreFlush(cards);
  total += scoreKnobs(cards, starterSuit);
  return total;
}
