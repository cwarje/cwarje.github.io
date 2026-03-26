import type { Player } from '../../networking/types';
import type { Card, MobilizationAction, MobilizationPlayer, MobilizationState, Rank, SolitaireColumn, Suit } from './types';
import {
  applySolitaireBottomPlay,
  applySolitaireTopPlay,
  cardEquals,
  getLegalSolitairePlays,
  getMobilizationTrickWinnerId,
  isValidMobilizationTrickPlay,
  isValidSolitairePlay,
  removalSortKey,
  trickRoundHasNoScoringCardsRemaining,
} from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const MOBILIZATION_SUIT_ORDER: Record<Suit, number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };

function createFullDeck(): Card[] {
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

function handSortRank(rank: Rank, acesLow: boolean): number {
  return acesLow && rank === 14 ? 1 : rank;
}

function sortHand(hand: Card[], options?: { acesLow?: boolean }): Card[] {
  const acesLow = options?.acesLow ?? false;
  return [...hand].sort((a, b) => {
    if (MOBILIZATION_SUIT_ORDER[a.suit] !== MOBILIZATION_SUIT_ORDER[b.suit]) {
      return MOBILIZATION_SUIT_ORDER[a.suit] - MOBILIZATION_SUIT_ORDER[b.suit];
    }
    return handSortRank(a.rank, acesLow) - handSortRank(b.rank, acesLow);
  });
}

function trimDeckForRound(roundIndex: number, playerCount: number): { removed: Card[]; deck: Card[] } {
  const full = createFullDeck();
  const removeCount = 52 % playerCount;
  if (removeCount === 0) {
    return { removed: [], deck: shuffle(full) };
  }
  const sorted = [...full].sort(
    (a, b) => removalSortKey(roundIndex, a) - removalSortKey(roundIndex, b),
  );
  const removed = sorted.slice(0, removeCount);
  const remaining = sorted.slice(removeCount);
  return { removed, deck: shuffle(remaining) };
}

function emptySolitaireColumns(): SolitaireColumn[] {
  return Array.from({ length: 4 }, () => ({
    seven: null,
    topCard: null,
    bottomCard: null,
    topNext: null,
    bottomNext: null,
  }));
}

function resetRoundStats(player: MobilizationPlayer): MobilizationPlayer {
  return {
    ...player,
    hand: [],
    tricksThisRound: 0,
    clubsThisRound: 0,
    queensThisRound: 0,
    hadKingClubs: false,
    tookLastTrick: false,
    roundScore: 0,
  };
}

function dealTrickRound(
  players: MobilizationPlayer[],
  roundIndex: number,
  dealerIndex: number,
): MobilizationState {
  const playerCount = players.length;
  const { removed, deck } = trimDeckForRound(roundIndex, playerCount);
  const perPlayer = deck.length / playerCount;

  const dealt = players.map((p, i) => {
    const hand = deck.slice(i * perPlayer, (i + 1) * perPlayer);
    return {
      ...resetRoundStats(p),
      hand: sortHand(hand),
    };
  });

  const leaderIndex = (dealerIndex + 1) % playerCount;

  const base: MobilizationState = {
    players: dealt,
    phase: 'playing',
    roundIndex,
    dealerIndex,
    leaderIndex,
    currentPlayerIndex: leaderIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 1,
    cardsPerTrickRound: perPlayer,
    removedCards: removed,
    gameOver: false,
    pigHolderId: null,
    solitaireColumns: emptySolitaireColumns(),
  };

  if (trickRoundHasNoScoringCardsRemaining(base)) {
    return {
      ...base,
      phase: 'round-depleted',
      trickRoundDepletedKind: roundIndex === 1 ? 'clubs' : 'queens',
    };
  }

  return base;
}

function dealSolitaireRound(
  players: MobilizationPlayer[],
  roundIndex: number,
  dealerIndex: number,
): MobilizationState {
  const playerCount = players.length;
  const { removed, deck } = trimDeckForRound(roundIndex, playerCount);
  const perPlayer = deck.length / playerCount;

  const dealt = players.map((p, i) => {
    const hand = deck.slice(i * perPlayer, (i + 1) * perPlayer);
    return {
      ...resetRoundStats(p),
      hand: sortHand(hand, { acesLow: true }),
    };
  });

  const leaderIndex = (dealerIndex + 1) % playerCount;

  return {
    players: dealt,
    phase: 'solitaire',
    roundIndex,
    dealerIndex,
    leaderIndex,
    currentPlayerIndex: leaderIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 1,
    cardsPerTrickRound: perPlayer,
    removedCards: removed,
    gameOver: false,
    pigHolderId: null,
    solitaireColumns: emptySolitaireColumns(),
  };
}

export function createMobilizationState(players: Player[]): MobilizationState {
  const gamePlayers = players.slice(0, 6);
  const initial: MobilizationPlayer[] = gamePlayers.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    hand: [],
    tricksThisRound: 0,
    clubsThisRound: 0,
    queensThisRound: 0,
    hadKingClubs: false,
    tookLastTrick: false,
    roundScore: 0,
    totalScore: 0,
  }));
  return dealTrickRound(initial, 0, 0);
}

