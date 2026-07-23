import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import type { Card, UpRiverPlayer, UpRiverState } from './types';
import {
  createUpRiverState,
  getForbiddenPerfectBid,
  isBidAllowed,
  processUpRiverAction,
  runUpRiverBotTurn,
} from './logic';
import { ROUND_SEQUENCE_UP_DOWN } from './logic';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    color: 'blue' as const,
    isBot: i > 0,
    isHost: i === 0,
    connected: true,
  }));
}

function card(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank };
}

function player(id: string, bid: number | null, hand: Card[] = [], isBot = false): UpRiverPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot,
    hand,
    bid,
    tricksWon: 0,
    roundScore: 0,
    totalScore: 0,
  };
}

function biddingState(options: {
  players: UpRiverPlayer[];
  currentPlayerIndex: number;
  dealerIndex: number;
  currentRoundCardCount: number;
  allowPerfectBids: boolean;
}): UpRiverState {
  const biddingStartIndex = (options.dealerIndex + 1) % options.players.length;
  return {
    players: options.players,
    phase: 'bidding',
    upRiverStartMode: 'up-down',
    allowPerfectBids: options.allowPerfectBids,
    roundSequence: ROUND_SEQUENCE_UP_DOWN,
    roundIndex: 4,
    currentRoundCardCount: options.currentRoundCardCount,
    dealerIndex: options.dealerIndex,
    leaderIndex: biddingStartIndex,
    currentPlayerIndex: options.currentPlayerIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 1,
    trumpSuit: 'hearts',
    trumpCard: card('hearts', 14),
    gameOver: false,
    winner: null,
  };
}

describe('perfect bid restriction', () => {
  it('defaults allowPerfectBids to true', () => {
    const state = createUpRiverState(makePlayers(4)) as UpRiverState;
    expect(state.allowPerfectBids).toBe(true);
  });

  it('stores allowPerfectBids from options', () => {
    const state = createUpRiverState(makePlayers(4), { allowPerfectBids: false }) as UpRiverState;
    expect(state.allowPerfectBids).toBe(false);
  });

  it('allows perfect bid when allowPerfectBids is true', () => {
    const state = biddingState({
      players: [
        player('p0', 2),
        player('p1', 1),
        player('p2', 0),
        player('p3', null),
      ],
      currentPlayerIndex: 3,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: true,
    });

    expect(getForbiddenPerfectBid(state)).toBeNull();
    expect(isBidAllowed(state, 2)).toBe(true);
  });

  it('forbids perfect bid for last bidder when allowPerfectBids is false', () => {
    const state = biddingState({
      players: [
        player('p0', 2),
        player('p1', 1),
        player('p2', 0),
        player('p3', null),
      ],
      currentPlayerIndex: 3,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: false,
    });

    expect(getForbiddenPerfectBid(state)).toBe(2);
    expect(isBidAllowed(state, 2)).toBe(false);
    expect(isBidAllowed(state, 1)).toBe(true);
  });

  it('rejects forbidden perfect bid in processUpRiverAction', () => {
    const state = biddingState({
      players: [
        player('p0', 2),
        player('p1', 1),
        player('p2', 0),
        player('p3', null),
      ],
      currentPlayerIndex: 3,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: false,
    });

    const result = processUpRiverAction(state, { type: 'place-bid', bid: 2 }, 'p3') as UpRiverState;
    expect(result).toBe(state);
    expect((result as UpRiverState).players[3].bid).toBeNull();
  });

  it('accepts non-perfect bid for last bidder when allowPerfectBids is false', () => {
    const state = biddingState({
      players: [
        player('p0', 2),
        player('p1', 1),
        player('p2', 0),
        player('p3', null),
      ],
      currentPlayerIndex: 3,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: false,
    });

    const result = processUpRiverAction(state, { type: 'place-bid', bid: 1 }, 'p3') as UpRiverState;
    expect(result.players[3].bid).toBe(1);
    expect(result.phase).toBe('playing');
  });

  it('does not restrict non-last bidders when allowPerfectBids is false', () => {
    const state = biddingState({
      players: [
        player('p0', null),
        player('p1', null),
        player('p2', null),
        player('p3', null),
      ],
      currentPlayerIndex: 0,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: false,
    });

    expect(getForbiddenPerfectBid(state)).toBeNull();
    expect(isBidAllowed(state, 5)).toBe(true);
  });

  it('does not forbid when perfect bid is outside valid range', () => {
    const state = biddingState({
      players: [
        player('p0', 3),
        player('p1', 3),
        player('p2', 2),
        player('p3', null),
      ],
      currentPlayerIndex: 3,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: false,
    });

    expect(getForbiddenPerfectBid(state)).toBeNull();
    expect(isBidAllowed(state, 0)).toBe(true);
    expect(isBidAllowed(state, 5)).toBe(true);
  });

  it('bot avoids forbidden perfect bid', () => {
    const weakHand = [
      card('clubs', 2),
      card('diamonds', 3),
      card('spades', 4),
      card('clubs', 5),
      card('diamonds', 6),
    ];
    const state = biddingState({
      players: [
        player('p0', 2),
        player('p1', 1),
        player('p2', 0),
        player('bot', null, weakHand, true),
      ],
      currentPlayerIndex: 3,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: false,
    });

    const result = runUpRiverBotTurn(state) as UpRiverState;
    expect(result.players[3].bid).not.toBe(2);
    expect(result.players[3].bid).not.toBeNull();
  });
});
