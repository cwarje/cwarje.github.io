import type { FarkleTargetScore, Player } from '../../networking/types';
import type { FarkleAction, FarklePlayer, FarkleState } from './types';

const DICE_COUNT = 6;
const DEFAULT_TARGET_SCORE = 10000;
const ENTRY_SCORE = 500;

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function countValues(dice: number[]): number[] {
  const counts = Array.from({ length: 7 }, () => 0);
  for (const die of dice) counts[die] += 1;
  return counts;
}

function isStraight(dice: number[]): boolean {
  if (dice.length !== 6) return false;
  const sorted = [...dice].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
}

function isThreePairs(dice: number[]): boolean {
  if (dice.length !== 6) return false;
  const counts = countValues(dice);
  return counts.filter((count) => count === 2).length === 3;
}

function isTwoTriplets(dice: number[]): boolean {
  if (dice.length !== 6) return false;
  const counts = countValues(dice);
  return counts.filter((count) => count === 3).length === 2;
}

function scoreForCount(face: number, count: number): number {
  if (count >= 6) return 3000;
  if (count === 5) return 2000;
  if (count === 4) return 1000;
  if (count === 3) return face === 1 ? 1000 : face * 100;
  if (count === 2) return face === 1 ? 200 : face === 5 ? 100 : 0;
  if (count === 1) return face === 1 ? 100 : face === 5 ? 50 : 0;
  return 0;
}

/**
 * Returns the best score using all dice in this subset.
 * Null means the subset cannot be scored legally.
 */
export function scoreKeptDice(dice: number[]): number | null {
  if (dice.length === 0) return null;

  if (isStraight(dice)) return 1500;
  if (isTwoTriplets(dice)) return 2500;
  if (isThreePairs(dice)) return 1500;

  const counts = countValues(dice);
  let total = 0;

  for (let face = 1; face <= 6; face += 1) {
    const count = counts[face];
    if (count === 0) continue;
    const score = scoreForCount(face, count);
    if (score === 0) return null;
    total += score;
  }

  return total;
}

function hasAnyScoringSubset(dice: number[]): boolean {
  if (dice.length === 0) return false;
  const subsetCount = 1 << dice.length;
  for (let mask = 1; mask < subsetCount; mask += 1) {
    const subset: number[] = [];
    for (let i = 0; i < dice.length; i += 1) {
      if ((mask & (1 << i)) !== 0) subset.push(dice[i]);
    }
    if (scoreKeptDice(subset) !== null) return true;
  }
  return false;
}

function canBank(player: FarklePlayer, turnScore: number): boolean {
  return player.totalScore > 0 || turnScore >= ENTRY_SCORE;
}

function rollUnkeptDice(state: FarkleState): number[] {
  return state.dice.map((die, index) => (state.kept[index] ? die : rollDie()));
}

function resetTurnState(state: FarkleState): FarkleState {
  return {
    ...state,
    dice: Array.from({ length: DICE_COUNT }, () => 1),
    kept: Array.from({ length: DICE_COUNT }, () => false),
    turnScore: 0,
    phase: 'roll',
  };
}

function advanceTurn(state: FarkleState, lastEvent: string): FarkleState {
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const reset = resetTurnState(state);
  return {
    ...reset,
    currentPlayerIndex: nextPlayerIndex,
    lastEvent,
  };
}

function getAvailableDiceAndIndices(state: FarkleState): { values: number[]; indices: number[] } {
  const values: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < DICE_COUNT; i += 1) {
    if (!state.kept[i]) {
      values.push(state.dice[i]);
      indices.push(i);
    }
  }
  return { values, indices };
}

function getBestScoringSelection(state: FarkleState): number[] {
  const { values, indices } = getAvailableDiceAndIndices(state);
  const subsetCount = 1 << values.length;
  let bestIndices: number[] = [];
  let bestScore = -1;

  for (let mask = 1; mask < subsetCount; mask += 1) {
    const subset: number[] = [];
    const selectedIndices: number[] = [];
    for (let i = 0; i < values.length; i += 1) {
      if ((mask & (1 << i)) !== 0) {
        subset.push(values[i]);
        selectedIndices.push(indices[i]);
      }
    }
    const score = scoreKeptDice(subset);
    if (score === null) continue;
    if (score > bestScore || (score === bestScore && selectedIndices.length > bestIndices.length)) {
      bestScore = score;
      bestIndices = selectedIndices;
    }
  }

  return bestIndices;
}