function scoreTrickRound(state: MobilizationState): MobilizationPlayer[] {
  const r = state.roundIndex;
  return state.players.map((p) => {
    let roundScore = 0;
    if (r === 0) roundScore = -2 * p.tricksThisRound;
    else if (r === 1) roundScore = -2 * p.clubsThisRound;
    else if (r === 2) roundScore = -5 * p.queensThisRound;
    else if (r === 3) {
      roundScore = (p.hadKingClubs ? -5 : 0) + (p.tookLastTrick ? -5 : 0);
    }
    else if (r === 5) roundScore = 2 * p.tricksThisRound;

    return {
      ...p,
      roundScore,
      totalScore: p.totalScore + roundScore,
    };
  });
}

function endTrickRound(state: MobilizationState): MobilizationState {
  const scoredPlayers = scoreTrickRound(state);
  const isLastRound = state.roundIndex >= 5;

  if (isLastRound) {
    return {
      ...state,
      players: scoredPlayers,
      phase: 'round-end',
      gameOver: true,
      trickWinner: null,
      currentTrick: [],
      trickRoundDepletedKind: undefined,
    };
  }

  return {
    ...state,
    players: scoredPlayers,
    phase: 'round-end',
    gameOver: false,
    trickWinner: null,
    currentTrick: [],
    trickRoundDepletedKind: undefined,
  };
}

function endSolitaireRound(state: MobilizationState, winnerId: string): MobilizationState {
  const pigId = state.pigHolderId;
  const players = state.players.map((p) => {
    let delta = -2 * p.hand.length;
    if (p.id === winnerId) delta += 5;
    if (pigId && p.id === pigId) delta -= 5;
    return {
      ...p,
      roundScore: delta,
      totalScore: p.totalScore + delta,
      hand: [],
    };
  });

  return {
    ...state,
    players,
    phase: 'round-end',
    gameOver: false,
    pigHolderId: null,
    trickWinner: null,
    currentTrick: [],
    solitaireReveal: undefined,
  };
}

function startNextRoundFrom(state: MobilizationState): MobilizationState {
  const nextDealer = (state.dealerIndex + 1) % state.players.length;
  const nextRound = state.roundIndex + 1;
  const basePlayers = state.players.map(p => ({
    ...p,
    roundScore: 0,
  }));

  if (nextRound === 4) {
    return dealSolitaireRound(basePlayers, nextRound, nextDealer);
  }
  return dealTrickRound(basePlayers, nextRound, nextDealer);
}

function devJumpToRound(state: MobilizationState, target: number): MobilizationState {
  if (!Number.isInteger(target) || target < 0 || target > 5) return state;
  const playerCount = state.players.length;
  if (playerCount === 0) return state;

  const basePlayers = state.players.map(p => ({
    ...resetRoundStats(p),
    totalScore: 0,
  }));
  const dealerIndex = target % playerCount;
  if (target === 4) return dealSolitaireRound(basePlayers, target, dealerIndex);
  return dealTrickRound(basePlayers, target, dealerIndex);
}

