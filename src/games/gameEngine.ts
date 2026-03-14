import type { GameType, Player, GameStartOptions } from '../networking/types';
import { GAME_REGISTRY } from './registry';

export function createInitialGameState(gameType: GameType, players: Player[], options?: GameStartOptions): unknown {
  return GAME_REGISTRY[gameType].createState(players, options);
}

export function processGameAction(gameType: GameType, state: unknown, action: unknown, playerId: string): unknown {
  return GAME_REGISTRY[gameType].processAction(state, action, playerId);
}

export function checkGameOver(gameType: GameType, state: unknown): boolean {
  return GAME_REGISTRY[gameType].isOver(state);
}

export function runSingleBotTurn(gameType: GameType, state: unknown): unknown {
  if (checkGameOver(gameType, state)) return state;
  return GAME_REGISTRY[gameType].runBotTurn(state);
}

export function getGameWinners(gameType: GameType, gameState: unknown): string[] {
  return GAME_REGISTRY[gameType].getWinners(gameState);
}
