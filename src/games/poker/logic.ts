import type { Player } from '../../networking/types';
import type {
  Card, Suit, Rank, Street,
  PokerPlayer, PokerState, PokerAction,
  SidePot, WinnerInfo,
} from './types';

// ────────────────────────────────────────────
// Deck helpers
// ────────────────────────────────────────────

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function drawCards(deck: Card[], n: number): { cards: Card[]; remaining: Card[] } {
  return { cards: deck.slice(0, n), remaining: deck.slice(n) };
}

// ────────────────────────────────────────────
// Hand evaluation
// ────────────────────────────────────────────

// Hand ranks (higher = better)
const HAND_RANK = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
} as const;

type HandScore = number[]; // [handRank, ...tiebreakers]

function getHandName(rank: number): string {
  switch (rank) {
    case 9: return 'Royal Flush';
    case 8: return 'Straight Flush';
    case 7: return 'Four of a Kind';
    case 6: return 'Full House';
    case 5: return 'Flush';
    case 4: return 'Straight';
    case 3: return 'Three of a Kind';
    case 2: return 'Two Pair';
    case 1: return 'Pair';
    default: return 'High Card';
  }
}

function evaluate5(cards: Card[]): HandScore {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Check for straight (handle ace-low: A-2-3-4-5)
  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniqueRanks.length >= 5) {
    // Normal straight check
    if (uniqueRanks[0] - uniqueRanks[4] === 4 && uniqueRanks.length === 5) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    }
    // Ace-low straight (A-2-3-4-5)
    if (!isStraight && uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[2] === 4 && uniqueRanks[3] === 3 && uniqueRanks[4] === 2) {
      isStraight = true;
      straightHigh = 5; // 5-high straight
    }
  }

  // Count ranks
  const counts: Record<number, number> = {};
  ranks.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: Number(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return [HAND_RANK.ROYAL_FLUSH, 14];
    return [HAND_RANK.STRAIGHT_FLUSH, straightHigh];
  }
  if (groups[0].count === 4) {
    return [HAND_RANK.FOUR_OF_A_KIND, groups[0].rank, groups[1].rank];
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return [HAND_RANK.FULL_HOUSE, groups[0].rank, groups[1].rank];
  }
  if (isFlush) {
    return [HAND_RANK.FLUSH, ...ranks];
  }
  if (isStraight) {
    return [HAND_RANK.STRAIGHT, straightHigh];
  }
  if (groups[0].count === 3) {
    const kickers = ranks.filter(r => r !== groups[0].rank);
    return [HAND_RANK.THREE_OF_A_KIND, groups[0].rank, ...kickers];
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const highPair = Math.max(groups[0].rank, groups[1].rank);
    const lowPair = Math.min(groups[0].rank, groups[1].rank);
    const kicker = ranks.find(r => r !== highPair && r !== lowPair)!;
    return [HAND_RANK.TWO_PAIR, highPair, lowPair, kicker];
  }
  if (groups[0].count === 2) {
    const kickers = ranks.filter(r => r !== groups[0].rank);
    return [HAND_RANK.PAIR, groups[0].rank, ...kickers];
  }
  return [HAND_RANK.HIGH_CARD, ...ranks];
}

// Generate all C(n, 5) combinations
function combinations5(cards: Card[]): Card[][] {
  const result: Card[][] = [];
  const n = cards.length;
  for (let i = 0; i < n - 4; i++)
    for (let j = i + 1; j < n - 3; j++)
      for (let k = j + 1; k < n - 2; k++)
        for (let l = k + 1; l < n - 1; l++)
          for (let m = l + 1; m < n; m++)
            result.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
  return result;
}

function compareHandScores(a: HandScore, b: HandScore): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function bestHand(holeCards: Card[], communityCards: Card[]): { score: HandScore; name: string } {
  const allCards = [...holeCards, ...communityCards];
  const combos = combinations5(allCards);
  let best = evaluate5(combos[0]);
  for (let i = 1; i < combos.length; i++) {
    const score = evaluate5(combos[i]);
    if (compareHandScores(score, best) > 0) {
      best = score;
    }
  }
  return { score: best, name: getHandName(best[0]) };
}

