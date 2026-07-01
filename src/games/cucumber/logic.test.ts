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

function playerState(id: string, hand: Card[], penaltyScore = 0, eliminated = false): CucumberPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: false,
    hand,
    penaltyScore,
    eliminated,
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

  it('scores ace as 14 and face cards as 10 penalty points', () => {
    expect(rankValue(14)).toBe(14);
    expect(rankValue(11)).toBe(10);
    expect(rankValue(12)).toBe(10);
    expect(rankValue(13)).toBe(10);
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

  it('uses 50-point elimination threshold when configured', () => {
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

  it('eliminates players at 30 points', () => {
    const players = [
      playerState('a', [], 10),
      playerState('b', [], ELIMINATION_THRESHOLD),
      playerState('c', [], 5),
    ];
    const state: CucumberState = {
      players,
      phase: 'hand-end',
      handNumber: 2,
      dealerIndex: 0,
      handPlayerIds: ['a', 'c'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: { playerId: 'b', points: 14 },
      gameOver: false,
      winners: [],
      eliminationThreshold: 30,
    };

    const withEliminated = {
      ...state,
      players: state.players.map(p => (p.id === 'b' ? { ...p, eliminated: true } : p)),
    };

    const next = processCucumberAction(withEliminated, { type: 'start-next-hand' }, '') as CucumberState;
    expect(next.players.find(p => p.id === 'b')?.eliminated).toBe(true);
    expect(next.handPlayerIds).toEqual(['a', 'c']);
  });

  it('ends game when one player remains', () => {
    const state: CucumberState = {
      players: [
        playerState('a', [], 5),
        playerState('b', [], ELIMINATION_THRESHOLD, true),
        playerState('c', [], ELIMINATION_THRESHOLD, true),
      ],
      phase: 'hand-end',
      handNumber: 3,
      dealerIndex: 0,
      handPlayerIds: ['a'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: null,
      gameOver: false,
      winners: [],
      eliminationThreshold: 30,
    };

    const next = processCucumberAction(state, { type: 'start-next-hand' }, '') as CucumberState;
    expect(isCucumberOver(next)).toBe(true);
    expect(getCucumberWinners(next)).toEqual(['a']);
  });

  it('eliminates players at 50 points when configured', () => {
    const players = [
      playerState('a', [], 10),
      playerState('b', [], 49),
      playerState('c', [], 5),
    ];
    const state: CucumberState = {
      players,
      phase: 'hand-end',
      handNumber: 2,
      dealerIndex: 0,
      handPlayerIds: ['a', 'c'],
      currentPlayerIndex: 0,
      currentTrick: [],
      trickNumber: 7,
      trickWinner: null,
      lastHandPenalty: { playerId: 'b', points: 1 },
      gameOver: false,
      winners: [],
      eliminationThreshold: 50,
    };

    const next = processCucumberAction(
      {
        ...state,
        players: state.players.map(p =>
          p.id === 'b' ? { ...p, penaltyScore: 50, eliminated: true } : p,
        ),
      },
      { type: 'start-next-hand' },
      '',
    ) as CucumberState;
    expect(next.players.find(p => p.id === 'b')?.eliminated).toBe(true);
    expect(next.eliminationThreshold).toBe(50);
  });

  it('validates play through isValidCucumberPlay', () => {
    const state = createCucumberState(makePlayers(3)) as CucumberState;
    const currentId = state.handPlayerIds[state.currentPlayerIndex];
    const player = state.players.find(p => p.id === currentId)!;
    const legal = listLegalPlays(player.hand, state.currentTrick)[0];
    expect(isValidCucumberPlay(state, currentId, legal)).toBe(true);
  });
});
