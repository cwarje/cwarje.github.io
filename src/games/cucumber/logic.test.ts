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

  it('requires beating highest card when possible', () => {
    const hand = [card('hearts', 10), card('clubs', 9), card('spades', 7)];
    const trick = [{ playerId: 'a', card: card('diamonds', 8) }];
    const legal = listLegalPlays(hand, trick);
    expect(legal).toHaveLength(2);
    expect(legal.every(c => c.rank >= 8)).toBe(true);
  });

  it('forces lowest card when unable to beat', () => {
    const hand = [card('hearts', 3), card('clubs', 4), card('spades', 7)];
    const trick = [{ playerId: 'a', card: card('diamonds', 10) }];
    const legal = listLegalPlays(hand, trick);
    expect(legal).toHaveLength(1);
    expect(legal[0].rank).toBe(3);
  });

  it('forces lowest card when ace is led', () => {
    const hand = [card('hearts', 3), card('clubs', 14), card('spades', 7)];
    const trick = [{ playerId: 'a', card: card('diamonds', 14) }];
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

  it('scores ace as 14 penalty points', () => {
    expect(rankValue(14)).toBe(14);
    expect(rankValue(11)).toBe(11);
  });
});

describe('cucumber logic', () => {
  it('creates a valid initial state with 7 cards each', () => {
    const state = createCucumberState(makePlayers(4)) as CucumberState;
    expect(state.phase).toBe('playing');
    expect(state.handPlayerIds).toHaveLength(4);
    expect(state.players.every(p => p.hand.length === 7)).toBe(true);
    expect(state.trickNumber).toBe(1);
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
    };

    const next = processCucumberAction(state, { type: 'start-next-hand' }, '') as CucumberState;
    expect(isCucumberOver(next)).toBe(true);
    expect(getCucumberWinners(next)).toEqual(['a']);
  });

  it('validates play through isValidCucumberPlay', () => {
    const state = createCucumberState(makePlayers(3)) as CucumberState;
    const currentId = state.handPlayerIds[state.currentPlayerIndex];
    const player = state.players.find(p => p.id === currentId)!;
    const legal = listLegalPlays(player.hand, state.currentTrick)[0];
    expect(isValidCucumberPlay(state, currentId, legal)).toBe(true);
  });
});
