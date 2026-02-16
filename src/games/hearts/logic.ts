import type { Player } from '../../networking/types';
import type { HeartsState, HeartsAction, HeartsPlayer, Card, Suit, Rank, PassDirection } from './types';
import { isValidHeartsPlay } from './rules';

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
    color: p.color,
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
    passConfirmed: {},
    currentTrick: [],
    currentPlayerIndex: findTwoOfClubs(heartsPlayers),
    leadPlayerIndex: findTwoOfClubs(heartsPlayers),
    heartsBroken: false,
    trickNumber: 1,
    roundNumber: 1,
    gameOver: false,
    winner: null,
    trickWinner: null,
  };
}

function findTwoOfClubs(players: HeartsPlayer[]): number {
  for (let i = 0; i < players.length; i++) {
    if (players[i].hand.some(c => c.suit === 'clubs' && c.rank === 2)) return i;
  }
  return 0;
}

export function processHeartsAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as HeartsState;
  const a = action as HeartsAction;

  if (s.gameOver) return state;

  switch (a.type) {
    case 'select-pass': {
      if (s.phase !== 'passing') return state;
      if (a.cards.length > 3) return state;
      return { ...s, passSelections: { ...s.passSelections, [playerId]: a.cards } };
    }

    case 'confirm-pass': {
      if (s.phase !== 'passing') return state;
      // Verify this player has selected 3 cards
      const mySelection = s.passSelections[playerId];
      if (!mySelection || mySelection.length !== 3) return state;
      // Already confirmed? No-op
      if (s.passConfirmed[playerId]) return state;

      const newConfirmed = { ...s.passConfirmed, [playerId]: true };

      // Check if ALL players have confirmed
      const allConfirmed = s.players.every(p => newConfirmed[p.id]);
      if (!allConfirmed) {
        return { ...s, passConfirmed: newConfirmed };
      }

      // All confirmed — execute the pass
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
        passConfirmed: {},
        currentPlayerIndex: startIdx,
        leadPlayerIndex: startIdx,
      };
    }

    case 'play-card': {
      if (s.phase !== 'playing') return state;
      if (s.trickWinner) return state; // Trick awaiting resolution
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;

      if (!isValidHeartsPlay(s, playerIndex, a.card)) return state;

      const player = s.players[playerIndex];
      const newHand = player.hand.filter(c => !cardEquals(c, a.card));
      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...player, hand: newHand };

      const newTrick = [...s.currentTrick, { playerId, card: a.card }];
      const heartsBroken = s.heartsBroken || a.card.suit === 'hearts';

      // Trick complete? Don't resolve yet — set trickWinner so cards stay visible
      if (newTrick.length === s.players.length) {
        const leadSuit = newTrick[0].card.suit;
        let winnerEntry = newTrick[0];
        for (const entry of newTrick.slice(1)) {
          if (entry.card.suit === leadSuit && entry.card.rank > winnerEntry.card.rank) {
            winnerEntry = entry;
          }
        }

        return {
          ...s,
          players: newPlayers,
          currentTrick: newTrick,
          heartsBroken,
          trickWinner: winnerEntry.playerId,
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

    case 'resolve-trick': {
      if (s.phase !== 'playing' || !s.trickWinner) return state;

      const winnerIndex = s.players.findIndex(p => p.id === s.trickWinner);
      if (winnerIndex === -1) return state;

      const trickCards = s.currentTrick.map(e => e.card);
      const trickPoints = trickCards.reduce((sum, c) => sum + cardPoints(c), 0);

      const newPlayers = [...s.players];
      newPlayers[winnerIndex] = {
        ...newPlayers[winnerIndex],
        tricksTaken: [...newPlayers[winnerIndex].tricksTaken, trickCards],
        roundScore: newPlayers[winnerIndex].roundScore + trickPoints,
      };

      const nextTrick = s.trickNumber + 1;

      // Round over?
      if (nextTrick > 13) {
        return endRound({ ...s, players: newPlayers, heartsBroken: s.heartsBroken, trickWinner: null });
      }

      return {
        ...s,
        players: newPlayers,
        currentTrick: [],
        currentPlayerIndex: winnerIndex,
        leadPlayerIndex: winnerIndex,
        trickNumber: nextTrick,
        trickWinner: null,
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
      trickWinner: null,
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
    passConfirmed: {},
    currentTrick: [],
    currentPlayerIndex: startIdx,
    leadPlayerIndex: startIdx,
    heartsBroken: false,
    trickNumber: 1,
    roundNumber: nextRound,
    gameOver: false,
    winner: null,
    trickWinner: null,
  };
}

export function isHeartsOver(state: unknown): boolean {
  return (state as HeartsState).gameOver;
}

function collectPlayedCards(state: HeartsState): Card[] {
  const cards: Card[] = [];
  for (const player of state.players) {
    for (const trick of player.tricksTaken) {
      cards.push(...trick);
    }
  }
  cards.push(...state.currentTrick.map(entry => entry.card));
  return cards;
}

function countBySuit(cards: Card[]): Record<Suit, number> {
  const counts: Record<Suit, number> = { clubs: 0, diamonds: 0, spades: 0, hearts: 0 };
  for (const card of cards) {
    counts[card.suit]++;
  }
  return counts;
}

function hasCard(cards: Card[], suit: Suit, rank: Rank): boolean {
  return cards.some(card => card.suit === suit && card.rank === rank);
}

function cardsOfSuit(cards: Card[], suit: Suit): Card[] {
  return cards.filter(card => card.suit === suit);
}

function sortByRankAsc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.rank - b.rank);
}

