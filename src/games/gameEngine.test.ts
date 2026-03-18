import type { Player, PlayerColor } from '../networking/types';
import { ALL_GAME_TYPES, GAME_REGISTRY } from './registry';
import {
  checkGameOver,
  createInitialGameState,
  getGameWinners,
  processGameAction,
  runSingleBotTurn,
} from './gameEngine';

const PLAYER_COLORS: PlayerColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'indigo',
  'violet',
  'dark-purple',
];

function createPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `engine-player-${idx + 1}`,
    name: `Engine Player ${idx + 1}`,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
    isBot: false,
    isHost: idx === 0,
    connected: true,
  }));
}

function getPlayerCountForGame(gameType: (typeof ALL_GAME_TYPES)[number]): number {
  const gameDef = GAME_REGISTRY[gameType];
  if (gameDef.allowedPlayerCounts && gameDef.allowedPlayerCounts.length > 0) {
    return Math.min(...gameDef.allowedPlayerCounts);
  }
  return gameDef.minPlayers;
}

describe('gameEngine', () => {
  it('creates a game state and exposes common lifecycle helpers for every game type', () => {
    for (const gameType of ALL_GAME_TYPES) {
      const players = createPlayers(getPlayerCountForGame(gameType));
      const state = createInitialGameState(gameType, players);

      expect(state).toBeTruthy();
      expect(typeof checkGameOver(gameType, state)).toBe('boolean');
      expect(Array.isArray(getGameWinners(gameType, state))).toBe(true);
    }
  });

  it('processes unknown actions without crashing', () => {
    for (const gameType of ALL_GAME_TYPES) {
      const players = createPlayers(getPlayerCountForGame(gameType));
      const state = createInitialGameState(gameType, players);

      expect(() => {
        processGameAction(gameType, state, { type: '__invalid_action__' }, players[0].id);
      }).not.toThrow();
    }
  });

  it('can run a single bot turn safely for every game', () => {
    for (const gameType of ALL_GAME_TYPES) {
      const players = createPlayers(getPlayerCountForGame(gameType));
      const state = createInitialGameState(gameType, players);

      expect(() => {
        runSingleBotTurn(gameType, state);
      }).not.toThrow();
    }
  });
});
