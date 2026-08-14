import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import type { Card, FrontPile, TensPlayer, TensState } from './types';
import { CARDS_PER_PLAYER, HAND_CARDS_PER_PLAYER, PILES_PER_PLAYER } from './types';
import {
  cardPenaltyPoints,
  deckCountForPlayers,
  isSetClear,
  playRankValue,
  validatePlays,
  wouldPickup,
} from './rules';
import {
  CARDS_PER_PLAYER as LOGIC_CARDS_PER_PLAYER,
  countCardsHeld,
  createTensState,
  deckCountForPlayers as logicDeckCount,
  getTensWinners,
  isTensOver,
  processTensAction,
  runTensBotTurn,
  sortCardsByRank,
} from './logic';

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

function emptyPiles(): FrontPile[] {
  return Array.from({ length: PILES_PER_PLAYER }, () => ({
    bottomCard: null,
    topCard: null,
    bottomFaceUp: false,
  }));
}

function player(id: string, hand: Card[], piles: FrontPile[] = emptyPiles(), totalScore = 0): TensPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: false,
    hand,
    tablePiles: piles,
    totalScore,
  };
}

function baseState(players: TensPlayer[], overrides: Partial<TensState> = {}): TensState {
  return {
    players,
    phase: 'playing',
    scoreThreshold: 150,
    dealerIndex: 0,
    currentPlayerIndex: 0,
    roundNumber: 1,
    centerPile: [],
    discardCount: 0,
    lastPlayRank: null,
    extraTurnPending: false,
    roundOutPlayerId: null,
    lastRoundScores: {},
    roundSummary: '',
    gameOver: false,
    winners: [],
    ...overrides,
  };
}

describe('tens rules', () => {
  it('uses correct deck counts', () => {
    expect(deckCountForPlayers(3)).toBe(2);
    expect(deckCountForPlayers(6)).toBe(3);
    expect(deckCountForPlayers(8)).toBe(4);
    expect(logicDeckCount(6)).toBe(3);
  });

  it('scores tens in hand at 25', () => {
    expect(cardPenaltyPoints(card('hearts', 10))).toBe(25);
    expect(cardPenaltyPoints(card('hearts', 14))).toBe(1);
    expect(cardPenaltyPoints(card('hearts', 13))).toBe(13);
  });

  it('treats ace as low for play comparison', () => {
    expect(playRankValue(14)).toBe(1);
    expect(playRankValue(13)).toBe(13);
    expect(wouldPickup(13, 14)).toBe(true);
    expect(wouldPickup(14, 13)).toBe(false);
  });

  it('sorts aces to the left of the hand', () => {
    const sorted = sortCardsByRank([
      card('hearts', 13),
      card('clubs', 14),
      card('diamonds', 5),
    ]);
    expect(sorted.map(c => c.rank)).toEqual([14, 5, 13]);
  });

  it('detects set clear in center pile', () => {
    expect(isSetClear([
      card('hearts', 8),
      card('clubs', 8),
      card('diamonds', 8),
      card('spades', 8),
    ])).toBe(true);
    expect(isSetClear([card('hearts', 8), card('clubs', 8), card('diamonds', 8)])).toBe(false);
  });
});

describe('tens deal', () => {
  it('deals 20 cards per player', () => {
    const state = createTensState(makePlayers(4)) as TensState;
    for (const p of state.players) {
      expect(countCardsHeld(p)).toBe(CARDS_PER_PLAYER);
      expect(p.hand.length).toBe(HAND_CARDS_PER_PLAYER);
      expect(p.tablePiles.length).toBe(PILES_PER_PLAYER);
    }
    expect(LOGIC_CARDS_PER_PLAYER).toBe(20);
  });
});

