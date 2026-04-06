import type { Player } from '../../networking/types';
import type { GameStartOptions } from '../../networking/types';
import type { Card } from '../cross-crib/types';
import { cardEquals, cardValueFor15 } from '../cross-crib/rules';
import {
  cribCardsToSelect,
  cardsDealtPerPlayer,
  poneIndex,
  teamIndexForSeat,
  type CribbageState,
  type CribbagePlayer,
  type PeggingPlay,
} from './types';
import {
  legalPeggingPlays,
  peggingPlayScoreBreakdown,
  playersStillHoldingCards,
  scorePeggingPlay,
  scoreShowHand,
  scoreCribShow,
} from './rules';

const SUITS: Card['suit'][] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Card['suit'], number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.rank - b.rank;
  });
}

function cardsArePairwiseDistinct(cards: Card[]): boolean {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cardEquals(cards[i], cards[j])) return false;
    }
  }
  return true;
}

function cribContributionSeatOrder(dealerIndex: number, n: number): number[] {
  const p = poneIndex(dealerIndex, n);
  return Array.from({ length: n }, (_, k) => (p + k) % n);
}

function computeWinners(state: CribbageState): string[] {
  const target = state.targetScore;
  if (state.teamScores) {
    const [t0, t1] = state.teamScores;
    const m = Math.max(t0, t1);
    if (m < target) return [];
    if (t0 === t1 && t0 >= target) return state.players.map(p => p.id);
    if (t0 > t1 && t0 >= target) {
      return state.players.filter((_, i) => teamIndexForSeat(i) === 0).map(p => p.id);
    }
    if (t1 > t0 && t1 >= target) {
      return state.players.filter((_, i) => teamIndexForSeat(i) === 1).map(p => p.id);
    }
    return [];
  }
  const best = Math.max(...state.playerScores);
  if (best < target) return [];
  return state.players.filter((_, i) => state.playerScores[i] >= target).map(p => p.id);
}

function withWinCheck(state: CribbageState): CribbageState {
  const winners = computeWinners(state);
  if (winners.length === 0) return state;
  return { ...state, gameOver: true, phase: 'game-over', winners };
}

function addPoints(state: CribbageState, scoringPlayerIndex: number, points: number): CribbageState {
  if (points === 0) return state;
  const n = state.players.length;
  if (n === 4 && state.teamScores) {
    const t = teamIndexForSeat(scoringPlayerIndex);
    const teamScores: [number, number] = [...state.teamScores] as [number, number];
    teamScores[t] += points;
    return withWinCheck({ ...state, teamScores });
  }
  const playerScores = [...state.playerScores];
  playerScores[scoringPlayerIndex] += points;
  return withWinCheck({ ...state, playerScores });
}

function dealFreshHand(state: CribbageState): CribbageState {
  const n = state.players.length;
  const deck = shuffle(createDeck());
  const per = cardsDealtPerPlayer(n);
  const hands: Card[][] = Array.from({ length: n }, () => []);
  let di = 0;
  for (let r = 0; r < per; r++) {
    for (let p = 0; p < n; p++) {
      hands[p].push(deck[di++]);
    }
  }
  let cribCards: Card[] = [];
  let cribSeedCard: Card | null = null;
  if (n === 3) {
    cribSeedCard = deck[di++];
    cribCards = [cribSeedCard];
  }
  const stock = deck.slice(di);

  const players: CribbagePlayer[] = state.players.map((p, i) => ({
    ...p,
    hand: sortHand(hands[i]),
  }));

  const cribSelections: Record<string, Card[]> = {};
  const cribConfirmed: Record<string, boolean> = {};
  for (const p of players) {
    cribSelections[p.id] = [];
    cribConfirmed[p.id] = false;
  }

  return {
    ...state,
    players,
    phase: 'crib-discard',
    cribCards,
    cribSeedCard,
    cribSelections,
    cribConfirmed,
    stock,
    starterCard: null,
    holeCards: null,
    peggingSequence: [],
    peggingRunningTotal: 0,
    peggingCurrentIndex: poneIndex(state.dealerIndex, n),
    consecutivePeggingPasses: 0,
    lastPeggingPlayerIndex: null,
    peggingGoReveal: null,
    peggingPointsReveal: null,
    peggingHandEndReveal: null,
    showStep: 0,
    showAppliedSteps: 0,
  };
}

