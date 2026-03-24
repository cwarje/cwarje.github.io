import type { Player } from '../../networking/types';
import type { Card, CrossCribPlayer, CrossCribState, Suit } from './types';
import { cribCardsToSelect } from './types';
import { cardEquals, scoreCribbageHand } from './rules';

const SUITS: ('hearts' | 'diamonds' | 'clubs' | 'spades')[] = ['clubs', 'diamonds', 'spades', 'hearts'];
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
  const suitOrder: Record<Suit, number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.rank - b.rank;
  });
}

function createEmptyGrid(): (null)[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(null));
}

function getRowCards(grid: CrossCribState['grid'], row: number, starterCard: Card | null): Card[] {
  const cards: Card[] = [];
  for (let col = 0; col < 5; col++) {
    const cell = grid[row][col];
    if (cell) cards.push(cell.card);
    else if (row === 2 && col === 2 && starterCard) cards.push(starterCard);
  }
  return cards;
}

function getColumnCards(grid: CrossCribState['grid'], col: number, starterCard: Card | null): Card[] {
  const cards: Card[] = [];
  for (let row = 0; row < 5; row++) {
    const cell = grid[row][col];
    if (cell) cards.push(cell.card);
    else if (row === 2 && col === 2 && starterCard) cards.push(starterCard);
  }
  return cards;
}

function recomputeScores(state: CrossCribState): { rowScores: number[]; columnScores: number[] } {
  const starter = state.starterCard;
  if (!starter) return { rowScores: [0, 0, 0, 0, 0], columnScores: [0, 0, 0, 0, 0] };

  const rowScores: number[] = [];
  const columnScores: number[] = [];

  for (let r = 0; r < 5; r++) {
    const rowCards = getRowCards(state.grid, r, starter);
    rowScores.push(scoreCribbageHand(rowCards, starter.suit));
  }
  for (let c = 0; c < 5; c++) {
    const colCards = getColumnCards(state.grid, c, starter);
    columnScores.push(scoreCribbageHand(colCards, starter.suit));
  }

  return { rowScores, columnScores };
}

function computeCribScore(state: CrossCribState): number {
  const starter = state.starterCard;
  const crib = state.cribCards.filter((c): c is Card => c !== null);
  if (!starter || crib.length !== 4) return 0;
  const five = [...crib, starter];
  return scoreCribbageHand(five, starter.suit);
}

/** Full crib hand score (starter + four crib cards). */
export function getCribHandScore(state: CrossCribState): number {
  return computeCribScore(state);
}

/** Dealer (2p) or dealer team names (4p), for HUD / round summary. */
export function cribOwnerLabel(state: CrossCribState): string {
  const dealer = state.players[state.dealerIndex];
  if (!dealer) return '';
  if (state.players.length === 2) return dealer.name;
  const partnerIdx = (state.dealerIndex + 2) % 4;
  const partner = state.players[partnerIdx];
  if (!partner) return dealer.name;
  const a = Math.min(state.dealerIndex, partnerIdx);
  const b = Math.max(state.dealerIndex, partnerIdx);
  return `${state.players[a].name} & ${state.players[b].name}`;
}

function buildRoundSummary(state: CrossCribState, cribScore: number): string {
  const { rowScores, columnScores } = recomputeScores(state);
  const rowTotal = rowScores.reduce((a, b) => a + b, 0);
  const colTotal = columnScores.reduce((a, b) => a + b, 0);
  const cribLine = ` · Crib ${cribScore} (${cribOwnerLabel(state)})`;

  if (state.players.length === 2) {
    const p0 = state.players[0];
    const p1 = state.players[1];
    return `${p0.name}: ${rowTotal} · ${p1.name}: ${colTotal}${cribLine}`;
  }

  const team0 = `${state.players[0].name} & ${state.players[2].name}`;
  const team1 = `${state.players[1].name} & ${state.players[3].name}`;
  return `${team0}: ${rowTotal} · ${team1}: ${colTotal}${cribLine}`;
}

function countFilledCells(grid: CrossCribState['grid']): number {
  let n = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (grid[r][c]) n++;
    }
  }
  return n;
}

