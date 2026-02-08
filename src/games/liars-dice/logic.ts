import type { Player } from '../../networking/types';
import type {
  LiarsDiceState,
  LiarsDiceAction,
  LiarsDicePlayer,
  Bid,
  RevolverState,
  RoundResult,
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function rollDice(count: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

function createRevolver(): RevolverState {
  return {
    chambers: 6,
    bulletPosition: Math.floor(Math.random() * 6),
    currentChamber: 0,
  };
}

/** Count how many dice across all alive players show the given face value */
function countTotalDice(players: LiarsDicePlayer[], faceValue: number): number {
  let count = 0;
  for (const p of players) {
    if (!p.alive) continue;
    for (const d of p.dice) {
      if (d === faceValue) count++;
    }
  }
  return count;
}

/** Get the next alive player index (wrapping around) */
function nextAlivePlayerIndex(players: LiarsDicePlayer[], currentIndex: number): number {
  const n = players.length;
  let i = (currentIndex + 1) % n;
  let safety = 0;
  while (!players[i].alive && safety < n) {
    i = (i + 1) % n;
    safety++;
  }
  return i;
}

/** Count alive players */
function aliveCount(players: LiarsDicePlayer[]): number {
  return players.filter(p => p.alive).length;
}

/** Check if a bid is strictly higher than the current bid */
function isBidHigher(newBid: Bid, currentBid: Bid | null): boolean {
  if (!currentBid) return true;
  if (newBid.quantity > currentBid.quantity) return true;
  if (newBid.quantity === currentBid.quantity && newBid.faceValue > currentBid.faceValue) return true;
  return false;
}

/** Pull the trigger on a revolver and return updated state + whether it fired */
function pullRevolverTrigger(revolver: RevolverState): { revolver: RevolverState; fired: boolean } {
  const fired = revolver.currentChamber === revolver.bulletPosition;
  return {
    revolver: {
      ...revolver,
      currentChamber: revolver.currentChamber + 1,
    },
    fired,
  };
}

// ── State Creation ───────────────────────────────────────────────────────────

export function createLiarsDiceState(players: Player[]): LiarsDiceState {
  return {
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      dice: rollDice(5),
      alive: true,
      revolver: createRevolver(),
    })),
    currentPlayerIndex: 0,
    currentBid: null,
    lastBidderId: null,
    phase: 'rolling',
    roundResult: null,
    round: 1,
    roundStarterIndex: 0,
  };
}

// ── Action Processing ────────────────────────────────────────────────────────

export function processLiarsDiceAction(
  state: unknown,
  action: unknown,
  playerId: string,
): unknown {
  const s = state as LiarsDiceState;
  const a = action as LiarsDiceAction;

  if (s.phase === 'gameOver') return state;

  switch (a.type) {
    case 'roll':
      return handleRoll(s, playerId);
    case 'make-bid':
      return handleMakeBid(s, a.bid, playerId);
    case 'call-liar':
      return handleCallLiar(s, playerId);
    case 'spot-on':
      return handleSpotOn(s, playerId);
    case 'pull-trigger':
      return handlePullTrigger(s, playerId);
    case 'next-round':
      return handleNextRound(s, playerId);
    default:
      return state;
  }
}

// ── Roll ─────────────────────────────────────────────────────────────────────

function handleRoll(s: LiarsDiceState, playerId: string): LiarsDiceState {
  if (s.phase !== 'rolling') return s;
  // Only host (first player) or any player can trigger roll — we allow anyone
  // Actually the host triggers it or it auto-triggers. Let any player trigger it.
  // For simplicity, the first alive player or host triggers.
  const starter = s.players[s.roundStarterIndex];
  if (!starter || starter.id !== playerId) {
    // Allow host (first player) to trigger
    if (s.players[0].id !== playerId) return s;
  }

  const newPlayers = s.players.map(p => {
    if (!p.alive) return p;
    return { ...p, dice: rollDice(5) };
  });

  return {
    ...s,
    players: newPlayers,
    currentPlayerIndex: s.roundStarterIndex,
    currentBid: null,
    lastBidderId: null,
    phase: 'bidding',
    roundResult: null,
  };
}

// ── Make Bid ─────────────────────────────────────────────────────────────────