describe('tens play', () => {
  it('allows playing two identical hand cards in one turn', () => {
    const p0 = player('p0', [card('clubs', 9), card('clubs', 9), card('hearts', 9)]);
    const state = baseState([p0, player('p1', [])]);
    expect(validatePlays(state, 0, [
      { card: card('clubs', 9), source: 'hand' },
      { card: card('clubs', 9), source: 'hand' },
    ])).toBe(true);
  });

  it('allows leading any rank on empty center', () => {
    const p0 = player('p0', [card('hearts', 5), card('clubs', 5)]);
    const state = baseState([p0, player('p1', [card('spades', 3)])]);
    expect(validatePlays(state, 0, [{ card: card('hearts', 5), source: 'hand' }])).toBe(true);
  });

  it('accepts lower rank without pickup', () => {
    const p0 = player('p0', [card('hearts', 9), card('clubs', 7)]);
    const state = baseState([p0, player('p1', [])], { lastPlayRank: 10 });
    expect(validatePlays(state, 0, [{ card: card('hearts', 9), source: 'hand' }])).toBe(true);
    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [{ card: card('hearts', 9), source: 'hand' }],
    }, 'p0') as TensState;
    expect(next.centerPile).toHaveLength(1);
    expect(next.players[0].hand).toHaveLength(1);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('allows pickup when playing higher rank', () => {
    const p0 = player('p0', [card('hearts', 13)]);
    const state = baseState([p0, player('p1', [])], {
      lastPlayRank: 8,
      centerPile: [card('clubs', 8)],
    });
    expect(validatePlays(state, 0, [{ card: card('hearts', 13), source: 'hand' }])).toBe(true);
  });

  it('clears center on set of four', () => {
    const p0 = player('p0', [card('hearts', 6), card('diamonds', 6)]);
    const state = baseState([p0, player('p1', [])], {
      centerPile: [card('clubs', 6), card('spades', 6)],
      lastPlayRank: 6,
    });
    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [
        { card: card('hearts', 6), source: 'hand' },
        { card: card('diamonds', 6), source: 'hand' },
      ],
    }, 'p0') as TensState;

    expect(next.centerPile).toHaveLength(0);
    expect(next.discardCount).toBe(4);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('pickup moves center pile into hand and grants extra turn', () => {
    const p0 = player('p0', [card('hearts', 13)]);
    const state = baseState([p0, player('p1', [card('spades', 3)])], {
      centerPile: [card('clubs', 8), card('diamonds', 4)],
      lastPlayRank: 8,
    });
    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [{ card: card('hearts', 13), source: 'hand' }],
    }, 'p0') as TensState;

    expect(next.centerPile).toHaveLength(0);
    expect(next.players[0].hand.length).toBe(3);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('keeps pile bottom face down and unplayable after top is played', () => {
    const piles: FrontPile[] = [
      { bottomCard: card('clubs', 4), topCard: card('hearts', 5), bottomFaceUp: false },
      { bottomCard: card('diamonds', 3), topCard: card('spades', 8), bottomFaceUp: false },
      ...emptyPiles().slice(2),
    ];
    const p0 = player('p0', [], piles);
    const state = baseState([p0, player('p1', [card('spades', 3)])]);

    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [{ card: card('hearts', 5), source: 'pile-top', pileIndex: 0 }],
    }, 'p0') as TensState;

    expect(next.phase).toBe('playing');
    expect(next.players[0].tablePiles[0].bottomFaceUp).toBe(false);
    expect(validatePlays(next, 0, [{ card: card('clubs', 4), source: 'pile-bottom', pileIndex: 0 }])).toBe(false);
  });

  it('allows pile bottoms only after all tops are played', () => {
    const piles: FrontPile[] = [
      { bottomCard: card('clubs', 5), topCard: null, bottomFaceUp: false },
      { bottomCard: card('hearts', 7), topCard: card('spades', 6), bottomFaceUp: false },
      ...emptyPiles().slice(2),
    ];
    const p0 = player('p0', [card('diamonds', 5)], piles);
    const state = baseState([p0, player('p1', [])], { lastPlayRank: 10 });

    expect(validatePlays(state, 0, [{ card: card('clubs', 5), source: 'pile-bottom', pileIndex: 0 }])).toBe(false);

    const allTopsCleared = baseState([p0, player('p1', [])], { lastPlayRank: 10 });
    allTopsCleared.players[0].tablePiles = [
      { bottomCard: card('clubs', 5), topCard: null, bottomFaceUp: false },
      { bottomCard: card('hearts', 7), topCard: null, bottomFaceUp: false },
      ...emptyPiles().slice(2),
    ];

    expect(validatePlays(allTopsCleared, 0, [
      { card: card('clubs', 5), source: 'pile-bottom', pileIndex: 0 },
      { card: card('diamonds', 5), source: 'hand' },
    ])).toBe(true);
  });

  it('wild ten clears the center pile', () => {
    const p0 = player('p0', [card('hearts', 10)]);
    const state = baseState([p0, player('p1', [])], {
      centerPile: [card('clubs', 8), card('diamonds', 4)],
      lastPlayRank: 8,
    });
    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [{ card: card('hearts', 10), source: 'hand' }],
    }, 'p0') as TensState;

    expect(next.centerPile).toHaveLength(0);
    expect(next.discardCount).toBe(3);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('wild ten clears instead of pickup when center rank is lower', () => {
    const p0 = player('p0', [card('hearts', 10)]);
    const state = baseState([p0, player('p1', [card('spades', 3)])], {
      centerPile: [card('clubs', 8)],
      lastPlayRank: 8,
    });
    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [{ card: card('hearts', 10), source: 'hand' }],
    }, 'p0') as TensState;

    expect(next.centerPile).toHaveLength(0);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.discardCount).toBe(2);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('scores round when a player goes out', () => {
    const p0 = player('p0', [card('hearts', 5)]);
    const p1 = player('p1', [card('spades', 10), card('clubs', 14)], emptyPiles(), 0);
    const state = baseState([p0, p1]);

    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [{ card: card('hearts', 5), source: 'hand' }],
    }, 'p0') as TensState;

    expect(next.phase).toBe('round-end');
    expect(next.lastRoundScores.p0).toBe(0);
    expect(next.lastRoundScores.p1).toBe(26);
    expect(next.players[1].totalScore).toBe(26);
  });

  it('ends game when score threshold is reached', () => {
    const p0 = player('p0', [card('hearts', 5)]);
    const p1 = player('p1', [card('spades', 10), card('clubs', 14)], emptyPiles(), 130);
    const state = baseState([p0, p1], { scoreThreshold: 150 });

    const next = processTensAction(state, {
      type: 'play-cards',
      plays: [{ card: card('hearts', 5), source: 'hand' }],
    }, 'p0') as TensState;

    expect(next.gameOver).toBe(true);
    expect(next.winners).toEqual(['p0']);
  });

  it('starts next round on host action', () => {
    const state = baseState(
      [player('p0', []), player('p1', [])],
      { phase: 'round-end', roundNumber: 1, dealerIndex: 0 },
    );
    const next = processTensAction(state, { type: 'start-next-round' }, '') as TensState;
    expect(next.phase).toBe('playing');
    expect(next.dealerIndex).toBe(1);
    expect(next.roundNumber).toBe(2);
    expect(countCardsHeld(next.players[0])).toBe(CARDS_PER_PLAYER);
  });

  it('reports game over and winners', () => {
    const finished = baseState([player('p0', []), player('p1', [])], {
      phase: 'game-over',
      winners: ['p0'],
    });
    expect(isTensOver(finished)).toBe(true);
    expect(getTensWinners(finished)).toEqual(['p0']);
  });

  it('bot plays pile bottom after all tops are cleared', () => {
    const piles: FrontPile[] = [
      { bottomCard: card('clubs', 4), topCard: null, bottomFaceUp: false },
      ...emptyPiles().slice(1),
    ];
    const botPlayer = { ...player('bot', [], piles), isBot: true };
    const state = baseState([botPlayer, player('p1', [])], {
      lastPlayRank: 14,
      centerPile: [card('hearts', 14), card('diamonds', 3)],
    });
    const next = runTensBotTurn(state) as TensState;
    expect(next).not.toBe(state);
    expect(next.players[0].tablePiles[0].bottomCard).toBeNull();
  });

  it('bot clears with ten when center pile is stuck under ace limit', () => {
    const botPlayer = { ...player('bot', [card('hearts', 10)]), isBot: true };
    const state = baseState([botPlayer, player('p1', [])], {
      lastPlayRank: 14,
      centerPile: [card('hearts', 14), card('diamonds', 3)],
      discardCount: 4,
    });
    const next = runTensBotTurn(state) as TensState;
    expect(next.centerPile).toHaveLength(0);
    expect(next.discardCount).toBe(7);
    expect(next.currentPlayerIndex).toBe(0);
  });
});
