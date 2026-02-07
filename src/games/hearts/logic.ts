import type { Player } from '../../networking/types';
import type { HeartsState, HeartsAction, HeartsPlayer, Card, Suit, Rank, PassDirection } from './types';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

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

function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.rank - b.rank;
  });
}

function cardPoints(card: Card): number {
  if (card.suit === 'hearts') return 1;
  if (card.suit === 'spades' && card.rank === 12) return 13; // Queen of spades
  return 0;
}

const PASS_DIRECTIONS: PassDirection[] = ['left', 'right', 'across', 'none'];

function getPassDirection(roundNumber: number): PassDirection {
  return PASS_DIRECTIONS[(roundNumber - 1) % 4];
}

function getPassTargetIndex(fromIndex: number, direction: PassDirection, playerCount: number): number {
  switch (direction) {
    case 'left': return (fromIndex + 1) % playerCount;
    case 'right': return (fromIndex - 1 + playerCount) % playerCount;
    case 'across': return (fromIndex + 2) % playerCount;
    case 'none': return fromIndex;
  }
}

export function createHeartsState(players: Player[]): HeartsState {
  // Hearts needs exactly 4 players
  const gamePlayers = players.slice(0, 4);
  const deck = shuffle(createDeck());

  const heartsPlayers: HeartsPlayer[] = gamePlayers.map((p, i) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    hand: sortHand(deck.slice(i * 13, (i + 1) * 13)),
    tricksTaken: [],
    roundScore: 0,
    totalScore: 0,
  }));

  const passDir = getPassDirection(1);

  return {
    players: heartsPlayers,
    phase: passDir === 'none' ? 'playing' : 'passing',
    passDirection: passDir,
    passSelections: {},
    currentTrick: [],
    currentPlayerIndex: findTwoOfClubs(heartsPlayers),
    leadPlayerIndex: findTwoOfClubs(heartsPlayers),
    heartsBroken: false,
    trickNumber: 1,
    roundNumber: 1,
    gameOver: false,
    winner: null,
  };
}

function findTwoOfClubs(players: HeartsPlayer[]): number {
  for (let i = 0; i < players.length; i++) {
    if (players[i].hand.some(c => c.suit === 'clubs' && c.rank === 2)) return i;
  }
  return 0;
}

function isValidPlay(state: HeartsState, playerIndex: number, card: Card): boolean {
  const player = state.players[playerIndex];
  const hand = player.hand;

  // First trick first card must be 2 of clubs
  if (state.trickNumber === 1 && state.currentTrick.length === 0) {
    return card.suit === 'clubs' && card.rank === 2;
  }

  // Must follow suit if possible
  if (state.currentTrick.length > 0) {
    const leadSuit = state.currentTrick[0].card.suit;
    const hasSuit = hand.some(c => c.suit === leadSuit);
    if (hasSuit && card.suit !== leadSuit) return false;
  }

  // Can't lead hearts unless broken (or only hearts left)
  if (state.currentTrick.length === 0 && card.suit === 'hearts' && !state.heartsBroken) {
    const hasNonHearts = hand.some(c => c.suit !== 'hearts');
    if (hasNonHearts) return false;
  }

  // Can't play points on first trick (unless only points in hand)
  if (state.trickNumber === 1 && state.currentTrick.length > 0) {
    const leadSuit = state.currentTrick[0].card.suit;
    const hasSuit = hand.some(c => c.suit === leadSuit);
    if (!hasSuit) {
      const isPointCard = cardPoints(card) > 0;
      if (isPointCard) {
        const hasNonPointCards = hand.some(c => cardPoints(c) === 0);
        if (hasNonPointCards) return false;
      }
    }
  }

  return true;
}