/** Same column + hand update as `solitaire-play`; shared by action handler and bot simulation. */
function applySolitairePlay(
  columns: SolitaireColumn[],
  hand: Card[],
  card: Card,
  columnIndex: number,
): { columns: SolitaireColumn[]; hand: Card[]; gridRow: 0 | 1 | 2 } | null {
  if (!hand.some(c => cardEquals(c, card))) return null;
  if (!isValidSolitairePlay(columns, card, columnIndex)) return null;

  const col = columns[columnIndex];
  let newCol: SolitaireColumn;
  let gridRow: 0 | 1 | 2;

  if (col.seven === null && card.rank === 7) {
    gridRow = 1;
    newCol = {
      seven: card,
      topCard: null,
      bottomCard: null,
      topNext: 6,
      bottomNext: 8,
    };
  }
  else if (col.topNext !== null && col.seven && card.rank === col.topNext && card.suit === col.seven.suit) {
    gridRow = 2;
    newCol = applySolitaireTopPlay(col, card);
  }
  else if (col.bottomNext !== null && col.seven && card.rank === col.bottomNext && card.suit === col.seven.suit) {
    gridRow = 0;
    newCol = applySolitaireBottomPlay(col, card);
  }
  else {
    return null;
  }

  const newColumns = [...columns];
  newColumns[columnIndex] = newCol;
  const newHand = hand.filter(c => !cardEquals(c, card));
  return { columns: newColumns, hand: newHand, gridRow };
}

export function processMobilizationAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as MobilizationState;
  const a = action as MobilizationAction;

  if (import.meta.env.DEV && a.type === 'dev-jump-round') {
    return devJumpToRound(s, a.roundIndex);
  }

  if (s.gameOver) return state;

  switch (a.type) {
    case 'start-next-round': {
      if (s.phase !== 'round-end' || s.gameOver) return state;
      return startNextRoundFrom(s);
    }

    case 'play-card': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!isValidMobilizationTrickPlay(s, playerIndex, a.card)) return state;

      const newHand = s.players[playerIndex].hand.filter(c => !cardEquals(c, a.card));
      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hand: newHand };
      const newTrick = [...s.currentTrick, { playerId, card: a.card }];

      if (newTrick.length === s.players.length) {
        const winnerId = getMobilizationTrickWinnerId(newTrick);
        return {
          ...s,
          players: newPlayers,
          currentTrick: newTrick,
          trickWinner: winnerId,
        };
      }

      return {
        ...s,
        players: newPlayers,
        currentTrick: newTrick,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
      };
    }

    case 'resolve-trick': {
      if (s.phase !== 'playing' || !s.trickWinner) return state;
      const winnerIndex = s.players.findIndex(p => p.id === s.trickWinner);
      if (winnerIndex === -1) return state;

      const r = s.roundIndex;
      const trick = s.currentTrick;
      const clubsInTrick = trick.filter(t => t.card.suit === 'clubs').length;
      const queensInTrick = trick.filter(t => t.card.rank === 12).length;
      const hasKingClubs = trick.some(t => t.card.suit === 'clubs' && t.card.rank === 13);
      const isLastTrick = s.trickNumber >= s.cardsPerTrickRound;

      const updatedPlayers = [...s.players];
      const wp = updatedPlayers[winnerIndex];
      updatedPlayers[winnerIndex] = {
        ...wp,
        tricksThisRound: wp.tricksThisRound + 1,
        clubsThisRound: r === 1 ? wp.clubsThisRound + clubsInTrick : wp.clubsThisRound,
        queensThisRound: r === 2 ? wp.queensThisRound + queensInTrick : wp.queensThisRound,
        hadKingClubs: r === 3 ? wp.hadKingClubs || hasKingClubs : wp.hadKingClubs,
        tookLastTrick: r === 3 ? (isLastTrick ? true : wp.tookLastTrick) : wp.tookLastTrick,
      };

      if (isLastTrick) {
        return endTrickRound({
          ...s,
          players: updatedPlayers,
          trickWinner: null,
          currentTrick: [],
        });
      }

      const continuing: MobilizationState = {
        ...s,
        players: updatedPlayers,
        currentTrick: [],
        trickWinner: null,
        trickNumber: s.trickNumber + 1,
        leaderIndex: winnerIndex,
        currentPlayerIndex: winnerIndex,
      };

      if (trickRoundHasNoScoringCardsRemaining(continuing)) {
        return {
          ...continuing,
          phase: 'round-depleted',
          trickRoundDepletedKind: r === 1 ? 'clubs' : 'queens',
        };
      }

      return continuing;
    }

    case 'complete-trick-round-depletion': {
      if (s.phase !== 'round-depleted') return state;
      return endTrickRound(s);
    }

    case 'solitaire-pass': {
      if (s.phase !== 'solitaire') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      const hand = s.players[playerIndex].hand;
      if (getLegalSolitairePlays(s.solitaireColumns, hand).length > 0) return state;

      return {
        ...s,
        phase: 'solitaire-reveal',
        pigHolderId: playerId,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
        solitaireReveal: { kind: 'pass', actorId: playerId },
      };
    }

    case 'solitaire-play': {
      if (s.phase !== 'solitaire') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;

      const applied = applySolitairePlay(s.solitaireColumns, s.players[playerIndex].hand, a.card, a.columnIndex);
      if (!applied) return state;

      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hand: applied.hand };
      const newColumns = applied.columns;

      const winnerIdx = newPlayers.findIndex(p => p.hand.length === 0);
      const roundWinnerId = winnerIdx !== -1 ? newPlayers[winnerIdx]!.id : undefined;

      return {
        ...s,
        phase: 'solitaire-reveal',
        players: newPlayers,
        solitaireColumns: newColumns,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
        solitaireReveal: {
          kind: 'play',
          actorId: playerId,
          card: a.card,
          columnIndex: a.columnIndex,
          rowIndex: applied.gridRow,
          ...(roundWinnerId ? { roundWinnerId } : {}),
        },
      };
    }

    case 'solitaire-finish-reveal': {
      if (s.phase !== 'solitaire-reveal' || !s.solitaireReveal) return state;

      const reveal = s.solitaireReveal;
      const base: MobilizationState = {
        ...s,
        phase: 'solitaire',
        solitaireReveal: undefined,
      };

      if (reveal.kind === 'play' && reveal.roundWinnerId) {
        return endSolitaireRound(base, reveal.roundWinnerId);
      }

      return base;
    }

    default:
      return state;
  }
}