export function createCribbageState(players: Player[], options?: GameStartOptions): CribbageState {
  const n = players.length;
  const targetScore: 61 | 121 = options?.cribbageTargetScore === 61 ? 61 : 121;
  const base: CribbagePlayer[] = players.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: p.isBot,
    hand: [],
  }));

  const initial: CribbageState = {
    players: base,
    phase: 'crib-discard',
    dealerIndex: 0,
    targetScore,
    playerScores: Array(n).fill(0),
    teamScores: n === 4 ? [0, 0] : null,
    cribCards: [],
    cribSeedCard: null,
    cribSelections: {},
    cribConfirmed: {},
    stock: [],
    starterCard: null,
    holeCards: null,
    peggingSequence: [],
    peggingRunningTotal: 0,
    peggingCurrentIndex: 0,
    consecutivePeggingPasses: 0,
    lastPeggingPlayerIndex: null,
    peggingGoReveal: null,
    peggingPointsReveal: null,
    peggingHandEndReveal: null,
    showStep: 0,
    showAppliedSteps: 0,
    gameOver: false,
    winners: [],
  };

  for (const p of base) {
    initial.cribSelections[p.id] = [];
    initial.cribConfirmed[p.id] = false;
  }

  return dealFreshHand(initial);
}

function applyCribDiscards(state: CribbageState): CribbageState {
  const n = state.players.length;
  const need = cribCardsToSelect(n);
  const order = cribContributionSeatOrder(state.dealerIndex, n);
  const newCrib = [...state.cribCards];
  const players = state.players.map(p => ({ ...p, hand: [...p.hand] }));

  for (const seat of order) {
    const p = players[seat];
    const sel = state.cribSelections[p.id];
    if (!sel || sel.length !== need) return state;
    for (const c of sel) {
      if (!p.hand.some(h => cardEquals(h, c))) return state;
    }
  }

  for (const seat of order) {
    const p = players[seat];
    const sel = state.cribSelections[p.id]!;
    for (const c of sel) {
      const idx = p.hand.findIndex(h => cardEquals(h, c));
      if (idx === -1) return state;
      p.hand.splice(idx, 1);
      newCrib.push(c);
    }
    p.hand = sortHand(p.hand);
  }

  if (newCrib.length !== 4) return state;

  return {
    ...state,
    players,
    cribCards: newCrib,
    phase: 'cut-starter',
    peggingCurrentIndex: poneIndex(state.dealerIndex, n),
  };
}

function nextPeggingIndex(state: CribbageState, from: number): number {
  const n = state.players.length;
  return (from + 1) % n;
}

function endPeggingStreet(state: CribbageState): CribbageState {
  let s: CribbageState = {
    ...state,
    peggingSequence: [] as PeggingPlay[],
    peggingRunningTotal: 0,
    consecutivePeggingPasses: 0,
  };
  if (state.lastPeggingPlayerIndex !== null) {
    s = addPoints(s, state.lastPeggingPlayerIndex, 1);
  }
  s.lastPeggingPlayerIndex = null;
  if (s.gameOver) return s;
  return s;
}

/** After `endPeggingStreet`, advance turn from the passer to the next player still holding cards. */
function peggingNextPlayerAfterStreetClear(s: CribbageState): CribbageState {
  const n = s.players.length;
  let next = nextPeggingIndex(s, s.peggingCurrentIndex);
  let guard = 0;
  while (guard++ < n + 1) {
    if (s.players[next].hand.length > 0) {
      return { ...s, peggingCurrentIndex: next, consecutivePeggingPasses: 0 };
    }
    next = nextPeggingIndex(s, next);
  }
  return { ...s, consecutivePeggingPasses: 0 };
}

function advancePeggingGoReveal(state: CribbageState): CribbageState {
  const r = state.peggingGoReveal;
  if (!r || state.phase !== 'pegging') return state;

  if (r.stage === 'announce') {
    const lastCardScorerIndex = state.lastPeggingPlayerIndex;
    const lastCardPoints = lastCardScorerIndex !== null ? 1 : 0;
    const passer = r.passerIndex;
    let s2 = endPeggingStreet(state);
    if (s2.gameOver) {
      return { ...s2, peggingGoReveal: null };
    }
    s2 = peggingNextPlayerAfterStreetClear(s2);
    return {
      ...s2,
      peggingGoReveal: {
        stage: 'score',
        passerIndex: passer,
        lastCardScorerIndex,
        lastCardPoints,
      },
    };
  }

  return { ...state, peggingGoReveal: null };
}

/** End-of-pegging last card: +1, optional HUD pause before show (skip reveal if game ends). */
function finishPeggingLastCardThenMaybeReveal(state: CribbageState, scorerIndex: number): CribbageState {
  const scored = addPoints(state, scorerIndex, 1);
  if (scored.gameOver) return scored;
  return { ...scored, peggingHandEndReveal: { scorerIndex } };
}