function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank);
}

function rankWeight(rank: Rank): number {
  return (rank - 1) / 13;
}

function getMoonThreatPlayerId(state: HeartsState, myPlayerId: string): string | null {
  const byRoundScore = [...state.players].sort((a, b) => b.roundScore - a.roundScore);
  const leader = byRoundScore[0];
  const runnerUp = byRoundScore[1];
  if (!leader || leader.id === myPlayerId) return null;
  if (leader.roundScore < 10) return null;
  if (leader.roundScore - (runnerUp?.roundScore ?? 0) < 8) return null;
  return leader.id;
}

function getCurrentTrickLeaderId(state: HeartsState): string | null {
  if (state.currentTrick.length === 0) return null;
  const leadSuit = state.currentTrick[0].card.suit;
  let winner = state.currentTrick[0];
  for (const entry of state.currentTrick.slice(1)) {
    if (entry.card.suit === leadSuit && entry.card.rank > winner.card.rank) {
      winner = entry;
    }
  }
  return winner.playerId;
}

function getCurrentTrickPoints(state: HeartsState): number {
  return state.currentTrick.reduce((sum, entry) => sum + cardPoints(entry.card), 0);
}

function getHigherUnseenCount(state: HeartsState, hand: Card[], card: Card): number {
  const played = collectPlayedCards(state);
  let count = 0;
  for (let rank = card.rank + 1; rank <= 14; rank++) {
    const r = rank as Rank;
    const inHand = hasCard(hand, card.suit, r);
    const alreadyPlayed = hasCard(played, card.suit, r);
    if (!inHand && !alreadyPlayed) count++;
  }
  return count;
}

function getPassCardRisk(state: HeartsState, hand: Card[], card: Card): number {
  let risk = rankWeight(card.rank) * 18;
  const suitCounts = countBySuit(hand);
  const isNearEndgame = state.players.some(p => p.totalScore >= 85);

  if (card.suit === 'spades' && card.rank === 12) risk += 100;
  if (card.suit === 'spades' && (card.rank === 13 || card.rank === 14) && hasCard(hand, 'spades', 12)) risk += 35;
  if (card.suit === 'hearts') risk += rankWeight(card.rank) * 28;
  if (card.rank >= 11 && card.suit !== 'clubs') risk += 8;
  if (isNearEndgame) risk += cardPoints(card) * 20;

  if (suitCounts[card.suit] <= 2) risk += 6;
  if (card.suit === 'clubs' && card.rank <= 5) risk -= 8;
  if (card.suit === 'diamonds' && card.rank <= 5) risk -= 5;

  return risk;
}