// ────────────────────────────────────────────
// Position helpers
// ────────────────────────────────────────────

function nextActiveIndex(players: PokerPlayer[], from: number): number {
  const n = players.length;
  let idx = (from + 1) % n;
  let safety = 0;
  while (safety < n) {
    if (!players[idx].folded && !players[idx].allIn) return idx;
    idx = (idx + 1) % n;
    safety++;
  }
  return -1; // no active players
}

function countActive(players: PokerPlayer[]): number {
  return players.filter(p => !p.folded && !p.allIn).length;
}

function countNotFolded(players: PokerPlayer[]): number {
  return players.filter(p => !p.folded).length;
}

// ────────────────────────────────────────────
// Side-pot calculation
// ────────────────────────────────────────────

function calculateSidePots(players: PokerPlayer[]): SidePot[] {
  // Get unique contribution levels from non-folded and all-in players
  const contribs = players
    .filter(p => p.totalContrib > 0)
    .map(p => p.totalContrib);
  const levels = [...new Set(contribs)].sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let prevLevel = 0;

  for (const level of levels) {
    const increment = level - prevLevel;
    if (increment <= 0) continue;

    // Every player who contributed at least this level is eligible (if not folded)
    const eligible = players
      .filter(p => p.totalContrib >= level && !p.folded)
      .map(p => p.id);

    // Amount = increment * number of players who contributed at least this level
    const contributors = players.filter(p => p.totalContrib >= level).length;
    const amount = increment * contributors;

    if (amount > 0 && eligible.length > 0) {
      pots.push({ amount, eligiblePlayerIds: eligible });
    }

    prevLevel = level;
  }

  return pots;
}

// ────────────────────────────────────────────
// Create initial state
// ────────────────────────────────────────────

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

export function createPokerState(players: Player[]): PokerState {
  let deck = shuffleDeck(buildDeck());

  const pokerPlayers: PokerPlayer[] = players.map(p => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    chips: STARTING_CHIPS,
    holeCards: [],
    folded: false,
    allIn: false,
    betThisStreet: 0,
    totalContrib: 0,
    leftGame: false,
  }));

  const n = pokerPlayers.length;
  const dealerIndex = 0;

  // Post blinds
  const sbIndex = n === 2 ? dealerIndex : (dealerIndex + 1) % n;
  const bbIndex = n === 2 ? (dealerIndex + 1) % n : (dealerIndex + 2) % n;

  const sbAmount = Math.min(SMALL_BLIND, pokerPlayers[sbIndex].chips);
  pokerPlayers[sbIndex].chips -= sbAmount;
  pokerPlayers[sbIndex].betThisStreet = sbAmount;
  pokerPlayers[sbIndex].totalContrib = sbAmount;
  if (pokerPlayers[sbIndex].chips === 0) pokerPlayers[sbIndex].allIn = true;

  const bbAmount = Math.min(BIG_BLIND, pokerPlayers[bbIndex].chips);
  pokerPlayers[bbIndex].chips -= bbAmount;
  pokerPlayers[bbIndex].betThisStreet = bbAmount;
  pokerPlayers[bbIndex].totalContrib = bbAmount;
  if (pokerPlayers[bbIndex].chips === 0) pokerPlayers[bbIndex].allIn = true;

  // Deal 2 hole cards to each player
  for (let i = 0; i < n; i++) {
    const draw = drawCards(deck, 2);
    pokerPlayers[i].holeCards = draw.cards;
    deck = draw.remaining;
  }

  // First to act preflop: left of big blind
  const firstToAct = nextActiveIndex(pokerPlayers, bbIndex);

  return {
    players: pokerPlayers,
    dealerIndex,
    deck,
    communityCards: [],
    street: 'preflop',
    pots: [],
    currentBet: BIG_BLIND,
    minRaise: BIG_BLIND, // min raise size = big blind
    currentPlayerIndex: firstToAct === -1 ? 0 : firstToAct,
    lastAggressorIndex: bbIndex, // BB is the "initial aggressor"
    actedThisStreet: {},
    gameOver: false,
    winners: [],
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    showdownReveal: false,
    handNumber: 1,
    sessionOver: false,
  };
}