function handleMakeBid(s: LiarsDiceState, bid: Bid, playerId: string): LiarsDiceState {
  if (s.phase !== 'bidding') return s;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return s;
  if (!currentPlayer.alive) return s;

  // Validate bid
  if (bid.faceValue < 1 || bid.faceValue > 6) return s;
  if (bid.quantity < 1) return s;
  if (!isBidHigher(bid, s.currentBid)) return s;

  const nextIdx = nextAlivePlayerIndex(s.players, s.currentPlayerIndex);

  return {
    ...s,
    currentBid: bid,
    lastBidderId: playerId,
    currentPlayerIndex: nextIdx,
  };
}

// ── Call Liar ────────────────────────────────────────────────────────────────

function handleCallLiar(s: LiarsDiceState, playerId: string): LiarsDiceState {
  if (s.phase !== 'bidding') return s;
  if (!s.currentBid || !s.lastBidderId) return s; // Must have a bid to challenge

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return s;
  if (!currentPlayer.alive) return s;

  const actualCount = countTotalDice(s.players, s.currentBid.faceValue);
  // If actual count >= bid quantity, the bid was true => challenger loses
  // If actual count < bid quantity, the bid was a lie => bidder loses
  const bidWasTrue = actualCount >= s.currentBid.quantity;
  const loserId = bidWasTrue ? playerId : s.lastBidderId;

  const roundResult: RoundResult = {
    challengeType: 'liar',
    challengerId: playerId,
    bidderId: s.lastBidderId,
    bid: s.currentBid,
    actualCount,
    loserId,
    triggerPlayerIds: [loserId],
    pulledTrigger: {},
    revolverResults: {},
  };

  return {
    ...s,
    phase: 'revealing',
    roundResult,
  };
}

// ── Spot On ──────────────────────────────────────────────────────────────────

function handleSpotOn(s: LiarsDiceState, playerId: string): LiarsDiceState {
  if (s.phase !== 'bidding') return s;
  if (!s.currentBid || !s.lastBidderId) return s;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return s;
  if (!currentPlayer.alive) return s;

  const actualCount = countTotalDice(s.players, s.currentBid.faceValue);
  const isExact = actualCount === s.currentBid.quantity;

  let triggerPlayerIds: string[];
  let loserId: string;

  if (isExact) {
    // Spot on correct: everyone else pulls the trigger
    triggerPlayerIds = s.players
      .filter(p => p.alive && p.id !== playerId)
      .map(p => p.id);
    loserId = ''; // No single loser; multiple people at risk
  } else {
    // Spot on wrong: challenger pulls the trigger
    triggerPlayerIds = [playerId];
    loserId = playerId;
  }

  const roundResult: RoundResult = {
    challengeType: 'spot-on',
    challengerId: playerId,
    bidderId: s.lastBidderId,
    bid: s.currentBid,
    actualCount,
    loserId,
    triggerPlayerIds,
    pulledTrigger: {},
    revolverResults: {},
  };

  return {
    ...s,
    phase: 'revealing',
    roundResult,
  };
}

// ── Pull Trigger ─────────────────────────────────────────────────────────────

function handlePullTrigger(s: LiarsDiceState, playerId: string): LiarsDiceState {
  if (s.phase !== 'revolver') return s;
  if (!s.roundResult) return s;
  if (!s.roundResult.triggerPlayerIds.includes(playerId)) return s;
  if (s.roundResult.pulledTrigger[playerId]) return s; // Already pulled

  const playerIdx = s.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return s;

  const player = s.players[playerIdx];
  const { revolver: newRevolver, fired } = pullRevolverTrigger(player.revolver);

  const newPlayers = [...s.players];
  newPlayers[playerIdx] = {
    ...player,
    revolver: newRevolver,
    alive: fired ? false : player.alive,
  };

  const newRoundResult: RoundResult = {
    ...s.roundResult,
    pulledTrigger: { ...s.roundResult.pulledTrigger, [playerId]: true },
    revolverResults: {
      ...s.roundResult.revolverResults,
      [playerId]: fired ? 'eliminated' : 'survived',
    },
  };

  // Check if all required players have pulled
  const allPulled = newRoundResult.triggerPlayerIds.every(id => newRoundResult.pulledTrigger[id]);

  // Check if game is over
  const alive = aliveCount(newPlayers);

  if (alive <= 1) {
    return {
      ...s,
      players: newPlayers,
      roundResult: newRoundResult,
      phase: 'gameOver',
    };
  }

  if (allPulled) {
    // All trigger pulls done — move to waiting for next round
    // We'll stay in revolver phase but the UI will show a "next round" button
    return {
      ...s,
      players: newPlayers,
      roundResult: newRoundResult,
      phase: 'revolver',
    };
  }

  return {
    ...s,
    players: newPlayers,
    roundResult: newRoundResult,
  };
}

