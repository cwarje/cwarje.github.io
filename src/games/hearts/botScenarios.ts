import type { Card, HeartsPlayer, HeartsState, Rank, Suit } from './types';
import { chooseHeartsPassCards, chooseHeartsPlayCard } from './logic';

export interface HeartsBotScenarioResult {
  name: string;
  passed: boolean;
  details: string;
}

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank };
}

function sameCard(a: Card | null, b: Card): boolean {
  return !!a && a.suit === b.suit && a.rank === b.rank;
}

function basePlayers(player0Hand: Card[]): HeartsPlayer[] {
  return [
    { id: 'p0', name: 'Bot', color: 'blue', isBot: true, hand: player0Hand, tricksTaken: [], roundScore: 0, totalScore: 0 },
    { id: 'p1', name: 'P1', color: 'red', isBot: true, hand: [], tricksTaken: [], roundScore: 0, totalScore: 0 },
    { id: 'p2', name: 'P2', color: 'green', isBot: true, hand: [], tricksTaken: [], roundScore: 0, totalScore: 0 },
    { id: 'p3', name: 'P3', color: 'dark-purple', isBot: true, hand: [], tricksTaken: [], roundScore: 0, totalScore: 0 },
  ];
}

function baseState(player0Hand: Card[]): HeartsState {
  return {
    players: basePlayers(player0Hand),
    targetScore: 100,
    phase: 'playing',
    passDirection: 'left',
    passSelections: {},
    passConfirmed: {},
    currentTrick: [],
    currentPlayerIndex: 0,
    leadPlayerIndex: 0,
    heartsBroken: true,
    trickNumber: 4,
    roundNumber: 1,
    gameOver: false,
    winners: [],
    trickWinner: null,
  };
}

function passScenario(): HeartsBotScenarioResult {
  const hand: Card[] = [
    card('spades', 12),
    card('spades', 14),
    card('hearts', 14),
    card('hearts', 13),
    card('hearts', 10),
    card('clubs', 2),
    card('clubs', 5),
    card('clubs', 9),
    card('diamonds', 3),
    card('diamonds', 7),
    card('diamonds', 11),
    card('spades', 3),
    card('spades', 7),
  ];

  const state = {
    ...baseState(hand),
    phase: 'passing' as const,
    passDirection: 'left' as const,
    trickNumber: 1,
  };

  const selected = chooseHeartsPassCards(state, 0);
  const hasQos = selected.some(c => c.suit === 'spades' && c.rank === 12);
  const hasHighHeart = selected.some(c => c.suit === 'hearts' && c.rank >= 12);
  const passed = selected.length === 3 && hasQos && hasHighHeart;
  return {
    name: 'passing-selects-danger-cards',
    passed,
    details: passed ? 'Selected 3 cards including Q♠ and high heart.' : `Unexpected pass: ${JSON.stringify(selected)}`,
  };
}

function followSuitAvoidWinScenario(): HeartsBotScenarioResult {
  const state = baseState([card('clubs', 9), card('clubs', 14), card('hearts', 12)]);
  state.currentTrick = [
    { playerId: 'p1', card: card('clubs', 10) },
    { playerId: 'p2', card: card('clubs', 13) },
  ];

  const chosen = chooseHeartsPlayCard(state, 0);
  const expected = card('clubs', 9);
  const passed = sameCard(chosen, expected);
  return {
    name: 'follow-suit-avoids-taking-trick',
    passed,
    details: passed ? 'Played highest safe undercard.' : `Expected 9♣ but got ${JSON.stringify(chosen)}`,
  };
}

function dumpQosWhenSafeScenario(): HeartsBotScenarioResult {
  const state = baseState([card('spades', 12), card('hearts', 13), card('clubs', 2)]);
  state.currentTrick = [
    { playerId: 'p1', card: card('diamonds', 9) },
    { playerId: 'p2', card: card('diamonds', 14) },
  ];

  const chosen = chooseHeartsPlayCard(state, 0);
  const expected = card('spades', 12);
  const passed = sameCard(chosen, expected);
  return {
    name: 'void-dumps-qos-when-safe',
    passed,
    details: passed ? 'Dumped Q♠ while void in lead suit.' : `Expected Q♠ but got ${JSON.stringify(chosen)}`,
  };
}

function moonDefenseAvoidPointDumpScenario(): HeartsBotScenarioResult {
  const state = baseState([card('spades', 12), card('hearts', 13), card('clubs', 14)]);
  state.players[2].roundScore = 16;
  state.currentTrick = [
    { playerId: 'p2', card: card('diamonds', 14) },
    { playerId: 'p3', card: card('diamonds', 9) },
  ];

  const chosen = chooseHeartsPlayCard(state, 0);
  const expected = card('clubs', 14);
  const passed = sameCard(chosen, expected);
  return {
    name: 'moon-defense-avoids-gifting-points',
    passed,
    details: passed ? 'Avoided dumping points to moon-threat leader.' : `Expected A♣ but got ${JSON.stringify(chosen)}`,
  };
}

