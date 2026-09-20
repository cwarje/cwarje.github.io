import type { GameType, Player, GameStartOptions } from '../networking/types';
import type { SettlerState } from './settler/types';
import { assignSettlerTurnDeadline, reconcileSettlerTurnDeadlineAfterAction } from './settler/logic';
import { GAME_REGISTRY } from './registry';

export function createInitialGameState(gameType: GameType, players: Player[], options?: GameStartOptions): unknown {
  let created = GAME_REGISTRY[gameType].createState(players, options);
  if (gameType === 'settler') {
    created = assignSettlerTurnDeadline(created as SettlerState, Date.now());
  }
  return created;
}

export function processGameAction(gameType: GameType, state: unknown, action: unknown, playerId: string): unknown {
  const next = GAME_REGISTRY[gameType].processAction(state, action, playerId);
  if (gameType === 'settler' && next !== state) {
    return reconcileSettlerTurnDeadlineAfterAction(
      state as SettlerState,
      next as SettlerState,
      Date.now()
    );
  }
  return next;
}

export function checkGameOver(gameType: GameType, state: unknown): boolean {
  return GAME_REGISTRY[gameType].isOver(state);
}

export function runSingleBotTurn(gameType: GameType, state: unknown): unknown {
  if (checkGameOver(gameType, state)) return state;
  let next = GAME_REGISTRY[gameType].runBotTurn(state);
  if (gameType === 'settler' && next !== state) {
    next = reconcileSettlerTurnDeadlineAfterAction(
      state as SettlerState,
      next as SettlerState,
      Date.now()
    );
  }
  return next;
}

export function getGameWinners(gameType: GameType, gameState: unknown): string[] {
  return GAME_REGISTRY[gameType].getWinners(gameState);
}

function looksLikeMinigolfState(state: Record<string, unknown>): boolean {
  return Array.isArray(state.courses) && typeof state.holeIndex === 'number';
}

/** True when serialized game state belongs to the given room game type. */
export function gameStateMatchesRoom(gameType: GameType, state: unknown): boolean {
  if (state == null || typeof state !== 'object') return false;
  const record = state as Record<string, unknown>;

  if (gameType === 'minigolf') {
    return looksLikeMinigolfState(record);
  }
  if (looksLikeMinigolfState(record)) {
    return false;
  }
  return true;
}
