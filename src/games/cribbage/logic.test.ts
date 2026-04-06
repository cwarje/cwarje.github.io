import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import type { Card } from '../cross-crib/types';
import { createCribbageState, processCribbageAction } from './logic';
import { scoreCribShow, scoreShowHand } from './rules';
import { cribCardsToSelect, cardsDealtPerPlayer, type CribbageState } from './types';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    color: 'blue',
    isBot: false,
    isHost: i === 0,
    connected: true,
  }));
}

function cutToPegging2p(): CribbageState {
  let s = createCribbageState(makePlayers(2)) as CribbageState;
  const p0 = s.players[0].id;
  const p1 = s.players[1].id;
  const d0 = s.players[0].hand.slice(0, 2);
  const d1 = s.players[1].hand.slice(0, 2);
  s = processCribbageAction(s, { type: 'select-crib-discard', cards: d0 }, p0) as CribbageState;
  s = processCribbageAction(s, { type: 'confirm-crib-discard' }, p0) as CribbageState;
  s = processCribbageAction(s, { type: 'select-crib-discard', cards: d1 }, p1) as CribbageState;
  s = processCribbageAction(s, { type: 'confirm-crib-discard' }, p1) as CribbageState;
  s = processCribbageAction(s, { type: 'perform-cut', cutIndex: 0 }, p1) as CribbageState;
  return s;
}