function moonDefenseTakePointTrickScenario(): HeartsBotScenarioResult {
  const state = baseState([card('hearts', 10), card('hearts', 12), card('clubs', 3)]);
  state.players[2].roundScore = 18;
  state.currentTrick = [
    { playerId: 'p2', card: card('hearts', 11) },
    { playerId: 'p3', card: card('hearts', 4) },
  ];

  const chosen = chooseHeartsPlayCard(state, 0);
  const expected = card('hearts', 12);
  const passed = sameCard(chosen, expected);
  return {
    name: 'moon-defense-takes-point-trick',
    passed,
    details: passed ? 'Overtook trick with points to disrupt moon shot.' : `Expected Q♥ but got ${JSON.stringify(chosen)}`,
  };
}

/** Trick 1, 2♣ led: must win with clubs — slough highest club (no points possible on trick). */
function trickOneSloughHighClubScenario(): HeartsBotScenarioResult {
  const hand: Card[] = [
    card('clubs', 3),
    card('clubs', 13),
    card('diamonds', 2),
    card('diamonds', 4),
    card('diamonds', 6),
    card('diamonds', 8),
    card('diamonds', 10),
    card('diamonds', 11),
    card('diamonds', 12),
    card('spades', 5),
    card('spades', 7),
    card('hearts', 9),
    card('hearts', 10),
  ];
  const state = baseState(hand);
  state.trickNumber = 1;
  state.heartsBroken = false;
  state.currentTrick = [{ playerId: 'p1', card: card('clubs', 2) }];
  state.currentPlayerIndex = 0;

  const chosen = chooseHeartsPlayCard(state, 0);
  const expected = card('clubs', 13);
  const passed = sameCard(chosen, expected);
  return {
    name: 'trick-one-sloughs-high-club-when-forced-to-win',
    passed,
    details: passed ? 'Played K♣ to dump on zero-point first trick.' : `Expected K♣ but got ${JSON.stringify(chosen)}`,
  };
}

/** Zero-point diamond trick: forced to win — play highest diamond. */
function zeroPointDiamondDumpHighScenario(): HeartsBotScenarioResult {
  const hand: Card[] = [
    card('diamonds', 11),
    card('diamonds', 12),
    card('clubs', 2),
    card('clubs', 4),
    card('clubs', 6),
    card('clubs', 8),
    card('spades', 3),
    card('spades', 5),
    card('spades', 7),
    card('spades', 9),
    card('hearts', 4),
    card('hearts', 5),
    card('hearts', 6),
  ];
  const state = baseState(hand);
  state.currentTrick = [{ playerId: 'p1', card: card('diamonds', 5) }];

  const chosen = chooseHeartsPlayCard(state, 0);
  const expected = card('diamonds', 12);
  const passed = sameCard(chosen, expected);
  return {
    name: 'zero-point-diamond-dumps-high-when-forced-to-win',
    passed,
    details: passed ? 'Played Q♦ to slough on safe suit.' : `Expected Q♦ but got ${JSON.stringify(chosen)}`,
  };
}

/** Spades led, Q♠ still unseen, players follow after us — keep lowest winner so Q♠ cannot be dumped under our A♠. */
function spadesLowestWinnerWhenQosUnseenScenario(): HeartsBotScenarioResult {
  const hand: Card[] = [
    card('spades', 13),
    card('spades', 14),
    card('clubs', 3),
    card('clubs', 5),
    card('clubs', 7),
    card('diamonds', 2),
    card('diamonds', 4),
    card('diamonds', 6),
    card('diamonds', 8),
    card('hearts', 5),
    card('hearts', 6),
    card('hearts', 7),
    card('hearts', 8),
  ];
  const state = baseState(hand);
  state.currentTrick = [
    { playerId: 'p1', card: card('spades', 2) },
    { playerId: 'p2', card: card('spades', 6) },
  ];

  const chosen = chooseHeartsPlayCard(state, 0);
  const expected = card('spades', 13);
  const passed = sameCard(chosen, expected);
  return {
    name: 'spades-lowest-winner-when-qos-unseen-and-not-last',
    passed,
    details: passed ? 'Played K♠ to avoid winning with A♠ before last seat.' : `Expected K♠ but got ${JSON.stringify(chosen)}`,
  };
}

export function runHeartsBotScenarioChecks(): HeartsBotScenarioResult[] {
  return [
    passScenario(),
    followSuitAvoidWinScenario(),
    dumpQosWhenSafeScenario(),
    moonDefenseAvoidPointDumpScenario(),
    moonDefenseTakePointTrickScenario(),
    trickOneSloughHighClubScenario(),
    zeroPointDiamondDumpHighScenario(),
    spadesLowestWinnerWhenQosUnseenScenario(),
  ];
}
