import type { Card, TableItem, Build, ByggkasinoPlayer, RoundScoreBreakdown } from './types';
import {
  cardValuesForSum,
  canParticipateInBuildOrSum,
  cardEquals,
  cardIsSingleMatchForTarget,
  playedCardMatchesBuildValue,
} from './types';

/**
 * Check whether a played card can legally capture the selected table items.
 *
 * A card captures by:
 * - Matching rank or value on single loose cards
 * - Matching the declared value of a build (any value in the card's sum set)
 * - Matching the sum of a group of loose cards (each card picks one legal value)
 */
export function isValidCapture(
  playedCard: Card,
  tableItems: TableItem[],
  selectedIndices: number[]
): boolean {
  if (selectedIndices.length === 0) return false;

  const selected = selectedIndices.map(i => tableItems[i]).filter(Boolean);
  if (selected.length !== selectedIndices.length) return false;

  const looseCards = selected.filter((it): it is { kind: 'card'; card: Card } => it.kind === 'card');
  const builds = selected.filter((it): it is { kind: 'build'; build: Build } => it.kind === 'build');

  const playedOptions = [...new Set(cardValuesForSum(playedCard))];

  for (const playedValue of playedOptions) {
    let buildsOk = true;
    for (const item of selected) {
      if (item.kind === 'build' && item.build.value !== playedValue) {
        buildsOk = false;
        break;
      }
    }
    if (!buildsOk) continue;

    if (looseCards.length === 0 && builds.length > 0) {
      if (builds.every(b => b.build.value === playedValue)) return true;
      continue;
    }

    if (looseCards.length > 0) {
      if (!validateLooseCardGroups(playedValue, looseCards.map(lc => lc.card))) continue;
    }

    return true;
  }

  return false;
}

function validateLooseCardGroups(targetValue: number, cards: Card[]): boolean {
  if (cards.length === 0) return true;

  const nonSingles = cards.filter(c => !cardIsSingleMatchForTarget(c, targetValue));

  if (nonSingles.length === 0) return true;

  if (!nonSingles.every(c => canParticipateInBuildOrSum(c))) return false;

  return canPartitionToSum(nonSingles, targetValue);
}

function canPartitionToSum(cards: Card[], target: number): boolean {
  if (cards.length === 0) return true;
  return partitionHelperMulti(cards, 0, target, 0);
}

function partitionHelperMulti(cards: Card[], index: number, target: number, currentSum: number): boolean {
  if (index === cards.length) {
    return currentSum === 0 || currentSum === target;
  }

  const opts = cardValuesForSum(cards[index]);
  for (const val of opts) {
    const newSum = currentSum + val;
    if (newSum === target) {
      if (partitionHelperMulti(cards, index + 1, target, 0)) return true;
    } else if (newSum < target) {
      if (partitionHelperMulti(cards, index + 1, target, newSum)) return true;
    }

    if (currentSum === 0) {
      if (partitionHelperMulti(cards, index + 1, target, 0)) return true;
    }
  }

  return false;
}

function canAssignSumToCards(cards: Card[], target: number): boolean {
  function dfs(i: number, remaining: number): boolean {
    if (i === cards.length) return remaining === 0;
    return cardValuesForSum(cards[i]).some(v => dfs(i + 1, remaining - v));
  }
  return dfs(0, target);
}

/** All sums achievable by picking one value per card (order-independent). */
export function achievableSumsForCards(cards: Card[]): number[] {
  const sums = new Set<number>();
  function dfs(i: number, acc: number) {
    if (i === cards.length) {
      sums.add(acc);
      return;
    }
    for (const v of cardValuesForSum(cards[i])) dfs(i + 1, acc + v);
  }
  dfs(0, 0);
  return [...sums].sort((a, b) => a - b);
}

export function isValidBuild(
  handCard: Card,
  selectedTableCardIndices: number[],
  allTableItems: TableItem[],
  declaredValue: number
): boolean {
  if (!canParticipateInBuildOrSum(handCard)) return false;
  if (declaredValue < 1) return false;
  if (selectedTableCardIndices.length === 0) return false;

  const tableCards: Card[] = [];
  for (const idx of selectedTableCardIndices) {
    const item = allTableItems[idx];
    if (!item || item.kind !== 'card') return false;
    if (!canParticipateInBuildOrSum(item.card)) return false;
    tableCards.push(item.card);
  }

  const allCards = [handCard, ...tableCards];
  return canAssignSumToCards(allCards, declaredValue);
}

export function isValidBuildExtension(
  handCard: Card,
  existingBuild: Build,
  newDeclaredValue: number
): boolean {
  if (!canParticipateInBuildOrSum(handCard)) return false;
  if (newDeclaredValue < 1) return false;
  if (newDeclaredValue <= existingBuild.value) return false;

  return cardValuesForSum(handCard).some(v => existingBuild.value + v === newDeclaredValue);
}

/**
 * Check if a player holds a card that can capture a build of the given value.
 */
export function playerCanCaptureBuildValue(hand: Card[], value: number, excludeCard?: Card): boolean {
  return hand.some(c => {
    if (excludeCard && cardEquals(c, excludeCard)) return false;
    return playedCardMatchesBuildValue(c, value);
  });
}

/**
 * Smallest declared value for a build from this hand card + table cards that is legal
 * and capturable with the rest of the hand; 0 if none.
 */
