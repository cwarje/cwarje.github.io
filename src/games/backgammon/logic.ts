import type { GameStartOptions, Player } from '../../networking/types';
import {
  applyMove,
  checkWin,
  cloneState,
  createStartingPoints,
  diceToMovesRemaining,
  getAllLegalTurnSequences,
  getLegalMovesForRemainingDice,
  hasAnyLegalMove,
  isValidMove,
} from './rules';
import type {
  BackgammonAction,
  BackgammonPlayer,
  BackgammonState,
  LegalMove,
  Side,
} from './types';
import { CHECKERS_PER_PLAYER, currentSide, sideForPlayerIndex } from './types';

function rollDice(): [number, number] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return [d1, d2];
}

function toBackgammonPlayer(player: Player, side: Side): BackgammonPlayer {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    side,
  };
}

export function createBackgammonState(players: Player[], _options?: GameStartOptions): BackgammonState {
  if (players.length !== 2) {
    throw new Error('Backgammon requires exactly 2 players');
  }

  return {
    players: [toBackgammonPlayer(players[0]!, 'white'), toBackgammonPlayer(players[1]!, 'black')],
    currentPlayerIndex: 0,
    phase: 'pre-roll',
    points: createStartingPoints(),
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    dice: null,
    movesRemaining: [],
    winnerIds: null,
  };
}

function switchToNextPlayer(state: BackgammonState): BackgammonState {
  return {
    ...state,
    currentPlayerIndex: state.currentPlayerIndex === 0 ? 1 : 0,
    phase: 'pre-roll',
    dice: null,
    movesRemaining: [],
  };
}

function finishIfWon(state: BackgammonState, side: Side): BackgammonState {
  if (!checkWin(state, side)) return state;
  const winnerIndex = side === 'white' ? 0 : 1;
  const winner = state.players[winnerIndex] ?? state.players[state.currentPlayerIndex];
  return {
    ...state,
    phase: 'finished',
    winnerIds: [winner.id],
  };
}

function endTurnOrContinue(state: BackgammonState): BackgammonState {
  if (state.movesRemaining.length === 0 || !hasAnyLegalMove(state)) {
    const side = currentSide(state);
    const afterWin = finishIfWon(state, side);
    if (afterWin.phase === 'finished') return afterWin;
    return switchToNextPlayer(state);
  }
  return state;
}

function handleRoll(state: BackgammonState): BackgammonState {
  const dice = rollDice();
  const movesRemaining = diceToMovesRemaining(dice[0], dice[1]);
  let next: BackgammonState = {
    ...cloneState(state),
    dice,
    movesRemaining,
    phase: 'moving',
    lastMove: undefined,
  };

  if (!hasAnyLegalMove(next)) {
    return switchToNextPlayer(next);
  }

  return next;
}

function scoreMove(state: BackgammonState, move: LegalMove): number {
  let score = 0;
  if (move.hit) score += 100;
  if (move.to === 'off') score += 50;
  if (typeof move.to === 'number') {
    const side = currentSide(state);
    const selfCount =
      side === 'white'
        ? Math.max(0, state.points[move.to] ?? 0)
        : Math.max(0, -(state.points[move.to] ?? 0));
    if (selfCount === 1) score += 30;
    if (side === 'white' && move.to <= 5) score += 10;
    if (side === 'black' && move.to >= 18) score += 10;
    score += side === 'white' ? 24 - move.to : move.to;
  }
  return score;
}

function pickBestMove(state: BackgammonState): LegalMove | null {
  const sequences = getAllLegalTurnSequences(state);
  if (sequences.length === 0 || sequences[0]!.length === 0) return null;

  let best: LegalMove | null = null;
  let bestScore = -Infinity;
  for (const seq of sequences) {
    const move = seq[0];
    if (!move) continue;
    const s = scoreMove(state, move);
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  return best;
}

export function getLegalMovesForUi(state: BackgammonState, playerId: string): LegalMove[] {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx < 0 || idx !== state.currentPlayerIndex || state.phase !== 'moving') return [];
  return getLegalMovesForRemainingDice(state);
}

export function processBackgammonAction(
  state: BackgammonState,
  action: BackgammonAction,
  playerId: string
): BackgammonState {
  if (state.phase === 'finished') return state;

  const current = state.players[state.currentPlayerIndex];
  if (!current) return state;

  switch (action.type) {
    case 'roll': {
      if (state.phase !== 'pre-roll') return state;
      if (playerId !== current.id) return state;
      return handleRoll(state);
    }
    case 'move': {
      if (state.phase !== 'moving') return state;
      if (playerId !== current.id) return state;
      const legal = isValidMove(state, action.from, action.to);
      if (!legal) return state;
      let next = applyMove(state, action.from, action.to, legal.dieUsed);
      const side = currentSide(state);
      next = finishIfWon(next, side);
      if (next.phase === 'finished') return next;
      return endTurnOrContinue(next);
    }
    case 'end-turn': {
      if (state.phase !== 'moving') return state;
      if (playerId !== current.id) return state;
      if (hasAnyLegalMove(state)) return state;
      return switchToNextPlayer(state);
    }
    default:
      return state;
  }
}

export function isBackgammonOver(state: BackgammonState): boolean {
  return state.phase === 'finished';
}

export function runBackgammonBotTurn(state: BackgammonState): BackgammonState {
  if (state.phase === 'finished') return state;

  const current = state.players[state.currentPlayerIndex];
  if (!current?.isBot) return state;

  if (state.phase === 'pre-roll') {
    return processBackgammonAction(state, { type: 'roll' }, current.id);
  }

  if (state.phase === 'moving') {
    if (!hasAnyLegalMove(state)) {
      return processBackgammonAction(state, { type: 'end-turn' }, current.id);
    }
    const move = pickBestMove(state);
    if (!move) {
      return processBackgammonAction(state, { type: 'end-turn' }, current.id);
    }
    return processBackgammonAction(
      state,
      { type: 'move', from: move.from, to: move.to },
      current.id
    );
  }

  return state;
}

export function getBackgammonWinners(state: BackgammonState): string[] {
  return state.winnerIds ?? [];
}

// Engine-facing wrappers
export function processBackgammonActionUnknown(
  state: unknown,
  action: unknown,
  playerId: string
): unknown {
  return processBackgammonAction(state as BackgammonState, action as BackgammonAction, playerId);
}

export function isBackgammonOverUnknown(state: unknown): boolean {
  return isBackgammonOver(state as BackgammonState);
}

export function runBackgammonBotTurnUnknown(state: unknown): unknown {
  return runBackgammonBotTurn(state as BackgammonState);
}

export function getBackgammonWinnersUnknown(state: unknown): string[] {
  return getBackgammonWinners(state as BackgammonState);
}

export { sideForPlayerIndex, CHECKERS_PER_PLAYER };