function advancePeggingHandEndReveal(state: CribbageState): CribbageState {
  if (!state.peggingHandEndReveal || state.phase !== 'pegging') return state;
  const cleared = { ...state, peggingHandEndReveal: null };
  return transitionToShowPhase(cleared);
}

function advancePeggingPointsReveal(state: CribbageState): CribbageState {
  const r = state.peggingPointsReveal;
  if (!r || state.phase !== 'pegging') return state;

  let next: CribbageState = { ...state, peggingPointsReveal: null };
  const pIndex = r.scorerIndex;

  if (r.hit31) {
    next = {
      ...next,
      peggingSequence: [],
      peggingRunningTotal: 0,
      consecutivePeggingPasses: 0,
      lastPeggingPlayerIndex: null,
      peggingGoReveal: null,
    };
    if (next.gameOver) return next;
    const allOut = next.players.every(p => p.hand.length === 0);
    if (allOut) {
      return finishPeggingLastCardThenMaybeReveal(next, pIndex);
    }
    let nxt = nextPeggingIndex(next, pIndex);
    let guard = 0;
    while (guard++ < next.players.length + 1) {
      if (next.players[nxt].hand.length > 0) {
        return { ...next, peggingCurrentIndex: nxt };
      }
      nxt = nextPeggingIndex(next, nxt);
    }
    return next;
  }

  return afterPeggingPlay(next, pIndex, next.peggingSequence, next.peggingRunningTotal);
}

function afterPeggingPlay(state: CribbageState, playerIndex: number, newSeq: PeggingPlay[], newTotal: number): CribbageState {
  const n = state.players.length;
  let s: CribbageState = {
    ...state,
    peggingSequence: newSeq,
    peggingRunningTotal: newTotal,
    consecutivePeggingPasses: 0,
    lastPeggingPlayerIndex: playerIndex,
  };
  if (s.gameOver) return s;

  const allOut = s.players.every(p => p.hand.length === 0);
  if (allOut) {
    return finishPeggingLastCardThenMaybeReveal(s, playerIndex);
  }

  let next = nextPeggingIndex(s, playerIndex);
  let guard = 0;
  while (guard++ < n + 1) {
    if (s.players[next].hand.length > 0) {
      return { ...s, peggingCurrentIndex: next };
    }
    next = nextPeggingIndex(s, next);
  }
  return s;
}

function advanceAfterPass(state: CribbageState): CribbageState {
  const n = state.players.length;
  const holding = playersStillHoldingCards(state.players);
  let consecutive = state.consecutivePeggingPasses + 1;
  let s = { ...state, consecutivePeggingPasses: consecutive };

  if (holding === 0) {
    if (s.lastPeggingPlayerIndex !== null) {
      return finishPeggingLastCardThenMaybeReveal(s, s.lastPeggingPlayerIndex);
    }
    return transitionToShowPhase(s);
  }

  if (consecutive >= holding) {
    return {
      ...s,
      consecutivePeggingPasses: 0,
      peggingGoReveal: { stage: 'announce', passerIndex: s.peggingCurrentIndex },
    };
  }

  let next = nextPeggingIndex(s, s.peggingCurrentIndex);
  let guard = 0;
  while (guard++ < n + 1) {
    if (s.players[next].hand.length > 0) {
      return { ...s, peggingCurrentIndex: next };
    }
    next = nextPeggingIndex(s, next);
  }
  return s;
}

function applyShowStep(state: CribbageState): CribbageState {
  const n = state.players.length;
  const pone = poneIndex(state.dealerIndex, n);
  const starter = state.starterCard;
  const holes = state.holeCards;
  if (!starter || !holes) return state;

  const step = state.showAppliedSteps;
  if (step < n) {
    const playerIndex = (pone + step) % n;
    const pts = scoreShowHand(holes[playerIndex], starter);
    let s = addPoints(state, playerIndex, pts);
    if (s.gameOver) {
      return { ...s, showAppliedSteps: step + 1 };
    }
    return { ...s, showAppliedSteps: step + 1 };
  }

  if (step === n) {
    const pts = scoreCribShow(state.cribCards, starter);
    const s = addPoints(state, state.dealerIndex, pts);
    return { ...s, showAppliedSteps: step + 1 };
  }

  if (step === n + 1) {
    if (state.gameOver) return state;
    const nextDealer = (state.dealerIndex + 1) % n;
    return dealFreshHand({ ...state, dealerIndex: nextDealer, showAppliedSteps: 0, showStep: 0 });
  }

  return state;
}