export function resolveBuildDeclaredValue(
  handCard: Card,
  tableCards: Card[],
  hand: Card[],
  excludeHandCard?: Card
): number {
  const sums = achievableSumsForCards([handCard, ...tableCards]);
  for (const d of sums) {
    if (d < 1) continue;
    if (!playerCanCaptureBuildValue(hand, d, excludeHandCard)) continue;
    return d;
  }
  return 0;
}

/**
 * Smallest new declared value for extending a build with handCard that is capturable; 0 if none.
 */
export function resolveExtendBuildDeclaredValue(
  handCard: Card,
  existingBuildValue: number,
  hand: Card[],
  excludeHandCard?: Card
): number {
  const candidates: number[] = [];
  for (const v of cardValuesForSum(handCard)) {
    const nv = existingBuildValue + v;
    if (nv > existingBuildValue) candidates.push(nv);
  }
  const sorted = [...new Set(candidates)].sort((a, b) => a - b);
  for (const d of sorted) {
    if (!playerCanCaptureBuildValue(hand, d, excludeHandCard)) continue;
    return d;
  }
  return 0;
}

export function scoreRound(players: ByggkasinoPlayer[]): Record<string, RoundScoreBreakdown> {
  const scores: Record<string, RoundScoreBreakdown> = {};

  for (const p of players) {
    scores[p.id] = {
      mostCards: 0,
      mostSpades: 0,
      bigCasino: 0,
      littleCasino: 0,
      aces: 0,
      sweeps: 0,
      total: 0,
    };
  }

  let maxCards = 0;
  let maxCardsIds: string[] = [];
  let maxSpades = 0;
  let maxSpadesIds: string[] = [];

  for (const p of players) {
    const cardCount = p.capturedCards.length;
    if (cardCount > maxCards) {
      maxCards = cardCount;
      maxCardsIds = [p.id];
    } else if (cardCount === maxCards) {
      maxCardsIds.push(p.id);
    }

    const spadeCount = p.capturedCards.filter(c => c.suit === 'spades').length;
    if (spadeCount > maxSpades) {
      maxSpades = spadeCount;
      maxSpadesIds = [p.id];
    } else if (spadeCount === maxSpades) {
      maxSpadesIds.push(p.id);
    }
  }

  if (maxCardsIds.length === 1) {
    scores[maxCardsIds[0]].mostCards = 3;
  }

  if (maxSpadesIds.length === 1) {
    scores[maxSpadesIds[0]].mostSpades = 1;
  }

  for (const p of players) {
    for (const c of p.capturedCards) {
      if (c.suit === 'diamonds' && c.rank === 10) {
        scores[p.id].bigCasino = 2;
      }
      if (c.suit === 'spades' && c.rank === 2) {
        scores[p.id].littleCasino = 1;
      }
      if (c.rank === 1) {
        scores[p.id].aces += 1;
      }
    }
    scores[p.id].sweeps = p.sweepCount;
  }

  for (const p of players) {
    const s = scores[p.id];
    s.total = s.mostCards + s.mostSpades + s.bigCasino + s.littleCasino + s.aces + s.sweeps;
  }

  return scores;
}

/**
 * Find all possible captures for a given card from the table.
 * Returns arrays of index sets — each set is one valid capture combination.
 */
export function findPossibleCaptures(playedCard: Card, tableItems: TableItem[]): number[][] {
  const results: number[][] = [];
  const playedOptions = [...new Set(cardValuesForSum(playedCard))];

  for (const playedVal of playedOptions) {
    if (!playedCardMatchesBuildValue(playedCard, playedVal)) continue;

    const buildIndices = tableItems
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.kind === 'build' && item.build.value === playedVal)
      .map(m => m.i);

    const looseIndices = tableItems
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.kind === 'card')
      .map(m => m.i);

    const exactMatchLoose = looseIndices.filter(i => {
      const item = tableItems[i];
      return item.kind === 'card' && cardIsSingleMatchForTarget(item.card, playedVal);
    });

    const sumCandidates = looseIndices.filter(i => {
      const item = tableItems[i];
      if (item.kind !== 'card') return false;
      return !cardIsSingleMatchForTarget(item.card, playedVal) && canParticipateInBuildOrSum(item.card);
    });

    const sumGroups = findSumGroups(sumCandidates, tableItems, playedVal);

    const captureGroups = [...exactMatchLoose.map(i => [i]), ...sumGroups];

    if (captureGroups.length === 0 && buildIndices.length === 0) continue;

    const allCombined = [...buildIndices];
    if (captureGroups.length > 0) {
      for (const group of captureGroups) {
        allCombined.push(...group);
      }
    }

    if (allCombined.length > 0) {
      const unique = [...new Set(allCombined)];
      results.push(unique);
    }
  }

  const seen = new Set<string>();
  return results.filter(r => {
    const key = [...r].sort((a, b) => a - b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findSumGroups(indices: number[], tableItems: TableItem[], target: number): number[][] {
  const results: number[][] = [];

  function backtrack(start: number, current: number[], sumSoFar: number) {
    if (current.length >= 2 && sumSoFar === target) {
      results.push([...current]);
    }
    if (sumSoFar >= target) return;

    for (let i = start; i < indices.length; i++) {
      const idx = indices[i];
      const item = tableItems[idx];
      if (item.kind !== 'card') continue;
      for (const v of cardValuesForSum(item.card)) {
        const newSum = sumSoFar + v;
        if (newSum > target) continue;
        current.push(idx);
        backtrack(i + 1, current, newSum);
        current.pop();
      }
    }
  }

  backtrack(0, [], 0);
  return results;
}