export function processHeartsAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as HeartsState;
  const a = action as HeartsAction;

  if (s.gameOver) return state;

  switch (a.type) {
    case 'select-pass': {
      if (s.phase !== 'passing') return state;
      if (a.cards.length !== 3) return state;
      return { ...s, passSelections: { ...s.passSelections, [playerId]: a.cards } };
    }

    case 'confirm-pass': {
      if (s.phase !== 'passing') return state;
      // Check all players have selected
      const allSelected = s.players.every(p => {
        const sel = s.passSelections[p.id];
        return sel && sel.length === 3;
      });
      if (!allSelected) return state;

      // Build a map of who passes to whom
      const passMap: Record<number, Card[]> = {};
      const receiveMap: Record<number, Card[]> = {};

      for (let i = 0; i < s.players.length; i++) {
        const target = getPassTargetIndex(i, s.passDirection, s.players.length);
        passMap[i] = s.passSelections[s.players[i].id] || [];
        if (!receiveMap[target]) receiveMap[target] = [];
        receiveMap[target] = [...(receiveMap[target] || []), ...(s.passSelections[s.players[i].id] || [])];
      }

      const updatedPlayers = s.players.map((p, i) => {
        const giving = passMap[i] || [];
        const receiving = receiveMap[i] || [];
        const newHand = sortHand([
          ...p.hand.filter(c => !giving.some(g => cardEquals(g, c))),
          ...receiving,
        ]);
        return { ...p, hand: newHand };
      });

      const startIdx = findTwoOfClubs(updatedPlayers);

      return {
        ...s,
        players: updatedPlayers,
        phase: 'playing' as const,
        passSelections: {},
        currentPlayerIndex: startIdx,
        leadPlayerIndex: startIdx,
      };
    }

    case 'play-card': {
      if (s.phase !== 'playing') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;

      if (!isValidPlay(s, playerIndex, a.card)) return state;

      const player = s.players[playerIndex];
      const newHand = player.hand.filter(c => !cardEquals(c, a.card));
      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...player, hand: newHand };

      const newTrick = [...s.currentTrick, { playerId, card: a.card }];
      let heartsBroken = s.heartsBroken || a.card.suit === 'hearts';

      // Trick complete?
      if (newTrick.length === s.players.length) {
        // Determine winner
        const leadSuit = newTrick[0].card.suit;
        let winnerEntry = newTrick[0];
        for (const entry of newTrick.slice(1)) {
          if (entry.card.suit === leadSuit && entry.card.rank > winnerEntry.card.rank) {
            winnerEntry = entry;
          }
        }

        const winnerIndex = newPlayers.findIndex(p => p.id === winnerEntry.playerId);
        const trickCards = newTrick.map(e => e.card);
        const trickPoints = trickCards.reduce((sum, c) => sum + cardPoints(c), 0);

        newPlayers[winnerIndex] = {
          ...newPlayers[winnerIndex],
          tricksTaken: [...newPlayers[winnerIndex].tricksTaken, trickCards],
          roundScore: newPlayers[winnerIndex].roundScore + trickPoints,
        };

        const nextTrick = s.trickNumber + 1;

        // Round over?
        if (nextTrick > 13) {
          return endRound({ ...s, players: newPlayers, heartsBroken });
        }

        return {
          ...s,
          players: newPlayers,
          currentTrick: [],
          currentPlayerIndex: winnerIndex,
          leadPlayerIndex: winnerIndex,
          heartsBroken,
          trickNumber: nextTrick,
        };
      }

      // Next player in trick
      const nextPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;

      return {
        ...s,
        players: newPlayers,
        currentTrick: newTrick,
        currentPlayerIndex: nextPlayerIndex,
        heartsBroken,
      };
    }
  }

  return state;
}

function endRound(s: HeartsState): HeartsState {
  // Check for shoot the moon
  const shooter = s.players.find(p => p.roundScore === 26);

  const newPlayers = s.players.map(p => {
    let roundPts = p.roundScore;
    if (shooter) {
      roundPts = p.id === shooter.id ? 0 : 26;
    }
    return {
      ...p,
      totalScore: p.totalScore + roundPts,
    };
  });

  // Check game over (someone >= 100)
  const isOver = newPlayers.some(p => p.totalScore >= 100);

  if (isOver) {
    const minScore = Math.min(...newPlayers.map(p => p.totalScore));
    const winner = newPlayers.find(p => p.totalScore === minScore)!;
    return {
      ...s,
      players: newPlayers,
      phase: 'round-end',
      gameOver: true,
      winner: winner.id,
    };
  }

  // Start new round
  const nextRound = s.roundNumber + 1;
  const deck = shuffle(createDeck());
  const dealtPlayers = newPlayers.map((p, i) => ({
    ...p,
    hand: sortHand(deck.slice(i * 13, (i + 1) * 13)),
    tricksTaken: [],
    roundScore: 0,
  }));

  const passDir = getPassDirection(nextRound);
  const startIdx = findTwoOfClubs(dealtPlayers);

  return {
    ...s,
    players: dealtPlayers,
    phase: passDir === 'none' ? 'playing' : 'passing',
    passDirection: passDir,
    passSelections: {},
    currentTrick: [],
    currentPlayerIndex: startIdx,
    leadPlayerIndex: startIdx,
    heartsBroken: false,
    trickNumber: 1,
    roundNumber: nextRound,
    gameOver: false,
    winner: null,
  };
}

