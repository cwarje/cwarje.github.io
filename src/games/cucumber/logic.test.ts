import { describe, expect, it } from 'vitest';
import {
  cardEquals,
  getTrickWinnerPlayerId,
  isValidCucumberPlay,
  listLegalPlays,
  rankValue,
} from './rules';
import {
  createCucumberState,
  processCucumberAction,
  isCucumberOver,
  getCucumberWinners,
  chooseCucumberPlayCard,
} from './logic';
import type { Card, CucumberPlayer, CucumberState } from './types';
import { ELIMINATION_THRESHOLD } from './types';
import type { Player } from '../../networking/types';

function card(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank };
}

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    color: 'blue' as const,
    isBot: false,
    isHost: i === 0,
    connected: true,
  }));
}

function playerState(id: string, hand: Card[], penaltyScore = 0): CucumberPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: false,
    hand,
    penaltyScore,
  };
}

function botPlayState(
  botId: string,
  hand: Card[],
  options: {
    trickNumber: number;
    currentTrick?: { playerId: string; card: Card }[];
    handPlayerIds?: string[];
    currentPlayerIndex?: number;
    opponents?: { id: string; hand: Card[] }[];
    penaltyScore?: number;
  },
): CucumberState {
  const opponents = options.opponents ?? [];
  const players = [
    playerState(botId, hand, options.penaltyScore ?? 0),
    ...opponents.map(o => playerState(o.id, o.hand)),
  ];
  const handPlayerIds = options.handPlayerIds ?? [botId, ...opponents.map(o => o.id)];
  const currentPlayerIndex = options.currentPlayerIndex ?? handPlayerIds.indexOf(botId);

  return {
    players,
    phase: 'playing',
    handNumber: 1,
    dealerIndex: 0,
    handPlayerIds,
    currentPlayerIndex,
    currentTrick: options.currentTrick ?? [],
    trickNumber: options.trickNumber,
    trickWinner: null,
    lastHandPenalty: null,
    gameOver: false,
    winners: [],
    eliminationThreshold: 30,
  };
}

describe('cucumber rules', () => {
  it('lists any card when leading', () => {
    const hand = [card('hearts', 5), card('clubs', 14)];
    expect(listLegalPlays(hand, [])).toHaveLength(2);
  });

  it('allows beating highest or always playing lowest', () => {
    const hand = [card('hearts', 10), card('clubs', 9), card('spades', 7)];
    const trick = [{ playerId: 'a', card: card('diamonds', 8) }];
    const legal = listLegalPlays(hand, trick);
    expect(legal).toHaveLength(3);
    expect(legal.some(c => c.rank === 7)).toBe(true);
    expect(legal.some(c => c.rank === 9)).toBe(true);
    expect(legal.some(c => c.rank === 10)).toBe(true);
  });

  it('forces lowest card when unable to beat', () => {
    const hand = [card('hearts', 3), card('clubs', 4), card('spades', 7)];
    const trick = [{ playerId: 'a', card: card('diamonds', 10) }];
    const legal = listLegalPlays(hand, trick);
    expect(legal).toHaveLength(1);
    expect(legal[0].rank).toBe(3);
  });

  it('forces lowest card when ace is in the trick', () => {
    const hand = [card('hearts', 3), card('clubs', 14), card('spades', 7)];
    const trick = [{ playerId: 'a', card: card('diamonds', 14) }];
    const legal = listLegalPlays(hand, trick);
    expect(legal).toHaveLength(1);
    expect(legal[0].rank).toBe(3);
  });

  it('forces lowest card when ace is played mid-trick', () => {
    const hand = [card('hearts', 3), card('clubs', 14), card('spades', 7)];
    const trick = [
      { playerId: 'a', card: card('diamonds', 8) },
      { playerId: 'b', card: card('hearts', 14) },
    ];
    const legal = listLegalPlays(hand, trick);
    expect(legal).toHaveLength(1);
    expect(legal[0].rank).toBe(3);
  });

  it('picks rank-only trick winner with last-played tie-break', () => {
    const trick = [
      { playerId: 'a', card: card('hearts', 10) },
      { playerId: 'b', card: card('clubs', 10) },
    ];
    expect(getTrickWinnerPlayerId(trick)).toBe('b');
  });

  it('scores penalty points equal to card rank', () => {
    expect(rankValue(14)).toBe(14);
    expect(rankValue(13)).toBe(13);
    expect(rankValue(12)).toBe(12);
    expect(rankValue(11)).toBe(11);
    expect(rankValue(9)).toBe(9);
    expect(rankValue(8)).toBe(8);
  });
});