/** First index where `need` consecutive slots are null (left-packed crib in confirmation order). */
function firstConsecutiveNullRun(crib: (Card | null)[], need: number): number {
  if (need <= 0 || need > 4) return -1;
  for (let start = 0; start <= 4 - need; start++) {
    let ok = true;
    for (let j = 0; j < need; j++) {
      if (crib[start + j] !== null) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return -1;
}

function selectionIsValidSubset(hand: Card[], cards: Card[]): boolean {
  if (cards.length === 0) return true;
  const used = hand.map(() => false);
  for (const c of cards) {
    const idx = hand.findIndex((h, i) => !used[i] && cardEquals(h, c));
    if (idx === -1) return false;
    used[idx] = true;
  }
  return true;
}

function cardsArePairwiseDistinct(cards: Card[]): boolean {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cardEquals(cards[i], cards[j])) return false;
    }
  }
  return true;
}

function startRound(
  players: CrossCribPlayer[],
  roundNumber: number,
  dealerIndex: number
): CrossCribState {
  const playerCount = players.length;
  const cardsPerPlayer = playerCount === 2 ? 14 : 7;
  const deck = shuffle(createDeck());
  let cursor = 0;

  const starterCard = deck[cursor++] ?? null;
  const grid = createEmptyGrid() as CrossCribState['grid'];
  grid[2][2] = starterCard ? { card: starterCard, playerId: '' } : null;

  const dealtPlayers: CrossCribPlayer[] = players.map((p) => {
    const hand = sortHand(deck.slice(cursor, cursor + cardsPerPlayer));
    cursor += cardsPerPlayer;
    return { ...p, hand };
  });

  const firstToPlay = (dealerIndex + 1) % playerCount;
  const { rowScores, columnScores } = { rowScores: [0, 0, 0, 0, 0], columnScores: [0, 0, 0, 0, 0] };

  return {
    players: dealtPlayers,
    phase: 'crib-discard',
    roundNumber,
    dealerIndex,
    currentPlayerIndex: firstToPlay,
    grid,
    starterCard,
    rowScores,
    columnScores,
    roundSummary: '',
    gameOver: false,
    winners: [],
    cribCards: [null, null, null, null],
    cribSelections: {},
    cribConfirmed: {},
    cribRevealCount: 0,
  };
}

function endRound(state: CrossCribState): CrossCribState {
  const { rowScores, columnScores } = recomputeScores(state);
  const rowTotal = rowScores.reduce((a, b) => a + b, 0);
  const colTotal = columnScores.reduce((a, b) => a + b, 0);
  const cribScore = computeCribScore(state);
  const dealerParity = state.dealerIndex % 2;

  const playerCount = state.players.length;
  const updatedPlayers = state.players.map((p, i) => {
    let add = 0;
    if (playerCount === 2) {
      add = i === 0 ? rowTotal : colTotal;
      if (i === state.dealerIndex) add += cribScore;
    } else {
      add = i % 2 === 0 ? rowTotal : colTotal;
      if (i % 2 === dealerParity) add += cribScore;
    }
    return { ...p, totalScore: p.totalScore + add };
  });

  const isLastRound = state.roundNumber >= 4;
  const winners = isLastRound
    ? (() => {
        if (playerCount === 2) {
          const max = Math.max(...updatedPlayers.map(p => p.totalScore));
          return updatedPlayers.filter(p => p.totalScore === max).map(p => p.id);
        }
        const team0Score = updatedPlayers[0].totalScore;
        const team1Score = updatedPlayers[1].totalScore;
        if (team0Score > team1Score) return [updatedPlayers[0].id, updatedPlayers[2].id];
        if (team1Score > team0Score) return [updatedPlayers[1].id, updatedPlayers[3].id];
        return updatedPlayers.map(p => p.id);
      })()
    : [];

  return {
    ...state,
    players: updatedPlayers,
    phase: 'round-end',
    rowScores,
    columnScores,
    cribRevealCount: 4,
    roundSummary: buildRoundSummary({ ...state, players: updatedPlayers, rowScores, columnScores }, cribScore),
    gameOver: isLastRound,
    winners,
  };
}

export function createCrossCribState(players: Player[]): CrossCribState {
  const count = players.length === 2 ? 2 : 4;
  const actualPlayers = players.slice(0, count);

  const initialPlayers: CrossCribPlayer[] = actualPlayers.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: p.isBot,
    hand: [],
    totalScore: 0,
  }));

  return startRound(initialPlayers, 1, 0);
}