export function chooseHeartsPassCards(state: HeartsState, playerIndex: number): Card[] {
  const player = state.players[playerIndex];
  if (!player) return [];

  const selected: Card[] = [];
  const workingHand = [...player.hand];

  while (selected.length < 3 && workingHand.length > 0) {
    const suitCounts = countBySuit(workingHand);
    let bestCard = workingHand[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const card of workingHand) {
      let score = getPassCardRisk(state, workingHand, card);
      const postRemovalSuitCount = suitCounts[card.suit] - 1;
      if (postRemovalSuitCount === 0 && card.suit !== 'clubs') score += 7;
      if (postRemovalSuitCount === 0 && card.suit === 'clubs' && state.trickNumber <= 3) score -= 4;
      if (state.passDirection === 'across') score += rankWeight(card.rank) * 5;
      if (state.passDirection === 'none') score -= 1000;

      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    selected.push(bestCard);
    const nextHand = workingHand.filter(c => !cardEquals(c, bestCard));
    workingHand.length = 0;
    workingHand.push(...nextHand);
  }

  return selected;
}

function chooseLeadCard(state: HeartsState, hand: Card[], validCards: Card[]): Card {
  const suitCounts = countBySuit(hand);
  let bestCard = validCards[0];
  let bestScore = Number.POSITIVE_INFINITY;
  const isNearEndgame = state.players[state.currentPlayerIndex].totalScore >= 85;

  for (const card of validCards) {
    let score = rankWeight(card.rank) * 40;
    const higherUnseen = getHigherUnseenCount(state, hand, card);
    score -= higherUnseen * 8;
    score += (5 - Math.min(suitCounts[card.suit], 5)) * 4;

    if (card.suit === 'hearts') score += 20;
    if (card.suit === 'spades' && card.rank >= 12) score += 26;
    if (isNearEndgame) score += cardPoints(card) * 30;

    if (score < bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }

  return bestCard;
}

function chooseFollowSuitCard(state: HeartsState, suitCards: Card[], myPlayer: HeartsPlayer): Card {
  const sortedSuitCards = sortByRankAsc(suitCards);
  const leadSuit = state.currentTrick[0].card.suit;
  const highestPlayed = Math.max(...state.currentTrick.filter(entry => entry.card.suit === leadSuit).map(entry => entry.card.rank));
  const underCards = sortedSuitCards.filter(card => card.rank < highestPlayed);
  const winningCards = sortedSuitCards.filter(card => card.rank > highestPlayed);
  const trickPoints = getCurrentTrickPoints(state);
  const moonThreatPlayerId = getMoonThreatPlayerId(state, myPlayer.id);
  const currentLeader = getCurrentTrickLeaderId(state);
  const isNearEndgame = myPlayer.totalScore >= 85;

  if (underCards.length > 0) {
    if (moonThreatPlayerId && currentLeader === moonThreatPlayerId && trickPoints > 0 && winningCards.length > 0 && !isNearEndgame) {
      return winningCards[0];
    }
    return underCards[underCards.length - 1];
  }

  return sortedSuitCards[0];
}

function chooseDiscardCard(state: HeartsState, validCards: Card[], myPlayer: HeartsPlayer): Card {
  const moonThreatPlayerId = getMoonThreatPlayerId(state, myPlayer.id);
  const currentLeader = getCurrentTrickLeaderId(state);
  const shouldAvoidGivingPoints = moonThreatPlayerId !== null && currentLeader === moonThreatPlayerId;
  const isNearEndgame = myPlayer.totalScore >= 85;
  const pointCards = validCards.filter(card => cardPoints(card) > 0);
  const nonPointCards = validCards.filter(card => cardPoints(card) === 0);

  if (shouldAvoidGivingPoints && nonPointCards.length > 0) {
    return sortByRankDesc(nonPointCards)[0];
  }

  if (pointCards.length > 0) {
    const qos = pointCards.find(card => card.suit === 'spades' && card.rank === 12);
    if (qos) return qos;
    if (isNearEndgame) return sortByRankDesc(pointCards)[0];
    const hearts = pointCards.filter(card => card.suit === 'hearts');
    if (hearts.length > 0) return sortByRankDesc(hearts)[0];
    return sortByRankDesc(pointCards)[0];
  }

  const spadeThreats = validCards.filter(card => card.suit === 'spades' && (card.rank === 13 || card.rank === 14));
  if (spadeThreats.length > 0 && !hasCard(collectPlayedCards(state), 'spades', 12)) {
    return sortByRankDesc(spadeThreats)[0];
  }

  return sortByRankDesc(validCards)[0];
}

export function chooseHeartsPlayCard(state: HeartsState, playerIndex: number): Card | null {
  const player = state.players[playerIndex];
  if (!player) return null;

  const hand = player.hand;
  const validCards = hand.filter(card => isValidHeartsPlay(state, playerIndex, card));
  if (validCards.length === 0) return null;

  if (state.currentTrick.length === 0) {
    return chooseLeadCard(state, hand, validCards);
  }

  const leadSuit = state.currentTrick[0].card.suit;
  const suitCards = cardsOfSuit(validCards, leadSuit);
  if (suitCards.length > 0) {
    return chooseFollowSuitCard(state, suitCards, player);
  }

  return chooseDiscardCard(state, validCards, player);
}

// Bot AI
export function runHeartsBotTurn(state: unknown): unknown {
  const s = state as HeartsState;
  if (s.gameOver) return state;

  // During passing phase, all players select simultaneously -- iterate all bots
  if (s.phase === 'passing') {
    let current = s;
    let changed = false;

    for (let i = 0; i < current.players.length; i++) {
      const botPlayer = current.players[i];
      if (!botPlayer.isBot) continue;
      if (current.passSelections[botPlayer.id]?.length === 3) continue;

      const selected = chooseHeartsPassCards(current, i);
      current = processHeartsAction(current, { type: 'select-pass', cards: selected.slice(0, 3) }, botPlayer.id) as HeartsState;
      changed = true;
    }

    // Auto-confirm for all bots that have selected their cards
    for (const botPlayer of current.players) {
      if (!botPlayer.isBot) continue;
      if (current.passConfirmed[botPlayer.id]) continue;
      if (current.passSelections[botPlayer.id]?.length === 3) {
        current = processHeartsAction(current, { type: 'confirm-pass' }, botPlayer.id) as HeartsState;
        changed = true;
      }
    }

    return changed ? current : state;
  }

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer?.isBot) return state;

  // Don't play if trick is awaiting resolution
  if (s.trickWinner) return state;
  if (s.phase !== 'playing') return state;

  const chosen = chooseHeartsPlayCard(s, s.currentPlayerIndex);
  if (!chosen) return state;

  return processHeartsAction(s, { type: 'play-card', card: chosen }, currentPlayer.id);
}