describe('cucumber logic', () => {
  it('creates a valid initial state with 7 cards each', () => {
    const state = createCucumberState(makePlayers(4)) as CucumberState;
    expect(state.phase).toBe('playing');
    expect(state.handPlayerIds).toHaveLength(4);
    expect(state.players.every(p => p.hand.length === 7)).toBe(true);
    expect(state.trickNumber).toBe(1);
    expect(state.eliminationThreshold).toBe(ELIMINATION_THRESHOLD);
  });

  it('sorts dealt hands by rank first, then suit', () => {
    const suitOrder: Record<Card['suit'], number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
    const state = createCucumberState(makePlayers(4)) as CucumberState;

    for (const player of state.players) {
      for (let i = 1; i < player.hand.length; i++) {
        const prev = player.hand[i - 1];
        const curr = player.hand[i];
        if (prev.rank !== curr.rank) {
          expect(prev.rank).toBeLessThan(curr.rank);
        } else {
          expect(suitOrder[prev.suit]).toBeLessThan(suitOrder[curr.suit]);
        }
      }
    }
  });

  it('uses 50-point loss threshold when configured', () => {
    const state = createCucumberState(makePlayers(3), { cucumberEliminationThreshold: 50 }) as CucumberState;
    expect(state.eliminationThreshold).toBe(50);
  });

  it('rejects illegal plays', () => {
    const state = createCucumberState(makePlayers(3)) as CucumberState;
    const currentId = state.handPlayerIds[state.currentPlayerIndex];
    const player = state.players.find(p => p.id === currentId)!;
    const illegal = player.hand.find(c => !listLegalPlays(player.hand, []).some(l => cardEquals(l, c)));
    if (!illegal) return;
    const next = processCucumberAction(state, { type: 'play-card', card: illegal }, currentId);
    expect(next).toBe(state);
  });

  it('applies penalty on final trick and enters hand-end', () => {
    const base: CucumberState = {
      players: [
        playerState('a', [card('hearts', 5)]),
        playerState('b', [card('clubs', 9)]),
      ],
      phase: 'playing',
      handNumber: 1,
      dealerIndex: 0,
      handPlayerIds: ['a', 'b'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: null,
      gameOver: false,
      winners: [],
      eliminationThreshold: 30,
    };

    let state = processCucumberAction(base, { type: 'play-card', card: card('hearts', 5) }, 'a') as CucumberState;
    state = processCucumberAction(state, { type: 'play-card', card: card('clubs', 9) }, 'b') as CucumberState;
    expect(state.trickWinner).toBe('b');

    state = processCucumberAction(state, { type: 'resolve-trick' }, '') as CucumberState;
    expect(state.phase).toBe('hand-end');
    expect(state.lastHandPenalty).toEqual({ playerId: 'b', points: 9 });
    expect(state.players.find(p => p.id === 'b')?.penaltyScore).toBe(9);
  });

  it('ends game when final-trick penalty crosses 30-point threshold', () => {
    const base: CucumberState = {
      players: [
        playerState('a', [card('hearts', 5)], 5),
        playerState('b', [card('clubs', 14)], 22),
      ],
      phase: 'playing',
      handNumber: 3,
      dealerIndex: 0,
      handPlayerIds: ['a', 'b'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: null,
      gameOver: false,
      winners: [],
      eliminationThreshold: 30,
    };

    let state = processCucumberAction(base, { type: 'play-card', card: card('hearts', 5) }, 'a') as CucumberState;
    state = processCucumberAction(state, { type: 'play-card', card: card('clubs', 14) }, 'b') as CucumberState;
    state = processCucumberAction(state, { type: 'resolve-trick' }, '') as CucumberState;

    expect(isCucumberOver(state)).toBe(true);
    expect(state.players.find(p => p.id === 'b')?.penaltyScore).toBe(36);
    expect(getCucumberWinners(state)).toEqual(['a']);
  });

  it('ends game when final-trick penalty crosses 50-point threshold', () => {
    const base: CucumberState = {
      players: [
        playerState('a', [card('hearts', 5)], 10),
        playerState('b', [card('clubs', 10)], 40),
      ],
      phase: 'playing',
      handNumber: 4,
      dealerIndex: 0,
      handPlayerIds: ['a', 'b'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: null,
      gameOver: false,
      winners: [],
      eliminationThreshold: 50,
    };

    let state = processCucumberAction(base, { type: 'play-card', card: card('hearts', 5) }, 'a') as CucumberState;
    state = processCucumberAction(state, { type: 'play-card', card: card('clubs', 10) }, 'b') as CucumberState;
    state = processCucumberAction(state, { type: 'resolve-trick' }, '') as CucumberState;

    expect(isCucumberOver(state)).toBe(true);
    expect(state.players.find(p => p.id === 'b')?.penaltyScore).toBe(50);
    expect(getCucumberWinners(state)).toEqual(['a']);
  });

  it('continues to next hand when no one has reached threshold', () => {
    const state: CucumberState = {
      players: [
        playerState('a', [], 10),
        playerState('b', [], 15),
        playerState('c', [], 5),
      ],
      phase: 'hand-end',
      handNumber: 2,
      dealerIndex: 0,
      handPlayerIds: ['a', 'b', 'c'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: { playerId: 'b', points: 9 },
      gameOver: false,
      winners: [],
      eliminationThreshold: 30,
    };

    const next = processCucumberAction(state, { type: 'start-next-hand' }, '') as CucumberState;
    expect(isCucumberOver(next)).toBe(false);
    expect(next.phase).toBe('playing');
    expect(next.handNumber).toBe(3);
    expect(next.players.every(p => p.hand.length === 7)).toBe(true);
    expect(next.handPlayerIds).toHaveLength(3);
  });

  it('deals all players on subsequent hands', () => {
    const state: CucumberState = {
      players: [
        playerState('a', [], 10),
        playerState('b', [], 15),
        playerState('c', [], 5),
      ],
      phase: 'hand-end',
      handNumber: 1,
      dealerIndex: 0,
      handPlayerIds: ['a', 'b', 'c'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: { playerId: 'b', points: 9 },
      gameOver: false,
      winners: [],
      eliminationThreshold: 30,
    };

    const next = processCucumberAction(state, { type: 'start-next-hand' }, '') as CucumberState;
    expect(next.handPlayerIds).toEqual(['c', 'a', 'b']);
    expect(next.players.every(p => p.hand.length === 7)).toBe(true);
  });

  it('returns all tied lowest-score players as winners', () => {
    const state: CucumberState = {
      players: [
        playerState('a', [card('hearts', 5)], 5),
        playerState('b', [card('clubs', 8)], 5),
        playerState('c', [card('diamonds', 10)], 20),
      ],
      phase: 'playing',
      handNumber: 5,
      dealerIndex: 0,
      handPlayerIds: ['a', 'b', 'c'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: null,
      gameOver: false,
      winners: [],
      eliminationThreshold: 30,
    };

    let next = processCucumberAction(state, { type: 'play-card', card: card('hearts', 5) }, 'a') as CucumberState;
    next = processCucumberAction(next, { type: 'play-card', card: card('clubs', 8) }, 'b') as CucumberState;
    next = processCucumberAction(next, { type: 'play-card', card: card('diamonds', 10) }, 'c') as CucumberState;
    next = processCucumberAction(next, { type: 'resolve-trick' }, '') as CucumberState;

    expect(isCucumberOver(next)).toBe(true);
    expect(next.players.find(p => p.id === 'c')?.penaltyScore).toBe(30);
    expect(getCucumberWinners(next).sort()).toEqual(['a', 'b']);
  });

  it('validates play through isValidCucumberPlay', () => {
    const state = createCucumberState(makePlayers(3)) as CucumberState;
    const currentId = state.handPlayerIds[state.currentPlayerIndex];
    const player = state.players.find(p => p.id === currentId)!;
    const legal = listLegalPlays(player.hand, state.currentTrick)[0];
    expect(isValidCucumberPlay(state, currentId, legal)).toBe(true);
  });

  it('dev-set-near-loss sets acting player one point under threshold', () => {
    let state = createCucumberState(makePlayers(3)) as CucumberState;
    const actorId = state.players[1].id;
    state = processCucumberAction(state, { type: 'dev-set-near-loss' }, actorId) as CucumberState;
    expect(state.players.find(p => p.id === actorId)?.penaltyScore).toBe(state.eliminationThreshold - 1);
    expect(state.gameOver).toBe(false);
  });

  it('dev-set-near-loss respects 50-point threshold', () => {
    let state = createCucumberState(makePlayers(3), { cucumberEliminationThreshold: 50 }) as CucumberState;
    const actorId = state.players[0].id;
    state = processCucumberAction(state, { type: 'dev-set-near-loss' }, actorId) as CucumberState;
    expect(state.players.find(p => p.id === actorId)?.penaltyScore).toBe(49);
  });
});

describe('cucumber bot strategy', () => {
  it('plays lowest beating card when following in tricks 1-5', () => {
    const state = botPlayState('bot', [card('clubs', 7), card('hearts', 9), card('spades', 10)], {
      trickNumber: 3,
      currentTrick: [{ playerId: 'a', card: card('diamonds', 8) }],
      handPlayerIds: ['a', 'bot', 'c'],
      currentPlayerIndex: 1,
      opponents: [
        { id: 'a', hand: [card('diamonds', 2)] },
        { id: 'c', hand: [card('hearts', 3)] },
      ],
    });

    const chosen = chooseCucumberPlayCard(state, 'bot');
    expect(chosen?.rank).toBe(9);
  });

  it('plays highest card on trick 6 to keep lowest for trick 7', () => {
    const state = botPlayState('bot', [card('clubs', 3), card('hearts', 13)], {
      trickNumber: 6,
      currentTrick: [{ playerId: 'a', card: card('diamonds', 8) }],
      handPlayerIds: ['a', 'bot'],
      currentPlayerIndex: 1,
      opponents: [{ id: 'a', hand: [card('diamonds', 2)] }],
    });

    const chosen = chooseCucumberPlayCard(state, 'bot');
    expect(chosen?.rank).toBe(13);
  });

  it('plays Jack over matching 8 on trick 6 when keeping the 8 for trick 7', () => {
    const state = botPlayState('bot', [card('clubs', 8), card('hearts', 11)], {
      trickNumber: 6,
      currentTrick: [{ playerId: 'a', card: card('diamonds', 8) }],
      handPlayerIds: ['a', 'bot', 'c'],
      currentPlayerIndex: 1,
      opponents: [
        { id: 'a', hand: [card('diamonds', 2)] },
        { id: 'c', hand: [card('spades', 3)] },
      ],
    });

    const chosen = chooseCucumberPlayCard(state, 'bot');
    expect(chosen?.rank).toBe(11);
  });

  it('leads highest card on trick 6 to keep lowest for trick 7', () => {
    const state = botPlayState('bot', [card('clubs', 8), card('hearts', 11)], {
      trickNumber: 6,
      handPlayerIds: ['bot', 'a', 'c'],
      currentPlayerIndex: 0,
      opponents: [
        { id: 'a', hand: [card('diamonds', 2)] },
        { id: 'c', hand: [card('spades', 3)] },
      ],
    });

    const chosen = chooseCucumberPlayCard(state, 'bot');
    expect(chosen?.rank).toBe(11);
  });

  it('plays lowest non-winner on trick 7 when bot is last', () => {
    const state = botPlayState('bot', [card('clubs', 3), card('hearts', 8), card('spades', 10)], {
      trickNumber: 7,
      currentTrick: [
        { playerId: 'a', card: card('diamonds', 5) },
        { playerId: 'c', card: card('hearts', 9) },
      ],
      handPlayerIds: ['a', 'c', 'bot'],
      currentPlayerIndex: 2,
      opponents: [
        { id: 'a', hand: [card('diamonds', 2)] },
        { id: 'c', hand: [card('hearts', 4)] },
      ],
    });

    const chosen = chooseCucumberPlayCard(state, 'bot');
    expect(chosen?.rank).toBe(3);
  });

  it('avoids winning trick 7 when bot is not last and a safe card exists', () => {
    const state = botPlayState('bot', [card('clubs', 3), card('hearts', 14)], {
      trickNumber: 7,
      currentTrick: [{ playerId: 'a', card: card('diamonds', 5) }],
      handPlayerIds: ['a', 'bot', 'c'],
      currentPlayerIndex: 1,
      opponents: [
        { id: 'a', hand: [card('diamonds', 2)] },
        { id: 'c', hand: [card('hearts', 10)] },
      ],
    });

    const chosen = chooseCucumberPlayCard(state, 'bot');
    expect(chosen?.rank).toBe(3);
  });

  it('leads high while reserving the lowest card in hand', () => {
    const state = botPlayState('bot', [card('clubs', 2), card('hearts', 5), card('spades', 14)], {
      trickNumber: 5,
      handPlayerIds: ['bot', 'a', 'c'],
      currentPlayerIndex: 0,
      opponents: [
        { id: 'a', hand: [card('diamonds', 4)] },
        { id: 'c', hand: [card('hearts', 6)] },
      ],
    });

    const chosen = chooseCucumberPlayCard(state, 'bot');
    expect(chosen?.rank).toBe(14);
  });
});