export function isHeartsOver(state: unknown): boolean {
  return (state as HeartsState).gameOver;
}

// Bot AI
export function runHeartsBotTurn(state: unknown): unknown {
  const s = state as HeartsState;
  if (s.gameOver) return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer.isBot) return state;

  if (s.phase === 'passing') {
    // Bot selects 3 cards to pass: highest hearts, queen of spades, then highest cards
    const hand = [...currentPlayer.hand];
    const selected: Card[] = [];

    // Try to pass queen of spades
    const qos = hand.find(c => c.suit === 'spades' && c.rank === 12);
    if (qos) selected.push(qos);

    // Pass high hearts
    const hearts = hand.filter(c => c.suit === 'hearts').sort((a, b) => b.rank - a.rank);
    for (const h of hearts) {
      if (selected.length >= 3) break;
      if (!selected.some(s => cardEquals(s, h))) selected.push(h);
    }

    // Fill with highest cards
    const remaining = hand.sort((a, b) => b.rank - a.rank);
    for (const c of remaining) {
      if (selected.length >= 3) break;
      if (!selected.some(s => cardEquals(s, c))) selected.push(c);
    }

    const withSelection = processHeartsAction(s, { type: 'select-pass', cards: selected.slice(0, 3) }, currentPlayer.id) as HeartsState;

    // Check if all bots have selected, then confirm
    const allSelected = withSelection.players.every(p => {
      const sel = withSelection.passSelections[p.id];
      return sel && sel.length === 3;
    });

    if (allSelected) {
      return processHeartsAction(withSelection, { type: 'confirm-pass' }, currentPlayer.id);
    }
    return withSelection;
  }

  if (s.phase === 'playing') {
    const hand = currentPlayer.hand;
    const validCards = hand.filter(c => isValidPlay(s, s.currentPlayerIndex, c));

    if (validCards.length === 0) return state;

    // Strategy: play lowest card that follows suit, dump high cards when void
    let chosen: Card;

    if (s.currentTrick.length === 0) {
      // Leading: play lowest non-heart card, or lowest heart if only hearts
      const nonHearts = validCards.filter(c => c.suit !== 'hearts');
      const options = nonHearts.length > 0 ? nonHearts : validCards;
      chosen = options.sort((a, b) => a.rank - b.rank)[0];
    } else {
      const leadSuit = s.currentTrick[0].card.suit;
      const hasSuit = validCards.some(c => c.suit === leadSuit);

      if (hasSuit) {
        // Must follow suit: play highest card that won't win, or lowest
        const suitCards = validCards.filter(c => c.suit === leadSuit).sort((a, b) => a.rank - b.rank);
        const highestPlayed = Math.max(...s.currentTrick.filter(e => e.card.suit === leadSuit).map(e => e.card.rank));
        const underCards = suitCards.filter(c => c.rank < highestPlayed);
        chosen = underCards.length > 0 ? underCards[underCards.length - 1] : suitCards[0];
      } else {
        // Void in suit: dump queen of spades or highest heart
        const qos = validCards.find(c => c.suit === 'spades' && c.rank === 12);
        if (qos) {
          chosen = qos;
        } else {
          const hearts = validCards.filter(c => c.suit === 'hearts').sort((a, b) => b.rank - a.rank);
          if (hearts.length > 0) {
            chosen = hearts[0];
          } else {
            chosen = validCards.sort((a, b) => b.rank - a.rank)[0];
          }
        }
      }
    }

    return processHeartsAction(s, { type: 'play-card', card: chosen }, currentPlayer.id);
  }

  return state;
}