describe('cribbage logic', () => {
  it('deal sizes per player count', () => {
    expect(cardsDealtPerPlayer(2)).toBe(6);
    expect(cardsDealtPerPlayer(3)).toBe(5);
    expect(cribCardsToSelect(2)).toBe(2);
    expect(cribCardsToSelect(3)).toBe(1);
  });

  it('creates valid 2p state with stock and hands', () => {
    const s = createCribbageState(makePlayers(2)) as ReturnType<typeof createCribbageState>;
    expect(s.players).toHaveLength(2);
    expect(s.players[0].hand).toHaveLength(6);
    expect(s.players[1].hand).toHaveLength(6);
    expect(s.cribCards).toHaveLength(0);
    expect(s.stock.length).toBe(52 - 12);
    expect(s.phase).toBe('crib-discard');
  });

  it('3p has one crib seed and 5-card hands', () => {
    const s = createCribbageState(makePlayers(3)) as ReturnType<typeof createCribbageState>;
    expect(s.players.every(p => p.hand.length === 5)).toBe(true);
    expect(s.cribCards).toHaveLength(1);
    expect(s.cribSeedCard).not.toBeNull();
  });

  it('accepts incremental crib discard selection then confirm', () => {
    let s = createCribbageState(makePlayers(2)) as ReturnType<typeof createCribbageState>;
    const p0 = s.players[0].id;
    const p1 = s.players[1].id;
    const c0 = s.players[0].hand[0];
    const c1 = s.players[0].hand[1];
    s = processCribbageAction(s, { type: 'select-crib-discard', cards: [c0] }, p0) as typeof s;
    expect(s.cribSelections[p0]).toEqual([c0]);
    s = processCribbageAction(s, { type: 'select-crib-discard', cards: [c0, c1] }, p0) as typeof s;
    expect(s.cribSelections[p0]).toHaveLength(2);
    s = processCribbageAction(s, { type: 'confirm-crib-discard' }, p0) as typeof s;
    const d1 = s.players[1].hand.slice(0, 2);
    s = processCribbageAction(s, { type: 'select-crib-discard', cards: d1 }, p1) as typeof s;
    s = processCribbageAction(s, { type: 'confirm-crib-discard' }, p1) as typeof s;
    expect(s.phase).toBe('cut-starter');
  });

  it('cut by pone sets starter and empties stock', () => {
    let s = createCribbageState(makePlayers(2)) as ReturnType<typeof createCribbageState>;
    const p0 = s.players[0].id;
    const p1 = s.players[1].id;
    const d0 = s.players[0].hand.slice(0, 2);
    const d1 = s.players[1].hand.slice(0, 2);
    s = processCribbageAction(s, { type: 'select-crib-discard', cards: d0 }, p0) as typeof s;
    s = processCribbageAction(s, { type: 'confirm-crib-discard' }, p0) as typeof s;
    s = processCribbageAction(s, { type: 'select-crib-discard', cards: d1 }, p1) as typeof s;
    s = processCribbageAction(s, { type: 'confirm-crib-discard' }, p1) as typeof s;
    expect(s.phase).toBe('cut-starter');
    const poneId = s.players[1].id;
    expect(processCribbageAction(s, { type: 'perform-cut', cutIndex: 0 }, p0)).toBe(s);
    s = processCribbageAction(s, { type: 'perform-cut', cutIndex: 3 }, poneId) as typeof s;
    expect(s.starterCard).not.toBeNull();
    expect(s.stock).toHaveLength(0);
    expect(s.phase).toBe('pegging');
    expect(s.holeCards).not.toBeNull();
    expect(s.holeCards![0]).toHaveLength(4);
  });

  it('street-ending go defers last-card scoring until advance-pegging-go-reveal', () => {
    const base = cutToPegging2p();
    const c2: Card = { suit: 'clubs', rank: 2 };
    const c3: Card = { suit: 'diamonds', rank: 3 };
    let s: CribbageState = {
      ...base,
      players: base.players.map((p, i) => ({ ...p, hand: i === 0 ? [c2] : [c3] })),
      peggingSequence: [{ card: { suit: 'hearts', rank: 10 }, playerIndex: 1 }],
      peggingRunningTotal: 31,
      peggingCurrentIndex: 0,
      consecutivePeggingPasses: 1,
      lastPeggingPlayerIndex: 1,
      peggingGoReveal: null,
      peggingPointsReveal: null,
    };

    const p0 = s.players[0].id;
    s = processCribbageAction(s, { type: 'pegging-pass' }, p0) as CribbageState;
    expect(s.peggingGoReveal).toEqual({ stage: 'announce', passerIndex: 0 });
    expect(s.playerScores).toEqual([0, 0]);
    expect(s.peggingSequence).toHaveLength(1);

    s = processCribbageAction(s, { type: 'advance-pegging-go-reveal' }, '') as CribbageState;
    expect(s.peggingGoReveal?.stage).toBe('score');
    expect(s.playerScores).toEqual([0, 1]);
    expect(s.peggingSequence).toHaveLength(0);
    expect(s.peggingRunningTotal).toBe(0);
    expect(s.peggingCurrentIndex).toBe(1);

    s = processCribbageAction(s, { type: 'advance-pegging-go-reveal' }, '') as CribbageState;
    expect(s.peggingGoReveal).toBeNull();
  });

  it('pegging play that scores sets points reveal and defers turn until advance', () => {
    const base = cutToPegging2p();
    const five: Card = { suit: 'clubs', rank: 5 };
    const six: Card = { suit: 'diamonds', rank: 6 };
    let s: CribbageState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, hand: [five] } : { ...p, hand: [six] }
      ),
      peggingSequence: [{ card: { suit: 'hearts', rank: 10 }, playerIndex: 1 }],
      peggingRunningTotal: 10,
      peggingCurrentIndex: 0,
      consecutivePeggingPasses: 0,
      lastPeggingPlayerIndex: 1,
      peggingGoReveal: null,
      peggingPointsReveal: null,
      playerScores: [0, 0],
    };
    const p0 = s.players[0].id;
    s = processCribbageAction(s, { type: 'play-pegging-card', card: five }, p0) as CribbageState;
    expect(s.peggingPointsReveal).not.toBeNull();
    expect(s.peggingPointsReveal?.points).toBe(2);
    expect(s.playerScores[0]).toBe(2);
    expect(s.peggingCurrentIndex).toBe(0);
    expect(s.peggingRunningTotal).toBe(15);
    expect(s.peggingSequence).toHaveLength(2);

    s = processCribbageAction(s, { type: 'advance-pegging-points-reveal' }, '') as CribbageState;
    expect(s.peggingPointsReveal).toBeNull();
    expect(s.peggingCurrentIndex).toBe(1);
  });

  it('pegging 31 keeps sequence during points reveal; advance clears street', () => {
    const base = cutToPegging2p();
    const fiveH: Card = { suit: 'hearts', rank: 5 };
    const two: Card = { suit: 'clubs', rank: 2 };
    let s: CribbageState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, hand: [two] } : { ...p, hand: [fiveH] }
      ),
      peggingSequence: [
        { card: { suit: 'hearts', rank: 10 }, playerIndex: 0 },
        { card: { suit: 'clubs', rank: 10 }, playerIndex: 1 },
        { card: { suit: 'diamonds', rank: 14 }, playerIndex: 0 },
        { card: { suit: 'spades', rank: 5 }, playerIndex: 1 },
      ],
      peggingRunningTotal: 26,
      peggingCurrentIndex: 1,
      consecutivePeggingPasses: 0,
      lastPeggingPlayerIndex: 0,
      peggingGoReveal: null,
      peggingPointsReveal: null,
      playerScores: [0, 0],
    };
    const p1 = s.players[1].id;
    s = processCribbageAction(s, { type: 'play-pegging-card', card: fiveH }, p1) as CribbageState;
    expect(s.peggingPointsReveal?.hit31).toBe(true);
    expect(s.peggingPointsReveal?.points).toBe(4);
    expect(s.peggingSequence).toHaveLength(5);
    expect(s.peggingRunningTotal).toBe(31);

    s = processCribbageAction(s, { type: 'advance-pegging-points-reveal' }, '') as CribbageState;
    expect(s.peggingPointsReveal).toBeNull();
    expect(s.peggingSequence).toHaveLength(0);
    expect(s.peggingRunningTotal).toBe(0);
    expect(s.peggingCurrentIndex).toBe(0);
  });

  it('end of pegging with zero-score last play sets hand-end reveal then show', () => {
    const base = cutToPegging2p();
    const c2: Card = { suit: 'clubs', rank: 2 };
    let s: CribbageState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [c2] } : { ...p, hand: [] })),
      peggingSequence: [{ card: { suit: 'hearts', rank: 10 }, playerIndex: 1 }],
      peggingRunningTotal: 10,
      peggingCurrentIndex: 0,
      consecutivePeggingPasses: 0,
      lastPeggingPlayerIndex: 1,
      peggingGoReveal: null,
      peggingPointsReveal: null,
    };
    const p0 = s.players[0].id;
    s = processCribbageAction(s, { type: 'play-pegging-card', card: c2 }, p0) as CribbageState;
    expect(s.phase).toBe('pegging');
    expect(s.peggingHandEndReveal).toEqual({ scorerIndex: 0 });
    expect(s.playerScores[0]).toBe(1);

    s = processCribbageAction(s, { type: 'advance-pegging-hand-end-reveal' }, '') as CribbageState;
    expect(s.peggingHandEndReveal).toBeNull();
    expect(s.phase).toBe('show');
    expect(s.showAppliedSteps).toBe(1);
  });

  it('pegging 31 on final card applies last card then hand-end reveal before show', () => {
    const base = cutToPegging2p();
    const fiveH: Card = { suit: 'hearts', rank: 5 };
    let s: CribbageState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [] } : { ...p, hand: [fiveH] })),
      peggingSequence: [
        { card: { suit: 'hearts', rank: 10 }, playerIndex: 0 },
        { card: { suit: 'clubs', rank: 10 }, playerIndex: 1 },
        { card: { suit: 'diamonds', rank: 14 }, playerIndex: 0 },
        { card: { suit: 'spades', rank: 5 }, playerIndex: 1 },
      ],
      peggingRunningTotal: 26,
      peggingCurrentIndex: 1,
      consecutivePeggingPasses: 0,
      lastPeggingPlayerIndex: 0,
      peggingGoReveal: null,
      peggingPointsReveal: null,
      playerScores: [0, 0],
    };
    const p1 = s.players[1].id;
    s = processCribbageAction(s, { type: 'play-pegging-card', card: fiveH }, p1) as CribbageState;
    expect(s.peggingPointsReveal?.hit31).toBe(true);
    expect(s.playerScores[1]).toBe(4);

    s = processCribbageAction(s, { type: 'advance-pegging-points-reveal' }, '') as CribbageState;
    expect(s.peggingPointsReveal).toBeNull();
    expect(s.peggingHandEndReveal).toEqual({ scorerIndex: 1 });
    expect(s.playerScores[1]).toBe(5);
    expect(s.phase).toBe('pegging');

    s = processCribbageAction(s, { type: 'advance-pegging-hand-end-reveal' }, '') as CribbageState;
    expect(s.peggingHandEndReveal).toBeNull();
    expect(s.phase).toBe('show');
    expect(s.showAppliedSteps).toBe(1);
  });

  it('show phase applies each hand, then crib, then deals on separate advances', () => {
    const base = createCribbageState(makePlayers(2)) as CribbageState;
    const h0: Card[] = [
      { suit: 'clubs', rank: 2 },
      { suit: 'diamonds', rank: 3 },
      { suit: 'hearts', rank: 4 },
      { suit: 'spades', rank: 5 },
    ];
    const h1: Card[] = [
      { suit: 'clubs', rank: 6 },
      { suit: 'diamonds', rank: 7 },
      { suit: 'hearts', rank: 8 },
      { suit: 'spades', rank: 9 },
    ];
    const starter: Card = { suit: 'clubs', rank: 10 };
    const crib: Card[] = [
      { suit: 'hearts', rank: 11 },
      { suit: 'hearts', rank: 12 },
      { suit: 'hearts', rank: 13 },
      { suit: 'hearts', rank: 14 },
    ];
    let s: CribbageState = {
      ...base,
      phase: 'show',
      dealerIndex: 0,
      players: base.players.map(p => ({ ...p, hand: [] })),
      playerScores: [0, 0],
      teamScores: null,
      starterCard: starter,
      holeCards: [h0, h1],
      cribCards: crib,
      showAppliedSteps: 0,
      showStep: 0,
      peggingSequence: [],
      peggingRunningTotal: 0,
      peggingCurrentIndex: 0,
      consecutivePeggingPasses: 0,
      lastPeggingPlayerIndex: null,
      peggingGoReveal: null,
      peggingPointsReveal: null,
      peggingHandEndReveal: null,
      stock: [],
      gameOver: false,
      winners: [],
      cribSeedCard: null,
      cribSelections: {},
      cribConfirmed: {},
    };
    for (const p of s.players) {
      s.cribSelections[p.id] = [];
      s.cribConfirmed[p.id] = false;
    }

    const ponePts = scoreShowHand(h1, starter);
    s = processCribbageAction(s, { type: 'advance-show' }, '') as CribbageState;
    expect(s.phase).toBe('show');
    expect(s.showAppliedSteps).toBe(1);
    expect(s.playerScores[1]).toBe(ponePts);

    const dealerPts = scoreShowHand(h0, starter);
    s = processCribbageAction(s, { type: 'advance-show' }, '') as CribbageState;
    expect(s.showAppliedSteps).toBe(2);
    expect(s.playerScores[0]).toBe(dealerPts);

    const cribPts = scoreCribShow(crib, starter);
    s = processCribbageAction(s, { type: 'advance-show' }, '') as CribbageState;
    expect(s.showAppliedSteps).toBe(3);
    expect(s.playerScores[0]).toBe(dealerPts + cribPts);

    s = processCribbageAction(s, { type: 'advance-show' }, '') as CribbageState;
    expect(s.phase).toBe('crib-discard');
    expect(s.showAppliedSteps).toBe(0);
    expect(s.dealerIndex).toBe(1);
  });
});