export function processCrossCribAction(
  state: unknown,
  action: unknown,
  playerId: string
): unknown {
  const s = state as CrossCribState;
  const a = action as {
    type: string;
    card?: Card;
    row?: number;
    col?: number;
    cards?: Card[];
  };

  if (s.phase === 'game-over' && a.type !== 'show-final-results') return state;
  if (s.gameOver && a.type !== 'start-next-round' && a.type !== 'show-final-results') return state;

  switch (a.type) {
    case 'select-crib-discard': {
      if (s.phase !== 'crib-discard') return state;
      const need = cribCardsToSelect(s.players.length);
      const cards = a.cards;
      if (!cards || cards.length > need || !cardsArePairwiseDistinct(cards)) return state;

      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex === -1) return state;
      if (s.cribConfirmed[playerId]) return state;

      const player = s.players[pIndex];
      if (!selectionIsValidSubset(player.hand, cards)) return state;

      return {
        ...s,
        cribSelections: { ...s.cribSelections, [playerId]: cards },
      };
    }

    case 'confirm-crib-discard': {
      if (s.phase !== 'crib-discard') return state;
      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex === -1) return state;
      const need = cribCardsToSelect(s.players.length);
      const sel = s.cribSelections[playerId];
      if (!sel || sel.length !== need) return state;
      if (s.cribConfirmed[playerId]) return state;

      const cribBase: (Card | null)[] =
        s.cribCards.length === 4 ? [...s.cribCards] : [null, null, null, null];
      const start = firstConsecutiveNullRun(cribBase, need);
      if (start < 0) return state;
      for (let j = 0; j < need; j++) {
        cribBase[start + j] = sel[j]!;
      }

      const player = s.players[pIndex];
      const newHand = sortHand(
        player.hand.filter(c => !sel.some(g => cardEquals(g, c)))
      );
      const newPlayers = s.players.map((p, i) => (i === pIndex ? { ...p, hand: newHand } : p));

      const newConfirmed = { ...s.cribConfirmed, [playerId]: true };
      const cribSelectionsRest = { ...s.cribSelections };
      delete cribSelectionsRest[playerId];

      const allConfirmed = s.players.every(p => newConfirmed[p.id]);
      if (!allConfirmed) {
        return {
          ...s,
          players: newPlayers,
          cribCards: cribBase,
          cribConfirmed: newConfirmed,
          cribSelections: cribSelectionsRest,
        };
      }

      if (!cribBase.every((c): c is Card => c !== null)) return state;

      const firstToPlay = (s.dealerIndex + 1) % s.players.length;

      return {
        ...s,
        players: newPlayers,
        phase: 'playing' as const,
        cribCards: cribBase,
        cribSelections: {},
        cribConfirmed: {},
        currentPlayerIndex: firstToPlay,
        cribRevealCount: 0,
      };
    }

    case 'advance-crib-reveal': {
      if (s.phase !== 'crib-reveal') return state;
      if (s.cribRevealCount < 4) {
        return { ...s, cribRevealCount: s.cribRevealCount + 1 };
      }
      return endRound(s);
    }

    case 'place-card': {
      if (s.phase !== 'playing') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!a.card || typeof a.row !== 'number' || typeof a.col !== 'number') return state;

      const row = a.row;
      const col = a.col;
      if (row < 0 || row > 4 || col < 0 || col > 4) return state;
      if (row === 2 && col === 2) return state;

      if (s.grid[row][col]) return state;

      const player = s.players[playerIndex];
      const cardIndex = player.hand.findIndex(
        c => c.suit === a.card!.suit && c.rank === a.card!.rank
      );
      if (cardIndex === -1) return state;

      const newHand = player.hand.filter((_, i) => i !== cardIndex);
      const newGrid = s.grid.map((r, ri) =>
        r.map((cell, ci) => {
          if (ri === row && ci === col) return { card: a.card!, playerId };
          return cell;
        })
      );

      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...player, hand: newHand };

      const nextState: CrossCribState = {
        ...s,
        players: newPlayers,
        grid: newGrid,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
      };

      const { rowScores, columnScores } = recomputeScores(nextState);
      nextState.rowScores = rowScores;
      nextState.columnScores = columnScores;

      const filled = countFilledCells(newGrid);
      if (filled >= 25) {
        return {
          ...nextState,
          phase: 'crib-reveal' as const,
          cribRevealCount: 0,
        };
      }

      return nextState;
    }

    case 'start-next-round': {
      if (s.phase !== 'round-end' || s.gameOver) return state;
      const nextDealer = (s.dealerIndex + 1) % s.players.length;
      return startRound(s.players, s.roundNumber + 1, nextDealer);
    }

    case 'show-final-results': {
      if (s.phase !== 'round-end' || !s.gameOver) return state;
      return { ...s, phase: 'game-over' as const };
    }
  }

  return state;
}

