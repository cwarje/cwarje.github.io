import type { GameType, Player, PlayerColor } from '../networking/types';
import { ALL_GAME_TYPES, GAME_REGISTRY } from './registry';

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
    id: `player-${idx + 1}`,
    name: `Player ${idx + 1}`,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
    isBot: false,
    isHost: idx === 0,
    connected: true,
  }));
}

function getInitialPlayerCount(gameType: GameType): number {
  const def = GAME_REGISTRY[gameType];
  if (def.allowedPlayerCounts && def.allowedPlayerCounts.length > 0) {
    return Math.min(...def.allowedPlayerCounts);
  }
  return def.minPlayers;
}

describe('GAME_REGISTRY contract', () => {
  it('contains all required handlers for every registered game', () => {
    for (const gameType of ALL_GAME_TYPES) {
      const gameDef = GAME_REGISTRY[gameType];
      expect(gameDef.title.length).toBeGreaterThan(0);
      expect(gameDef.createState).toBeTypeOf('function');
      expect(gameDef.processAction).toBeTypeOf('function');
      expect(gameDef.isOver).toBeTypeOf('function');
      expect(gameDef.runBotTurn).toBeTypeOf('function');
      expect(gameDef.getWinners).toBeTypeOf('function');
      expect(gameDef.Board).toBeTruthy();
    }
  });

  it('supports create/check/winner flows for every game', () => {
    for (const gameType of ALL_GAME_TYPES) {
      const gameDef = GAME_REGISTRY[gameType];
      const players = createPlayers(getInitialPlayerCount(gameType));
      const initialState = gameDef.createState(players);

      expect(initialState).toBeTruthy();
      expect(typeof gameDef.isOver(initialState)).toBe('boolean');
      expect(Array.isArray(gameDef.getWinners(initialState))).toBe(true);
    }
  });

  it('does not throw on unknown action payloads', () => {
    for (const gameType of ALL_GAME_TYPES) {
      const gameDef = GAME_REGISTRY[gameType];
      const players = createPlayers(getInitialPlayerCount(gameType));
      const initialState = gameDef.createState(players);

      expect(() => {
        gameDef.processAction(initialState, { type: '__invalid_action__' }, players[0].id);
      }).not.toThrow();
    }
  });

  it('randomizes seat order only for radial seat-pill games', () => {
    const seatPillGames: GameType[] = [
      'hearts',
      'poker',
      'up-and-down-the-river',
      'twelve',
      'cross-crib',
      'cribbage',
      'mobilization',
      'casino',
      'cucumber',
      'golf',
      'tens',
    ];
    const nonSeatPillGames: GameType[] = ['yahtzee', 'farkle', 'settler', 'minigolf'];

    for (const gameType of seatPillGames) {
      expect(GAME_REGISTRY[gameType].randomizeSeatOrder).toBe(true);
    }
    for (const gameType of nonSeatPillGames) {
      expect(GAME_REGISTRY[gameType].randomizeSeatOrder).not.toBe(true);
    }
  });
});