// ── Next Round ───────────────────────────────────────────────────────────────

function handleNextRound(s: LiarsDiceState, playerId: string): LiarsDiceState {
  if (s.phase !== 'revolver') return s;
  // Only host can advance
  if (s.players[0].id !== playerId) return s;

  // All triggers must be pulled
  if (s.roundResult) {
    const allPulled = s.roundResult.triggerPlayerIds.every(id => s.roundResult!.pulledTrigger[id]);
    if (!allPulled) return s;
  }

  const alive = aliveCount(s.players);
  if (alive <= 1) {
    return { ...s, phase: 'gameOver' };
  }

  // Determine who starts the next round
  // The loser starts (if still alive), otherwise next alive player after them
  let nextStarter = s.roundStarterIndex;
  if (s.roundResult) {
    // Find the primary loser or the challenger
    const loserId = s.roundResult.loserId || s.roundResult.challengerId;
    const loserIdx = s.players.findIndex(p => p.id === loserId);
    if (loserIdx !== -1 && s.players[loserIdx].alive) {
      nextStarter = loserIdx;
    } else {
      nextStarter = nextAlivePlayerIndex(s.players, loserIdx !== -1 ? loserIdx : s.roundStarterIndex);
    }
  }

  return {
    ...s,
    currentPlayerIndex: nextStarter,
    currentBid: null,
    lastBidderId: null,
    phase: 'rolling',
    roundResult: null,
    round: s.round + 1,
    roundStarterIndex: nextStarter,
  };
}

// ── Game Over Check ──────────────────────────────────────────────────────────

export function isLiarsDiceOver(state: unknown): boolean {
  const s = state as LiarsDiceState;
  return s.phase === 'gameOver';
}

// ── Bot AI ───────────────────────────────────────────────────────────────────

export function runLiarsDiceBotTurn(state: unknown): unknown {
  const s = state as LiarsDiceState;
  if (s.phase === 'gameOver') return state;

  // Handle rolling phase — host triggers
  if (s.phase === 'rolling') {
    // Any bot or the host bot can trigger roll
    const starter = s.players[s.roundStarterIndex];
    if (starter.isBot) {
      return handleRoll(s, starter.id);
    }
    // If starter is human, first player (host) may be bot
    if (s.players[0].isBot) {
      return handleRoll(s, s.players[0].id);
    }
    return state;
  }

  // Handle revealing phase — auto-transition to revolver
  if (s.phase === 'revealing') {
    return { ...s, phase: 'revolver' as const };
  }

  // Handle revolver phase — bots pull trigger
  if (s.phase === 'revolver') {
    if (!s.roundResult) return state;

    // Find a bot that needs to pull the trigger
    for (const pid of s.roundResult.triggerPlayerIds) {
      if (s.roundResult.pulledTrigger[pid]) continue;
      const player = s.players.find(p => p.id === pid);
      if (player && player.isBot) {
        return handlePullTrigger(s, pid);
      }
    }

    // All triggers pulled? Bot host advances to next round
    const allPulled = s.roundResult.triggerPlayerIds.every(id => s.roundResult!.pulledTrigger[id]);
    if (allPulled && s.players[0].isBot) {
      return handleNextRound(s, s.players[0].id);
    }

    return state;
  }

  // Handle bidding phase
  if (s.phase !== 'bidding') return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer || !currentPlayer.isBot || !currentPlayer.alive) return state;

  // Bot decision making
  const myDice = currentPlayer.dice;
  const alivePlayers = aliveCount(s.players);
  const totalDice = alivePlayers * 5;

  if (!s.currentBid) {
    // First bid — bid conservatively based on own dice
    const bid = botMakeOpeningBid(myDice);
    return handleMakeBid(s, bid, currentPlayer.id);
  }

  // There's an existing bid — decide: raise, call liar, or spot on
  const decision = botDecide(myDice, s.currentBid, totalDice, currentPlayer.revolver);

  switch (decision.action) {
    case 'bid':
      return handleMakeBid(s, decision.bid!, currentPlayer.id);
    case 'liar':
      return handleCallLiar(s, currentPlayer.id);
    case 'spot-on':
      return handleSpotOn(s, currentPlayer.id);
  }
}

// ── Bot Strategy Helpers ─────────────────────────────────────────────────────