export function createFarkleState(
  players: Player[],
  options?: { targetScore?: FarkleTargetScore }
): FarkleState {
  return {
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      isBot: player.isBot,
      totalScore: 0,
    })),
    currentPlayerIndex: 0,
    targetScore: options?.targetScore ?? DEFAULT_TARGET_SCORE,
    dice: Array.from({ length: DICE_COUNT }, () => 1),
    kept: Array.from({ length: DICE_COUNT }, () => false),
    turnScore: 0,
    phase: 'roll',
    gameOver: false,
    lastEvent: null,
  };
}

export function processFarkleAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as FarkleState;
  const a = action as FarkleAction;

  if (s.gameOver) return state;
  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return state;

  switch (a.type) {
    case 'roll': {
      if (s.phase !== 'roll' && s.phase !== 'roll-or-bank') return state;

      const newDice = rollUnkeptDice(s);
      const rolledDice = newDice.filter((_, index) => !s.kept[index]);

      if (!hasAnyScoringSubset(rolledDice)) {
        return advanceTurn(s, `${currentPlayer.name} farkled.`);
      }

      return {
        ...s,
        dice: newDice,
        phase: 'choose',
        lastEvent: null,
      };
    }

    case 'keep': {
      if (s.phase !== 'choose') return state;
      const uniqueIndices = [...new Set(a.indices)];
      if (uniqueIndices.length === 0) return state;

      for (const index of uniqueIndices) {
        if (index < 0 || index >= DICE_COUNT) return state;
        if (s.kept[index]) return state;
      }

      const selectedDice = uniqueIndices.map((index) => s.dice[index]);
      const score = scoreKeptDice(selectedDice);
      if (score === null) return state;

      const kept = [...s.kept];
      for (const index of uniqueIndices) kept[index] = true;

      const allKept = kept.every(Boolean);
      return {
        ...s,
        kept: allKept ? Array.from({ length: DICE_COUNT }, () => false) : kept,
        turnScore: s.turnScore + score,
        phase: allKept ? 'roll' : 'roll-or-bank',
        lastEvent: allKept ? `${currentPlayer.name} has hot dice!` : null,
      };
    }

    case 'bank': {
      if (s.phase !== 'roll-or-bank') return state;
      if (!canBank(currentPlayer, s.turnScore)) return state;

      const updatedPlayers = [...s.players];
      const updatedPlayer = {
        ...currentPlayer,
        totalScore: currentPlayer.totalScore + s.turnScore,
      };
      updatedPlayers[s.currentPlayerIndex] = updatedPlayer;

      const won = updatedPlayer.totalScore >= s.targetScore;
      const updatedState: FarkleState = {
        ...s,
        players: updatedPlayers,
        gameOver: won,
      };

      if (won) {
        return {
          ...resetTurnState(updatedState),
          currentPlayerIndex: s.currentPlayerIndex,
          gameOver: true,
          lastEvent: `${updatedPlayer.name} reached ${s.targetScore} and wins!`,
        };
      }

      return advanceTurn(updatedState, `${updatedPlayer.name} banked ${s.turnScore} points.`);
    }

    default:
      return state;
  }
}

export function isFarkleOver(state: unknown): boolean {
  return (state as FarkleState).gameOver;
}

export function getFarkleWinners(state: unknown): string[] {
  const s = state as FarkleState;
  if (!s.players.length) return [];
  const maxScore = Math.max(...s.players.map((player) => player.totalScore));
  return s.players.filter((player) => player.totalScore === maxScore).map((player) => player.id);
}

function shouldBotBank(state: FarkleState): boolean {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return false;
  if (!canBank(player, state.turnScore)) return false;
  if (player.totalScore + state.turnScore >= state.targetScore) return true;

  const remainingDice = state.kept.filter((isKept) => !isKept).length;
  if (state.turnScore >= 1000) return true;
  if (state.turnScore >= 750 && remainingDice <= 3) return true;
  return false;
}

export function runFarkleBotTurn(state: unknown): unknown {
  const s = state as FarkleState;
  if (s.gameOver) return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer || !currentPlayer.isBot) return state;

  if (s.phase === 'choose') {
    const keepIndices = getBestScoringSelection(s);
    if (keepIndices.length === 0) return processFarkleAction(s, { type: 'roll' }, currentPlayer.id);
    return processFarkleAction(s, { type: 'keep', indices: keepIndices }, currentPlayer.id);
  }

  if (s.phase === 'roll-or-bank' && shouldBotBank(s)) {
    return processFarkleAction(s, { type: 'bank' }, currentPlayer.id);
  }

  return processFarkleAction(s, { type: 'roll' }, currentPlayer.id);
}