export function getMobilizationWinners(state: unknown): string[] {
  const s = state as MobilizationState;
  const maxScore = Math.max(...s.players.map(p => p.totalScore));
  return s.players.filter(p => p.totalScore === maxScore).map(p => p.id);
}

export function isMobilizationOver(state: unknown): boolean {
  return (state as MobilizationState).gameOver;
}

function compareCardLowFirst(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return MOBILIZATION_SUIT_ORDER[a.suit] - MOBILIZATION_SUIT_ORDER[b.suit];
}

function compareCardHighFirst(a: Card, b: Card): number {
  if (a.rank !== b.rank) return b.rank - a.rank;
  return MOBILIZATION_SUIT_ORDER[b.suit] - MOBILIZATION_SUIT_ORDER[a.suit];
}

/** Penalty if we win this trick (minimize in rounds 0–3; round 5 uses negative penalty). */
function trickPenaltyIfWeWin(
  state: MobilizationState,
  playerIndex: number,
  trick: { playerId: string; card: Card }[],
): number {
  const r = state.roundIndex;
  const clubsInTrick = trick.filter(t => t.card.suit === 'clubs').length;
  const queensInTrick = trick.filter(t => t.card.rank === 12).length;
  const hasKingClubs = trick.some(t => t.card.suit === 'clubs' && t.card.rank === 13);
  const isLastTrick = state.trickNumber >= state.cardsPerTrickRound;
  const p = state.players[playerIndex]!;

  switch (r) {
    case 0:
      return 2;
    case 1:
      return 2 * clubsInTrick;
    case 2:
      return 5 * queensInTrick;
    case 3: {
      let cost = 0;
      if (hasKingClubs && !p.hadKingClubs) cost += 5;
      if (isLastTrick) cost += 5;
      return cost;
    }
    case 5:
      return -2;
    default:
      return 0;
  }
}