function botMakeOpeningBid(myDice: number[]): Bid {
  // Count my dice
  const counts: Record<number, number> = {};
  for (const d of myDice) {
    counts[d] = (counts[d] || 0) + 1;
  }

  // Find my most common face value
  let bestFace = 1;
  let bestCount = 0;
  for (let f = 1; f <= 6; f++) {
    if ((counts[f] || 0) > bestCount) {
      bestCount = counts[f] || 0;
      bestFace = f;
    }
  }

  // Bid slightly above what I have (bluff a little)
  const bluff = Math.random() < 0.3 ? 1 : 0;
  return {
    quantity: bestCount + bluff + 1,
    faceValue: bestFace,
  };
}

interface BotDecision {
  action: 'bid' | 'liar' | 'spot-on';
  bid?: Bid;
}

function botDecide(
  myDice: number[],
  currentBid: Bid,
  totalDice: number,
  revolver: RevolverState,
): BotDecision {
  // Count how many of the bid face I have
  const myCount = myDice.filter(d => d === currentBid.faceValue).length;

  // Estimate expected count from other players (each die has 1/6 chance)
  const otherDice = totalDice - 5;
  const expectedFromOthers = otherDice / 6;
  const expectedTotal = myCount + expectedFromOthers;

  // How risky is the current bid?
  const bidRisk = currentBid.quantity / expectedTotal; // >1 means bid exceeds expectation

  // How dangerous is my revolver? (more chambers used = more desperate)
  const revolverDanger = revolver.currentChamber / revolver.chambers;

  // Probability of calling liar
  let callLiarChance = 0;
  if (bidRisk > 1.8) callLiarChance = 0.85;
  else if (bidRisk > 1.3) callLiarChance = 0.5;
  else if (bidRisk > 1.0) callLiarChance = 0.2;
  else callLiarChance = 0.05;

  // If revolver is dangerous, be more willing to call liar (risk challenge over guaranteed future risk)
  if (revolverDanger > 0.5) callLiarChance += 0.15;

  // Small chance of spot-on if bid seems close to expected
  let spotOnChance = 0;
  if (Math.abs(currentBid.quantity - expectedTotal) < 1.5) {
    spotOnChance = 0.08;
  }

  const roll = Math.random();
  if (roll < spotOnChance) {
    return { action: 'spot-on' };
  }
  if (roll < spotOnChance + callLiarChance) {
    return { action: 'liar' };
  }

  // Make a higher bid
  const bid = botMakeRaise(myDice, currentBid, totalDice);
  return { action: 'bid', bid };
}

function botMakeRaise(myDice: number[], currentBid: Bid, totalDice: number): Bid {
  // Try to raise quantity by 1 with the same face, or switch to a face I have more of
  const counts: Record<number, number> = {};
  for (const d of myDice) {
    counts[d] = (counts[d] || 0) + 1;
  }

  // Option 1: raise quantity by 1
  const option1: Bid = { quantity: currentBid.quantity + 1, faceValue: currentBid.faceValue };

  // Option 2: same quantity but higher face that I have dice for
  let option2: Bid | null = null;
  for (let f = currentBid.faceValue + 1; f <= 6; f++) {
    if ((counts[f] || 0) > 0) {
      option2 = { quantity: currentBid.quantity, faceValue: f };
      break;
    }
  }

  // Option 3: raise quantity with my best face
  let bestFace = currentBid.faceValue;
  let bestCount = 0;
  for (let f = 1; f <= 6; f++) {
    if ((counts[f] || 0) > bestCount) {
      bestCount = counts[f] || 0;
      bestFace = f;
    }
  }
  const option3: Bid = { quantity: currentBid.quantity + 1, faceValue: bestFace };

  // Pick the least risky option
  const options = [option1, option3];
  if (option2) options.push(option2);

  // Score each option
  let bestOption = option1;
  let bestScore = -Infinity;

  for (const opt of options) {
    if (!isBidHigher(opt, currentBid)) continue;
    const myCountForFace = counts[opt.faceValue] || 0;
    const otherDice = totalDice - 5;
    const expectedTotal = myCountForFace + otherDice / 6;
    const score = expectedTotal - opt.quantity; // Higher = safer bid
    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  // Ensure the bid is actually valid
  if (!isBidHigher(bestOption, currentBid)) {
    return { quantity: currentBid.quantity + 1, faceValue: currentBid.faceValue };
  }

  return bestOption;
}