// ────────────────────────────────────────────
// Start next hand (continuous play)
// ────────────────────────────────────────────

function startNextHand(prevState: PokerState): PokerState {
  // Filter out players who left or are busted (0 chips)
  const eligiblePlayers = prevState.players.filter(p => !p.leftGame && p.chips > 0);

  // Not enough players to continue
  if (eligiblePlayers.length < 2) {
    return {
      ...prevState,
      sessionOver: true,
    };
  }

  let deck = shuffleDeck(buildDeck());

  // Reset per-hand fields, preserve chips
  const pokerPlayers: PokerPlayer[] = eligiblePlayers.map(p => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    chips: p.chips,
    holeCards: [],
    folded: false,
    allIn: false,
    betThisStreet: 0,
    totalContrib: 0,
    leftGame: false,
  }));

  const n = pokerPlayers.length;

  // Rotate dealer: find the previous dealer's id and move to next position
  const prevDealerId = prevState.players[prevState.dealerIndex]?.id;
  let newDealerIndex = 0;
  if (prevDealerId) {
    const prevDealerPos = pokerPlayers.findIndex(p => p.id === prevDealerId);
    if (prevDealerPos >= 0) {
      newDealerIndex = (prevDealerPos + 1) % n;
    }
  }

  // Post blinds
  const sbIndex = n === 2 ? newDealerIndex : (newDealerIndex + 1) % n;
  const bbIndex = n === 2 ? (newDealerIndex + 1) % n : (newDealerIndex + 2) % n;

  const sbAmount = Math.min(SMALL_BLIND, pokerPlayers[sbIndex].chips);
  pokerPlayers[sbIndex].chips -= sbAmount;
  pokerPlayers[sbIndex].betThisStreet = sbAmount;
  pokerPlayers[sbIndex].totalContrib = sbAmount;
  if (pokerPlayers[sbIndex].chips === 0) pokerPlayers[sbIndex].allIn = true;

  const bbAmount = Math.min(BIG_BLIND, pokerPlayers[bbIndex].chips);
  pokerPlayers[bbIndex].chips -= bbAmount;
  pokerPlayers[bbIndex].betThisStreet = bbAmount;
  pokerPlayers[bbIndex].totalContrib = bbAmount;
  if (pokerPlayers[bbIndex].chips === 0) pokerPlayers[bbIndex].allIn = true;

  // Deal 2 hole cards to each player
  for (let i = 0; i < n; i++) {
    const draw = drawCards(deck, 2);
    pokerPlayers[i].holeCards = draw.cards;
    deck = draw.remaining;
  }

  // First to act preflop: left of big blind
  const firstToAct = nextActiveIndex(pokerPlayers, bbIndex);

  return {
    players: pokerPlayers,
    dealerIndex: newDealerIndex,
    deck,
    communityCards: [],
    street: 'preflop',
    pots: [],
    currentBet: BIG_BLIND,
    minRaise: BIG_BLIND,
    currentPlayerIndex: firstToAct === -1 ? 0 : firstToAct,
    lastAggressorIndex: bbIndex,
    actedThisStreet: {},
    gameOver: false,
    winners: [],
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    showdownReveal: false,
    handNumber: prevState.handNumber + 1,
    sessionOver: false,
  };
}

// ────────────────────────────────────────────
// Remove player from poker (leave mid-game)
// ────────────────────────────────────────────