/** Enter show and apply pone’s hand immediately (no extra confirm before first hand). */
function transitionToShowPhase(state: CribbageState): CribbageState {
  return applyShowStep({ ...state, phase: 'show', showStep: 0, showAppliedSteps: 0 });
}

export function processCribbageAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as CribbageState;
  const a = action as { type: string; cards?: Card[]; cutIndex?: number; card?: Card };

  if (s.gameOver && a.type !== 'start-next-hand') return state;
  if (s.phase === 'game-over') return state;

  switch (a.type) {
    case 'select-crib-discard': {
      if (s.phase !== 'crib-discard') return state;
      const need = cribCardsToSelect(s.players.length);
      const cards = a.cards;
      // Allow partial selections (UI toggles one card at a time); confirm requires full count.
      if (!cards || cards.length > need || !cardsArePairwiseDistinct(cards)) return state;
      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex === -1 || s.cribConfirmed[playerId]) return state;
      const hand = s.players[pIndex].hand;
      for (const c of cards) {
        if (!hand.some(h => cardEquals(h, c))) return state;
      }
      return { ...s, cribSelections: { ...s.cribSelections, [playerId]: cards } };
    }
    case 'confirm-crib-discard': {
      if (s.phase !== 'crib-discard') return state;
      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex === -1 || s.cribConfirmed[playerId]) return state;
      const need = cribCardsToSelect(s.players.length);
      const sel = s.cribSelections[playerId];
      if (!sel || sel.length !== need) return state;
      const confirmed = { ...s.cribConfirmed, [playerId]: true };
      const next = { ...s, cribConfirmed: confirmed };
      if (next.players.every(p => confirmed[p.id])) {
        return applyCribDiscards(next);
      }
      return next;
    }
    case 'perform-cut': {
      if (s.phase !== 'cut-starter') return state;
      const pone = poneIndex(s.dealerIndex, s.players.length);
      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex !== pone) return state;
      const idx = a.cutIndex;
      if (typeof idx !== 'number' || idx < 0 || idx >= s.stock.length) return state;
      const starter = s.stock[idx];
      let next: CribbageState = {
        ...s,
        starterCard: starter,
        stock: [],
        phase: 'pegging',
        peggingSequence: [],
        peggingRunningTotal: 0,
        consecutivePeggingPasses: 0,
        lastPeggingPlayerIndex: null,
        peggingGoReveal: null,
        peggingPointsReveal: null,
        peggingHandEndReveal: null,
        peggingCurrentIndex: pone,
        holeCards: s.players.map(p => [...p.hand]),
      };
      if (starter.rank === 11) {
        next = addPoints(next, next.dealerIndex, 2);
      }
      return next;
    }
    case 'play-pegging-card': {
      if (s.phase !== 'pegging' || s.peggingGoReveal || s.peggingPointsReveal || s.peggingHandEndReveal)
        return state;
      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex === -1 || pIndex !== s.peggingCurrentIndex) return state;
      const card = a.card;
      if (!card) return state;
      const player = s.players[pIndex];
      const ci = player.hand.findIndex(h => cardEquals(h, card));
      if (ci === -1) return state;
      const legal = legalPeggingPlays(player.hand, s.peggingSequence, s.peggingRunningTotal);
      if (!legal.some(c => cardEquals(c, card))) return state;

      const play: PeggingPlay = { card, playerIndex: pIndex };
      const breakdown = peggingPlayScoreBreakdown(s.peggingSequence, play);
      const { points, hit31 } = breakdown;
      const newTotal = s.peggingRunningTotal + cardValueFor15(card);
      const newSeq = [...s.peggingSequence, play];

      const newHand = [...player.hand];
      newHand.splice(ci, 1);
      const players = s.players.map((p, i) => (i === pIndex ? { ...p, hand: sortHand(newHand) } : p));

      let next: CribbageState = {
        ...s,
        players,
        peggingSequence: newSeq,
        peggingRunningTotal: newTotal,
        consecutivePeggingPasses: 0,
        lastPeggingPlayerIndex: pIndex,
      };

      if (points > 0) {
        next = addPoints(next, pIndex, points);
        if (next.gameOver) return { ...next, peggingPointsReveal: null };
        return {
          ...next,
          peggingPointsReveal: {
            scorerIndex: pIndex,
            points,
            summaryParts: breakdown.summaryParts,
            hit31,
          },
        };
      }

      return afterPeggingPlay(next, pIndex, newSeq, newTotal);
    }
    case 'pegging-pass': {
      if (s.phase !== 'pegging' || s.peggingGoReveal || s.peggingPointsReveal || s.peggingHandEndReveal)
        return state;
      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex === -1 || pIndex !== s.peggingCurrentIndex) return state;
      const player = s.players[pIndex];
      const legal = legalPeggingPlays(player.hand, s.peggingSequence, s.peggingRunningTotal);
      if (legal.length > 0) return state;
      return advanceAfterPass(s);
    }
    case 'advance-pegging-go-reveal': {
      return advancePeggingGoReveal(s);
    }
    case 'advance-pegging-points-reveal': {
      return advancePeggingPointsReveal(s);
    }
    case 'advance-pegging-hand-end-reveal': {
      return advancePeggingHandEndReveal(s);
    }
    case 'advance-show': {
      if (s.phase !== 'show') return state;
      return applyShowStep(s);
    }
    case 'start-next-hand': {
      return state;
    }
    default:
      return state;
  }
}