/** Player indices still to act after the current player this trick (trick order from leader). */
function playerIndicesAfterCurrentInTrick(state: MobilizationState): number[] {
  const n = state.players.length;
  const leader = state.leaderIndex;
  const played = state.currentTrick.length;
  const out: number[] = [];
  for (let k = played + 1; k < n; k++) {
    out.push((leader + k) % n);
  }
  return out;
}

function maxRankInSuitAmongPlayers(
  state: MobilizationState,
  suit: Card['suit'],
  playerIndices: number[],
): number {
  let max = -1;
  for (const pi of playerIndices) {
    const h = state.players[pi]?.hand;
    if (!h) continue;
    for (const c of h) {
      if (c.suit === suit && c.rank > max) max = c.rank;
    }
  }
  return max;
}

function highestLedSuitRankInPartialTrick(
  trick: { playerId: string; card: Card }[],
  leadSuit: Card['suit'],
  withCard: Card,
): number {
  let high = -1;
  for (const t of trick) {
    if (t.card.suit === leadSuit && t.card.rank > high) high = t.card.rank;
  }
  if (withCard.suit === leadSuit && withCard.rank > high) high = withCard.rank;
  return high;
}

/** True if this play cannot win the trick given full hands (void discard, or someone later can beat led-suit high). */
function isSafeSlough(state: MobilizationState, playerIndex: number, card: Card): boolean {
  const trick = state.currentTrick;
  const after = playerIndicesAfterCurrentInTrick(state);
  const playerId = state.players[playerIndex]!.id;

  if (trick.length === 0) {
    const futureMax = maxRankInSuitAmongPlayers(state, card.suit, after);
    return futureMax > card.rank;
  }

  const leadSuit = trick[0]!.card.suit;
  const hand = state.players[playerIndex]?.hand ?? [];
  const hasLeadSuit = hand.some(c => c.suit === leadSuit);
  if (!hasLeadSuit) return true;

  const high = highestLedSuitRankInPartialTrick(trick, leadSuit, card);
  const futureMax = maxRankInSuitAmongPlayers(state, leadSuit, after);
  if (futureMax > high) return true;

  const partialWinner = getMobilizationTrickWinnerId([...trick, { playerId, card }]);
  return partialWinner !== playerId;
}

/** Negative if a is a better card to slough than b (dump-desirability order for this round). */
function compareSloughDesirable(roundIndex: number, a: Card, b: Card): number {
  switch (roundIndex) {
    case 0:
      return compareCardLowFirst(a, b);
    case 1: {
      const ac = a.suit === 'clubs' ? 1 : 0;
      const bc = b.suit === 'clubs' ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return compareCardHighFirst(a, b);
    }
    case 2: {
      const aq = a.rank === 12 ? 1 : 0;
      const bq = b.rank === 12 ? 1 : 0;
      if (aq !== bq) return aq - bq;
      return compareCardLowFirst(a, b);
    }
    case 3: {
      const tier = (c: Card) => {
        if (c.suit === 'clubs' && c.rank === 13) return 2;
        if (c.suit === 'clubs') return 1;
        return 0;
      };
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return tb - ta;
      return compareCardLowFirst(a, b);
    }
    default:
      return compareCardLowFirst(a, b);
  }
}