function removePlayerFromPoker(s: PokerState, playerId: string): PokerState {
  const playerIndex = s.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return s;

  const newPlayers = s.players.map(p => ({ ...p }));
  const leavingPlayer = newPlayers[playerIndex];

  // Mark as left and folded
  leavingPlayer.leftGame = true;
  leavingPlayer.folded = true;

  // If the game is already over (between hands), just mark and return
  if (s.gameOver) {
    return { ...s, players: newPlayers };
  }

  // Check if only one player left not folded -> resolve hand
  if (countNotFolded(newPlayers) === 1) {
    return resolveHand(s, newPlayers);
  }

  // If it was the leaving player's turn, advance to next player
  let newCurrentPlayerIndex = s.currentPlayerIndex;
  let newActed = { ...s.actedThisStreet };

  if (s.currentPlayerIndex === playerIndex) {
    newActed[leavingPlayer.id] = true;
    const nextIdx = nextActiveIndex(newPlayers, playerIndex);
    newCurrentPlayerIndex = nextIdx === -1 ? s.currentPlayerIndex : nextIdx;

    // Check if street is complete after their fold
    const streetComplete = isStreetComplete(newPlayers, newActed, s.currentBet);
    if (streetComplete) {
      return advanceStreet({
        ...s,
        players: newPlayers,
        currentPlayerIndex: newCurrentPlayerIndex,
        actedThisStreet: newActed,
      });
    }
  }

  return {
    ...s,
    players: newPlayers,
    currentPlayerIndex: newCurrentPlayerIndex,
    actedThisStreet: newActed,
  };
}

// ────────────────────────────────────────────
// Process action
// ────────────────────────────────────────────

export function processPokerAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as PokerState;
  const a = action as PokerAction;

  // Handle next-hand action (host triggers between hands)
  if (a.type === 'next-hand' && s.gameOver && !s.sessionOver) {
    return startNextHand(s);
  }

  // Handle leave-table action (player leaves mid-game)
  if (a.type === 'leave-table') {
    return removePlayerFromPoker(s, playerId);
  }

  if (s.gameOver || s.street === 'showdown') return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return state;
  if (currentPlayer.folded || currentPlayer.allIn) return state;

  const newPlayers = s.players.map(p => ({ ...p }));
  const me = newPlayers[s.currentPlayerIndex];
  let newCurrentBet = s.currentBet;
  let newMinRaise = s.minRaise;
  let newLastAggressor = s.lastAggressorIndex;
  const newActed = { ...s.actedThisStreet };

  switch (a.type) {
    case 'fold': {
      me.folded = true;
      break;
    }
    case 'check': {
      // Can only check if no bet to call
      if (s.currentBet > me.betThisStreet) return state;
      break;
    }
    case 'call': {
      const toCall = Math.min(s.currentBet - me.betThisStreet, me.chips);
      me.chips -= toCall;
      me.betThisStreet += toCall;
      me.totalContrib += toCall;
      if (me.chips === 0) me.allIn = true;
      break;
    }
    case 'raise': {
      const raiseTotal = a.amount; // total bet amount this street
      // Validate raise
      const minTotal = s.currentBet + s.minRaise;
      // All-in for less is allowed
      const isAllIn = raiseTotal >= me.betThisStreet + me.chips;
      if (!isAllIn && raiseTotal < minTotal) return state;

      const actualTotal = isAllIn ? me.betThisStreet + me.chips : raiseTotal;
      const toAdd = actualTotal - me.betThisStreet;
      me.chips -= toAdd;
      const raiseSize = actualTotal - s.currentBet;
      if (raiseSize > newMinRaise) newMinRaise = raiseSize;
      me.betThisStreet = actualTotal;
      me.totalContrib += toAdd;
      newCurrentBet = actualTotal;
      if (me.chips === 0) me.allIn = true;
      newLastAggressor = s.currentPlayerIndex;
      // Reset acted for everyone else (they need to act again)
      Object.keys(newActed).forEach(k => { if (k !== me.id) delete newActed[k]; });
      break;
    }
    default:
      return state;
  }

  newActed[me.id] = true;
  newPlayers[s.currentPlayerIndex] = me;

  // Check if only one player left not folded
  if (countNotFolded(newPlayers) === 1) {
    return resolveHand(s, newPlayers);
  }

  // Check if street betting is complete
  const streetComplete = isStreetComplete(newPlayers, newActed, newCurrentBet);

  if (streetComplete) {
    return advanceStreet({
      ...s,
      players: newPlayers,
      currentBet: newCurrentBet,
      minRaise: newMinRaise,
      lastAggressorIndex: newLastAggressor,
      actedThisStreet: newActed,
    });
  }

  // Move to next active player
  const nextIdx = nextActiveIndex(newPlayers, s.currentPlayerIndex);

  return {
    ...s,
    players: newPlayers,
    currentBet: newCurrentBet,
    minRaise: newMinRaise,
    currentPlayerIndex: nextIdx === -1 ? s.currentPlayerIndex : nextIdx,
    lastAggressorIndex: newLastAggressor,
    actedThisStreet: newActed,
  };
}