export function isCribbageOver(state: unknown): boolean {
  return (state as CribbageState).gameOver;
}

export function getCribbageWinners(state: unknown): string[] {
  return (state as CribbageState).winners;
}

/** Dealer (2–3p) or dealer team names (4p), for HUD. */
export function cribbageCribOwnerLabel(state: CribbageState): string {
  const dealer = state.players[state.dealerIndex];
  if (!dealer) return '';
  const n = state.players.length;
  if (n === 2 || n === 3) return dealer.name;
  const partnerIdx = (state.dealerIndex + 2) % 4;
  const partner = state.players[partnerIdx];
  if (!partner) return dealer.name;
  const a = Math.min(state.dealerIndex, partnerIdx);
  const b = Math.max(state.dealerIndex, partnerIdx);
  return `${state.players[a].name} & ${state.players[b].name}`;
}

function chooseCribDiscard(state: CribbageState, seat: number): Card[] {
  const need = cribCardsToSelect(state.players.length);
  const hand = [...state.players[seat].hand];
  hand.sort((a, b) => cardValueFor15(a) - cardValueFor15(b));
  return hand.slice(0, need);
}

function choosePeggingCard(state: CribbageState, seat: number): Card | null {
  const player = state.players[seat];
  const legal = legalPeggingPlays(player.hand, state.peggingSequence, state.peggingRunningTotal);
  if (legal.length === 0) return null;
  let best: Card = legal[0];
  let bestPts = -1;
  for (const c of legal) {
    const play: PeggingPlay = { card: c, playerIndex: seat };
    const { points } = scorePeggingPlay(state.peggingSequence, play);
    if (points > bestPts) {
      bestPts = points;
      best = c;
    }
  }
  if (bestPts > 0) return best;
  return legal[Math.floor(Math.random() * legal.length)];
}

export function runCribbageBotTurn(state: unknown): unknown {
  const s = state as CribbageState;
  if (s.gameOver) return state;
  if (s.peggingGoReveal) return state;
  if (s.peggingPointsReveal) return state;
  if (s.peggingHandEndReveal) return state;

  if (s.phase === 'crib-discard') {
    const need = cribCardsToSelect(s.players.length);
    for (let i = 0; i < s.players.length; i++) {
      const bot = s.players[i];
      if (!bot.isBot || s.cribConfirmed[bot.id]) continue;
      const sel = s.cribSelections[bot.id];
      if (!sel || sel.length !== need) {
        const picked = chooseCribDiscard(s, i);
        return processCribbageAction(s, { type: 'select-crib-discard', cards: picked }, bot.id);
      }
    }
    for (const bot of s.players) {
      if (!bot.isBot || s.cribConfirmed[bot.id]) continue;
      const sel = s.cribSelections[bot.id];
      if (sel && sel.length === need) {
        return processCribbageAction(s, { type: 'confirm-crib-discard' }, bot.id);
      }
    }
    return s;
  }

  if (s.phase === 'cut-starter') {
    const pone = poneIndex(s.dealerIndex, s.players.length);
    const bot = s.players[pone];
    if (!bot?.isBot || s.stock.length === 0) return state;
    const cutIndex = Math.floor(Math.random() * s.stock.length);
    return processCribbageAction(s, { type: 'perform-cut', cutIndex }, bot.id);
  }

  if (s.phase === 'pegging') {
    const cur = s.players[s.peggingCurrentIndex];
    if (!cur?.isBot) return state;
    const pick = choosePeggingCard(s, s.peggingCurrentIndex);
    if (pick) {
      return processCribbageAction(s, { type: 'play-pegging-card', card: pick }, cur.id);
    }
    return processCribbageAction(s, { type: 'pegging-pass' }, cur.id);
  }

  return state;
}
