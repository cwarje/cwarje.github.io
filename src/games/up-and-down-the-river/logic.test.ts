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
  upRiverBiddingStyle?: UpRiverState['upRiverBiddingStyle'];
  submittedBids?: Record<string, number>;
  phase?: UpRiverState['phase'];
  bidCountdown?: number;
}): UpRiverState {
  const biddingStartIndex = (options.dealerIndex + 1) % options.players.length;
  return {
    players: options.players,
    phase: options.phase ?? 'bidding',
    upRiverStartMode: 'up-down',
    upRiverBiddingStyle: options.upRiverBiddingStyle ?? 'sequential',
    allowPerfectBids: options.allowPerfectBids,
    submittedBids: options.submittedBids ?? {},
    bidCountdown: options.bidCountdown ?? 0,
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

  it('defaults upRiverBiddingStyle to sequential', () => {
    const state = createUpRiverState(makePlayers(4)) as UpRiverState;
    expect(state.upRiverBiddingStyle).toBe('sequential');
    expect(state.submittedBids).toEqual({});
  });

  it('stores upRiverBiddingStyle from options', () => {
    const state = createUpRiverState(makePlayers(4), { upRiverBiddingStyle: 'knocking' }) as UpRiverState;
    expect(state.upRiverBiddingStyle).toBe('knocking');
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

describe('knocking bidding style', () => {
  it('stores hidden bids in submittedBids until reveal finishes', () => {
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
      upRiverBiddingStyle: 'knocking',
    });

    const afterFirst = processUpRiverAction(state, { type: 'place-bid', bid: 2 }, 'p1') as UpRiverState;
    expect(afterFirst.submittedBids).toEqual({ p1: 2 });
    expect(afterFirst.players[1].bid).toBeNull();
    expect(afterFirst.phase).toBe('bidding');
  });

  it('transitions to bid-countdown when all knocking bids are in', () => {
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
      allowPerfectBids: true,
      upRiverBiddingStyle: 'knocking',
      submittedBids: { p0: 1, p1: 2, p2: 0 },
    });

    const result = processUpRiverAction(state, { type: 'place-bid', bid: 1 }, 'p3') as UpRiverState;
    expect(result.phase).toBe('bid-countdown');
    expect(result.bidCountdown).toBe(3);
    expect(result.players.every(p => p.bid === null)).toBe(true);
  });

  it('moves from bid-countdown to bid-reveal and then playing with bids on pills', () => {
    const countdownState = biddingState({
      players: [
        player('p0', null),
        player('p1', null),
        player('p2', null),
        player('p3', null),
      ],
      currentPlayerIndex: 0,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: true,
      upRiverBiddingStyle: 'knocking',
      submittedBids: { p0: 1, p1: 2, p2: 0, p3: 1 },
      phase: 'bid-countdown',
      bidCountdown: 1,
    });

    const revealState = processUpRiverAction(countdownState, { type: 'tick-bid-countdown' }, '') as UpRiverState;
    expect(revealState.phase).toBe('bid-reveal');
    expect(revealState.players.every(p => p.bid === null)).toBe(true);

    const playingState = processUpRiverAction(revealState, { type: 'finish-bid-reveal' }, '') as UpRiverState;
    expect(playingState.phase).toBe('playing');
    expect(playingState.players.map(p => p.bid)).toEqual([1, 2, 0, 1]);
    expect(playingState.submittedBids).toEqual({});
    expect(playingState.currentPlayerIndex).toBe(playingState.leaderIndex);
  });

  it('does not apply perfect bid restriction in knocking mode', () => {
    const state = biddingState({
      players: [
        player('p0', null),
        player('p1', null),
        player('p2', null),
        player('p3', null),
      ],
      currentPlayerIndex: 3,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: false,
      upRiverBiddingStyle: 'knocking',
      submittedBids: { p0: 2, p1: 1, p2: 0 },
    });

    expect(getForbiddenPerfectBid(state)).toBeNull();
    const result = processUpRiverAction(state, { type: 'place-bid', bid: 2 }, 'p3') as UpRiverState;
    expect(result.phase).toBe('bid-countdown');
    expect(result.submittedBids.p3).toBe(2);
  });

  it('bot bids for all pending bots in knocking mode', () => {
    const state = biddingState({
      players: [
        player('p0', null, [], false),
        player('bot1', null, [], true),
        player('bot2', null, [], true),
        player('bot3', null, [], true),
      ],
      currentPlayerIndex: 0,
      dealerIndex: 3,
      currentRoundCardCount: 5,
      allowPerfectBids: true,
      upRiverBiddingStyle: 'knocking',
    });

    const result = runUpRiverBotTurn(state) as UpRiverState;
    expect(result.submittedBids.bot1).toBeDefined();
    expect(result.submittedBids.bot2).toBeDefined();
    expect(result.submittedBids.bot3).toBeDefined();
    expect(result.players.every(p => p.bid === null)).toBe(true);
  });
});
