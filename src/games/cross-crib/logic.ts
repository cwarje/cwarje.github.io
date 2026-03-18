import type { Player } from '../../networking/types';
import type { Card, CrossCribPlayer, CrossCribState } from './types';
import { scoreCribbageHand } from './rules';

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

function buildRoundSummary(state: CrossCribState): string {
  const { rowScores, columnScores } = recomputeScores(state);
  const rowTotal = rowScores.reduce((a, b) => a + b, 0);
  const colTotal = columnScores.reduce((a, b) => a + b, 0);

  if (state.players.length === 2) {
    const p0 = state.players[0];
    const p1 = state.players[1];
    return `${p0.name}: ${rowTotal} · ${p1.name}: ${colTotal}`;
  }

  const team0 = `${state.players[0].name} & ${state.players[2].name}`;
  const team1 = `${state.players[1].name} & ${state.players[3].name}`;
  return `${team0}: ${rowTotal} · ${team1}: ${colTotal}`;
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

function startRound(
  players: CrossCribPlayer[],
  roundNumber: number,
  dealerIndex: number
): CrossCribState {
  const playerCount = players.length;
  const cardsPerPlayer = playerCount === 2 ? 12 : 6;
  const deck = shuffle(createDeck());
  let cursor = 0;

  const starterCard = deck[cursor++] ?? null;
  const grid = createEmptyGrid() as CrossCribState['grid'];
  grid[2][2] = starterCard ? { card: starterCard, playerId: '' } : null;

  const dealtPlayers: CrossCribPlayer[] = players.map((p) => {
    const hand = deck.slice(cursor, cursor + cardsPerPlayer);
    cursor += cardsPerPlayer;
    return { ...p, hand };
  });

  const firstToPlay = (dealerIndex + 1) % playerCount;
  const { rowScores, columnScores } = { rowScores: [0, 0, 0, 0, 0], columnScores: [0, 0, 0, 0, 0] };

  return {
    players: dealtPlayers,
    phase: 'playing',
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
  };
}

function endRound(state: CrossCribState): CrossCribState {
  const { rowScores, columnScores } = recomputeScores(state);
  const rowTotal = rowScores.reduce((a, b) => a + b, 0);
  const colTotal = columnScores.reduce((a, b) => a + b, 0);

  const playerCount = state.players.length;
  const updatedPlayers = state.players.map((p, i) => {
    let add = 0;
    if (playerCount === 2) {
      add = i === 0 ? rowTotal : colTotal;
    } else {
      add = i % 2 === 0 ? rowTotal : colTotal;
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
    roundSummary: buildRoundSummary({ ...state, players: updatedPlayers, rowScores, columnScores }),
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
  const a = action as { type: string; card?: Card; row?: number; col?: number };

  if (s.phase === 'game-over' && a.type !== 'show-final-results') return state;
  if (s.gameOver && a.type !== 'start-next-round' && a.type !== 'show-final-results') return state;

  switch (a.type) {
    case 'place-card': {
      if (s.phase !== 'playing') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!a.card || typeof a.row !== 'number' || typeof a.col !== 'number') return state;

      const row = a.row;
      const col = a.col;
      if (row < 0 || row > 4 || col < 0 || col > 4) return state;
      if (row === 2 && col === 2) return state; // center is starter

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
        return endRound(nextState);
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

export function runCrossCribBotTurn(state: unknown): unknown {
  const s = state as CrossCribState;
  if (s.phase !== 'playing') return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer?.isBot || currentPlayer.hand.length === 0) return state;

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
