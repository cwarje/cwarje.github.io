import type { GameType, Player, GameStartOptions } from '../networking/types';
import type { SettlerState } from './settler/types';
import { assignSettlerTurnDeadline } from './settler/logic';
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
    return assignSettlerTurnDeadline(next as SettlerState, Date.now());
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
    next = assignSettlerTurnDeadline(next as SettlerState, Date.now());
  }
  return next;
}

export function getGameWinners(gameType: GameType, gameState: unknown): string[] {
  return GAME_REGISTRY[gameType].getWinners(gameState);
}