function isStreetComplete(players: PokerPlayer[], acted: Record<string, boolean>, currentBet: number): boolean {
  for (const p of players) {
    if (p.folded || p.allIn) continue;
    if (!acted[p.id]) return false;
    if (p.betThisStreet < currentBet) return false;
  }
  return true;
}

function advanceStreet(s: PokerState): PokerState {
  const nextStreetMap: Record<Street, Street> = {
    preflop: 'flop',
    flop: 'turn',
    turn: 'river',
    river: 'showdown',
    showdown: 'showdown',
  };
  const nextStreet = nextStreetMap[s.street];

  // Reset per-street bets
  const newPlayers = s.players.map(p => ({
    ...p,
    betThisStreet: 0,
  }));

  let newDeck = [...s.deck];
  let newCommunityCards = [...s.communityCards];

  // Deal community cards
  if (nextStreet === 'flop') {
    const draw = drawCards(newDeck, 3);
    newCommunityCards = [...newCommunityCards, ...draw.cards];
    newDeck = draw.remaining;
  } else if (nextStreet === 'turn' || nextStreet === 'river') {
    const draw = drawCards(newDeck, 1);
    newCommunityCards = [...newCommunityCards, ...draw.cards];
    newDeck = draw.remaining;
  }

  if (nextStreet === 'showdown' || countActive(newPlayers) === 0) {
    return resolveHand(
      { ...s, communityCards: newCommunityCards, deck: newDeck, players: newPlayers, street: nextStreet },
      newPlayers,
    );
  }

  // First to act post-flop: first active player left of dealer
  const firstToAct = nextActiveIndex(newPlayers, s.dealerIndex);

  return {
    ...s,
    players: newPlayers,
    deck: newDeck,
    communityCards: newCommunityCards,
    street: nextStreet,
    currentBet: 0,
    minRaise: s.bigBlind,
    currentPlayerIndex: firstToAct === -1 ? 0 : firstToAct,
    lastAggressorIndex: -1,
    actedThisStreet: {},
  };
}

// ────────────────────────────────────────────
// Resolve hand (showdown or last player)
// ────────────────────────────────────────────