function chooseTrickCard(state: MobilizationState, playerIndex: number): Card | null {
  const hand = state.players[playerIndex].hand;
  const valid = hand.filter(c => isValidMobilizationTrickPlay(state, playerIndex, c));
  if (valid.length === 0) return null;

  const playerId = state.players[playerIndex].id;
  const completesTrick = state.currentTrick.length + 1 === state.players.length;

  if (!completesTrick) {
    const r = state.roundIndex;
    if (r === 5) {
      let best = valid[0]!;
      for (let i = 1; i < valid.length; i++) {
        const c = valid[i]!;
        if (compareCardHighFirst(c, best) < 0) best = c;
      }
      return best;
    }
    if (r >= 0 && r <= 3) {
      if (r === 1 && state.currentTrick.length > 0) {
        const leadSuit = state.currentTrick[0]!.card.suit;
        const canFollowLead = hand.some(c => c.suit === leadSuit);
        if (!canFollowLead) {
          const clubDiscards = valid.filter(c => c.suit === 'clubs');
          if (clubDiscards.length > 0) {
            let bestClub = clubDiscards[0]!;
            for (let i = 1; i < clubDiscards.length; i++) {
              const c = clubDiscards[i]!;
              if (compareCardHighFirst(c, bestClub) < 0) bestClub = c;
            }
            return bestClub;
          }
        }
      }
      const safe = valid.filter(c => isSafeSlough(state, playerIndex, c));
      if (safe.length > 0) {
        let bestSlough = safe[0]!;
        for (let i = 1; i < safe.length; i++) {
          const c = safe[i]!;
          if (compareSloughDesirable(r, c, bestSlough) < 0) bestSlough = c;
        }
        return bestSlough;
      }
    }
    let best = valid[0]!;
    for (let i = 1; i < valid.length; i++) {
      const c = valid[i]!;
      if (compareCardLowFirst(c, best) < 0) best = c;
    }
    return best;
  }

  let best = valid[0]!;
  let bestPenalty = (() => {
    const full = [...state.currentTrick, { playerId, card: best }];
    const w = getMobilizationTrickWinnerId(full);
    return w === playerId ? trickPenaltyIfWeWin(state, playerIndex, full) : 0;
  })();

  for (let i = 1; i < valid.length; i++) {
    const card = valid[i]!;
    const fullTrick = [...state.currentTrick, { playerId, card }];
    const winnerId = getMobilizationTrickWinnerId(fullTrick);
    const penalty = winnerId === playerId ? trickPenaltyIfWeWin(state, playerIndex, fullTrick) : 0;
    if (penalty < bestPenalty || (penalty === bestPenalty && compareCardLowFirst(card, best) < 0)) {
      best = card;
      bestPenalty = penalty;
    }
  }

  return best;
}

function chooseSolitaireMove(state: MobilizationState, playerIndex: number): MobilizationAction | null {
  const hand = state.players[playerIndex].hand;
  const legal = getLegalSolitairePlays(state.solitaireColumns, hand);
  if (legal.length === 0) return { type: 'solitaire-pass' };

  type Legal = (typeof legal)[number];
  let best: Legal | null = null;
  let bestMob = -1;
  let bestSuitRemain = -1;

  for (const cand of legal) {
    const applied = applySolitairePlay(state.solitaireColumns, hand, cand.card, cand.columnIndex);
    if (!applied) continue;
    const mob = getLegalSolitairePlays(applied.columns, applied.hand).length;
    const suitRemain = applied.hand.filter(c => c.suit === cand.card.suit).length;
    if (best === null) {
      best = cand;
      bestMob = mob;
      bestSuitRemain = suitRemain;
      continue;
    }
    const better =
      mob > bestMob
      || (mob === bestMob && suitRemain > bestSuitRemain)
      || (
        mob === bestMob
        && suitRemain === bestSuitRemain
        && (
          cand.columnIndex < best.columnIndex
          || (cand.columnIndex === best.columnIndex && compareCardLowFirst(cand.card, best.card) < 0)
        )
      );
    if (better) {
      best = cand;
      bestMob = mob;
      bestSuitRemain = suitRemain;
    }
  }

  if (!best) return { type: 'solitaire-pass' };
  return { type: 'solitaire-play', card: best.card, columnIndex: best.columnIndex };
}

export function runMobilizationBotTurn(state: unknown): unknown {
  const s = state as MobilizationState;
  if (s.gameOver || s.phase === 'round-end' || s.phase === 'round-depleted' || s.phase === 'solitaire-reveal') {
    return state;
  }

  const current = s.players[s.currentPlayerIndex];
  if (!current?.isBot) return state;

  if (s.phase === 'solitaire') {
    const move = chooseSolitaireMove(s, s.currentPlayerIndex);
    if (!move) return state;
    return processMobilizationAction(s, move, current.id);
  }

  if (s.phase === 'playing' && !s.trickWinner) {
    const card = chooseTrickCard(s, s.currentPlayerIndex);
    if (!card) return state;
    return processMobilizationAction(s, { type: 'play-card', card }, current.id);
  }

  return state;
}