export function isCrossCribOver(state: unknown): boolean {
  return (state as CrossCribState).phase === 'game-over';
}

export function getCrossCribWinners(state: unknown): string[] {
  return (state as CrossCribState).winners ?? [];
}

function chooseCribDiscardCards(state: CrossCribState, playerIndex: number): Card[] {
  const need = cribCardsToSelect(state.players.length);
  const player = state.players[playerIndex];
  const sorted = [...player.hand].sort((a, b) => a.rank - b.rank);
  return sorted.slice(0, need);
}

export function runCrossCribBotTurn(state: unknown): unknown {
  const s = state as CrossCribState;

  if (s.phase === 'crib-discard') {
    let current = s;
    let changed = false;
    for (let i = 0; i < current.players.length; i++) {
      const bot = current.players[i];
      if (!bot.isBot) continue;
      if (current.cribConfirmed[bot.id]) continue;
      const need = cribCardsToSelect(current.players.length);
      if (!current.cribSelections[bot.id] || current.cribSelections[bot.id].length !== need) {
        const picked = chooseCribDiscardCards(current, i);
        current = processCrossCribAction(current, { type: 'select-crib-discard', cards: picked }, bot.id) as CrossCribState;
        changed = true;
      }
    }
    for (const bot of current.players) {
      if (!bot.isBot) continue;
      if (current.cribConfirmed[bot.id]) continue;
      const need = cribCardsToSelect(current.players.length);
      if (current.cribSelections[bot.id]?.length === need) {
        current = processCrossCribAction(current, { type: 'confirm-crib-discard' }, bot.id) as CrossCribState;
        changed = true;
      }
    }
    return changed ? current : state;
  }

  if (s.phase !== 'playing') return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer?.isBot || currentPlayer.hand.length === 0) return state;

  const playerIndex = s.currentPlayerIndex;
  const isRowTeam = playerIndex % 2 === 0;
  const myCurrentTotal = isRowTeam
    ? s.rowScores.reduce((a, b) => a + b, 0)
    : s.columnScores.reduce((a, b) => a + b, 0);
  const opponentCurrentTotal = isRowTeam
    ? s.columnScores.reduce((a, b) => a + b, 0)
    : s.rowScores.reduce((a, b) => a + b, 0);

  let bestScore = -Infinity;
  let bestMove: { card: Card; row: number; col: number } | null = null;

  for (const card of currentPlayer.hand) {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (i === 2 && j === 2) continue;
        if (s.grid[i][j]) continue;

        const nextState = processCrossCribAction(
          s,
          { type: 'place-card', card, row: i, col: j },
          currentPlayer.id
        ) as CrossCribState;
        if (nextState === s) continue;

        const myNewTotal = isRowTeam
          ? nextState.rowScores.reduce((a, b) => a + b, 0)
          : nextState.columnScores.reduce((a, b) => a + b, 0);
        const opponentNewTotal = isRowTeam
          ? nextState.columnScores.reduce((a, b) => a + b, 0)
          : nextState.rowScores.reduce((a, b) => a + b, 0);

        const myDelta = myNewTotal - myCurrentTotal;
        const opponentDelta = opponentNewTotal - opponentCurrentTotal;
        const moveScore = myDelta - opponentDelta;

        if (moveScore > bestScore) {
          bestScore = moveScore;
          bestMove = { card, row: i, col: j };
        }
      }
    }
  }

  if (bestMove) {
    return processCrossCribAction(
      s,
      { type: 'place-card', card: bestMove.card, row: bestMove.row, col: bestMove.col },
      currentPlayer.id
    );
  }

  const card = currentPlayer.hand[0];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i === 2 && j === 2) continue;
      if (s.grid[i][j]) continue;
      return processCrossCribAction(s, { type: 'place-card', card, row: i, col: j }, currentPlayer.id);
    }
  }

  return state;
}