function resolveHand(s: PokerState, players: PokerPlayer[]): PokerState {
  const notFolded = players.filter(p => !p.folded);

  // If only one player remains, they win everything
  if (notFolded.length === 1) {
    const totalPot = players.reduce((sum, p) => sum + p.totalContrib, 0);
    const winner = notFolded[0];
    const winnersInfo: WinnerInfo[] = [{
      playerId: winner.id,
      amount: totalPot,
      handName: 'Last Standing',
    }];
    const finalPlayers = players.map(p =>
      p.id === winner.id ? { ...p, chips: p.chips + totalPot } : { ...p }
    );
    return {
      ...s,
      players: finalPlayers,
      gameOver: true,
      winners: winnersInfo,
      street: 'showdown',
      showdownReveal: false,
    };
  }

  // Showdown — evaluate hands and distribute pots
  const sidePots = calculateSidePots(players);
  const winnersInfo: WinnerInfo[] = [];
  const chipAwards: Record<string, number> = {};

  for (const pot of sidePots) {
    // Find best hand among eligible
    let bestScore: HandScore | null = null;
    let potWinners: { id: string; handName: string }[] = [];

    for (const pid of pot.eligiblePlayerIds) {
      const player = players.find(p => p.id === pid)!;
      const { score, name } = bestHand(player.holeCards, s.communityCards);

      if (!bestScore || compareHandScores(score, bestScore) > 0) {
        bestScore = score;
        potWinners = [{ id: pid, handName: name }];
      } else if (compareHandScores(score, bestScore) === 0) {
        potWinners.push({ id: pid, handName: name });
      }
    }

    // Split pot among winners
    const share = Math.floor(pot.amount / potWinners.length);
    const remainder = pot.amount - share * potWinners.length;

    potWinners.forEach((w, i) => {
      const award = share + (i === 0 ? remainder : 0); // remainder to first winner
      chipAwards[w.id] = (chipAwards[w.id] || 0) + award;
      // Check if this winner already has an entry
      const existing = winnersInfo.find(wi => wi.playerId === w.id);
      if (existing) {
        existing.amount += award;
      } else {
        winnersInfo.push({ playerId: w.id, amount: award, handName: w.handName });
      }
    });
  }

  const finalPlayers = players.map(p => ({
    ...p,
    chips: p.chips + (chipAwards[p.id] || 0),
  }));

  return {
    ...s,
    players: finalPlayers,
    pots: sidePots,
    gameOver: true,
    winners: winnersInfo,
    street: 'showdown',
    showdownReveal: true,
  };
}

// ────────────────────────────────────────────
// Game over check
// ────────────────────────────────────────────

export function isPokerOver(state: unknown): boolean {
  return (state as PokerState).gameOver;
}

// ────────────────────────────────────────────
// Bot AI (simple heuristic)
// ────────────────────────────────────────────

export function runPokerBotTurn(state: unknown): unknown {
  const s = state as PokerState;
  if (s.gameOver || s.street === 'showdown') return state;

  const current = s.players[s.currentPlayerIndex];
  if (!current.isBot || current.folded || current.allIn) return state;

  const toCall = s.currentBet - current.betThisStreet;

  // Simple heuristic:
  // - If no bet to call: check (70%) or raise small (30%)
  // - If bet to call is small relative to chips: call (60%), raise (15%), fold (25%)
  // - If bet is large: call (30%), fold (60%), raise (10%)

  const rand = Math.random();
  let action: PokerAction;

  if (toCall === 0) {
    // No bet to call
    if (rand < 0.70) {
      action = { type: 'check' };
    } else {
      // Small raise: 2-3x big blind
      const raiseSize = s.bigBlind * (2 + Math.floor(Math.random() * 2));
      const raiseTotal = current.betThisStreet + Math.min(raiseSize, current.chips);
      action = { type: 'raise', amount: raiseTotal };
    }
  } else if (toCall <= current.chips * 0.15) {
    // Small bet relative to stack
    if (rand < 0.60) {
      action = { type: 'call' };
    } else if (rand < 0.75) {
      const raiseSize = Math.max(s.minRaise, s.bigBlind * 2);
      const raiseTotal = s.currentBet + Math.min(raiseSize, current.chips);
      action = { type: 'raise', amount: raiseTotal };
    } else {
      action = { type: 'fold' };
    }
  } else {
    // Large bet
    if (rand < 0.30) {
      action = { type: 'call' };
    } else if (rand < 0.40) {
      const raiseSize = Math.max(s.minRaise, s.bigBlind * 3);
      const raiseTotal = s.currentBet + Math.min(raiseSize, current.chips);
      action = { type: 'raise', amount: raiseTotal };
    } else {
      action = { type: 'fold' };
    }
  }

  return processPokerAction(s, action, current.id);
}
