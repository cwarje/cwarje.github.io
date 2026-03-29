import type { Card, FrontPile, Rank, Suit, TwelvePlayer, TwelveState } from './types';
import { runTwelveBotTurn, processTwelveAction } from './logic';
import { isLegalPlay } from './rules';

export interface TwelveBotScenarioResult {
  name: string;
  passed: boolean;
  details: string;
}

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank };
}

function makePiles(piles: Array<Partial<FrontPile>>): FrontPile[] {
  return piles.map(pile => ({
    topCard: pile.topCard ?? null,
    bottomCard: pile.bottomCard ?? null,
    bottomFaceUp: pile.bottomFaceUp ?? false,
  }));
}

function makePlayer(
  id: string,
  isBot: boolean,
  hand: Card[],
  frontPiles: Array<Partial<FrontPile>>,
  totalScore = 0,
): TwelvePlayer {
  return {
    id,
    name: id.toUpperCase(),
    color: 'blue',
    isBot,
    hand,
    frontPiles: makePiles(frontPiles),
    capturedCards: [],
    totalScore,
    tjogSuitsCalled: [],
  };
}

function makeState(players: TwelvePlayer[], currentPlayerIndex: number): TwelveState {
  return {
    players,
    pileCount: 4,
    phase: 'playing',
    announcement: null,
    dealerIndex: 0,
    leaderIndex: 0,
    currentPlayerIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 4,
    trumpSuit: null,
    trumpSetterId: null,
    pendingFlip: [],
    lastTrickWinnerId: null,
    roundNumber: 1,
    knownVoidSuitsByPlayer: {},
    roundCardPoints: {},
    roundSummary: '',
    gameOver: false,
    winners: [],
    manBid: null,
    postAnnouncement: null,
  };
}

function blockDeclarationWindowScenario(): TwelveBotScenarioResult {
  const bot = makePlayer('p0', true, [card('clubs', 13), card('clubs', 6)], []);
  const threat = makePlayer(
    'p1',
    true,
    [card('diamonds', 6)],
    [{ topCard: card('hearts', 12) }, { topCard: card('hearts', 13) }],
    8,
  );
  const other = makePlayer('p2', true, [card('clubs', 7)], []);
  const state = makeState([bot, threat, other], 0);
  state.currentTrick = [
    { playerId: 'p1', card: card('clubs', 11), source: 'hand' },
    { playerId: 'p2', card: card('clubs', 7), source: 'hand' },
  ];

  const next = runTwelveBotTurn(state) as TwelveState;
  const botPlay = next.currentTrick.find(entry => entry.playerId === 'p0');
  const passed = !!botPlay && botPlay.card.suit === 'clubs' && botPlay.card.rank === 13;
  return {
    name: 'block-declaration-window-overtake',
    passed,
    details: passed ? 'Bot overtook threat leader to deny declaration window.' : `Unexpected play: ${JSON.stringify(botPlay)}`,
  };
}

function setTrumpWhenThreatenedScenario(): TwelveBotScenarioResult {
  const bot = makePlayer(
    'p0',
    true,
    [card('clubs', 12), card('clubs', 13), card('hearts', 12), card('hearts', 13)],
    [],
    8,
  );
  const threat = makePlayer(
    'p1',
    true,
    [card('spades', 7)],
    [{ topCard: card('spades', 12) }, { topCard: card('spades', 13) }],
    7,
  );
  const other = makePlayer('p2', true, [card('diamonds', 6)], []);
  const state = makeState([bot, threat, other], 0);
  state.lastTrickWinnerId = 'p0';

  const next = runTwelveBotTurn(state) as TwelveState;
  const nextBot = next.players[0];
  const passed = next.trumpSuit !== null && nextBot.totalScore === 10;
  return {
    name: 'set-trump-when-eligible-and-threatened',
    passed,
    details: passed ? `Set trump to ${next.trumpSuit}.` : `Did not set trump. trump=${String(next.trumpSuit)}`,
  };
}

function preserveBetterPairForTjogScenario(): TwelveBotScenarioResult {
  const bot = makePlayer(
    'p0',
    true,
    [
      card('clubs', 12),
      card('clubs', 13),
      card('hearts', 12),
      card('hearts', 13),
      card('hearts', 10),
      card('hearts', 14),
    ],
    [],
    7,
  );
  const p1 = makePlayer('p1', true, [card('spades', 7)], []);
  const p2 = makePlayer('p2', true, [card('diamonds', 6)], []);
  const state = makeState([bot, p1, p2], 0);
  state.lastTrickWinnerId = 'p0';

  const next = runTwelveBotTurn(state) as TwelveState;
  const passed = next.trumpSuit === 'clubs';
  return {
    name: 'preserve-stronger-pair-for-future-tjog',
    passed,
    details: passed ? 'Bot selected weaker pair as trump to preserve stronger pair.' : `Trump selected: ${String(next.trumpSuit)}`,
  };
}

function preferHandOverRevealScenario(): TwelveBotScenarioResult {
  const bot = makePlayer(
    'p0',
    true,
    [card('diamonds', 7)],
    [{ topCard: card('clubs', 6), bottomCard: card('hearts', 14), bottomFaceUp: false }],
    2,
  );
  const p1 = makePlayer('p1', true, [card('spades', 7)], []);
  const p2 = makePlayer('p2', true, [card('diamonds', 6)], []);
  const state = makeState([bot, p1, p2], 0);

  const next = runTwelveBotTurn(state) as TwelveState;
  const nextBot = next.players[0];
  const playedFromHand = nextBot.hand.length === 0 && next.currentTrick.some(entry => entry.playerId === 'p0' && entry.source === 'hand');
  const pileStillHidden = !!nextBot.frontPiles[0]?.topCard && nextBot.frontPiles[0]?.bottomFaceUp === false;
  const passed = playedFromHand && pileStillHidden;
  return {
    name: 'prefer-hand-over-risky-pile-reveal',
    passed,
    details: passed ? 'Bot played hand card and preserved hidden pile bottom.' : 'Bot exposed or consumed pile unexpectedly.',
  };
}

function endgameLastTrickControlScenario(): TwelveBotScenarioResult {
  const bot = makePlayer('p0', true, [card('clubs', 10), card('clubs', 6)], [], 6);
  const p1 = makePlayer('p1', true, [], [], 6);
  const p2 = makePlayer('p2', true, [card('hearts', 6)], [], 6);
  const state = makeState([bot, p1, p2], 0);
  state.trickNumber = 11;
  state.currentTrick = [{ playerId: 'p1', card: card('clubs', 9), source: 'hand' }];

  const next = runTwelveBotTurn(state) as TwelveState;
  const botPlay = next.currentTrick.find(entry => entry.playerId === 'p0');
  const passed = !!botPlay && botPlay.card.suit === 'clubs' && botPlay.card.rank === 10;
  return {
    name: 'endgame-prioritizes-last-trick-control',
    passed,
    details: passed ? 'Bot used winning card in very late trick.' : `Unexpected card in endgame: ${JSON.stringify(botPlay)}`,
  };
}

function mustPlayTrumpWhenVoidScenario(): TwelveBotScenarioResult {
  const bot = makePlayer('p0', true, [card('diamonds', 6), card('clubs', 10)], []);
  const p1 = makePlayer('p1', true, [card('hearts', 7)], []);
  const p2 = makePlayer('p2', true, [card('spades', 6)], []);
  const state = makeState([bot, p1, p2], 0);
  state.trumpSuit = 'diamonds';
  state.currentTrick = [{ playerId: 'p1', card: card('hearts', 11), source: 'hand' }];

  const canPlayTrump = isLegalPlay(state, 0, card('diamonds', 6), 'hand');
  const canPlayOffSuit = isLegalPlay(state, 0, card('clubs', 10), 'hand');
  const passed = canPlayTrump && !canPlayOffSuit;
  return {
    name: 'must-play-trump-when-void-in-lead',
    passed,
    details: passed
      ? 'Void in lead suit with trump set: only trump is legal.'
      : `Unexpected legality. trump=${String(canPlayTrump)} offsuit=${String(canPlayOffSuit)}`,
  };
}

function forceTrumpDrainLeadScenario(): TwelveBotScenarioResult {
  const bot = makePlayer('p0', true, [card('hearts', 6), card('hearts', 13), card('clubs', 7)], []);
  const target = makePlayer(
    'p1',
    true,
    [card('spades', 8)],
    [{ topCard: card('diamonds', 10) }],
  );
  const other = makePlayer('p2', true, [card('clubs', 6)], []);
  const state = makeState([bot, target, other], 0);
  state.trumpSuit = 'diamonds';
  state.knownVoidSuitsByPlayer = { p1: ['hearts'] };

  const next = runTwelveBotTurn(state) as TwelveState;
  const botPlay = next.currentTrick.find(entry => entry.playerId === 'p0');
  const passed = !!botPlay && botPlay.card.suit === 'hearts' && botPlay.card.rank === 6;
  return {
    name: 'lead-low-void-suit-to-drain-trump',
    passed,
    details: passed
      ? 'Bot led low in a suit target opponent is known void in.'
      : `Unexpected lead: ${JSON.stringify(botPlay)}`,
  };
}

function chooseLowestForcedTrumpScenario(): TwelveBotScenarioResult {
  const bot = makePlayer('p0', true, [card('diamonds', 6), card('diamonds', 14)], []);
  const p1 = makePlayer('p1', true, [card('hearts', 7)], []);
  const p2 = makePlayer('p2', true, [card('clubs', 7)], []);
  const state = makeState([bot, p1, p2], 0);
  state.trumpSuit = 'diamonds';
  state.currentTrick = [
    { playerId: 'p1', card: card('hearts', 11), source: 'hand' },
    { playerId: 'p2', card: card('clubs', 7), source: 'hand' },
  ];

  const next = runTwelveBotTurn(state) as TwelveState;
  const botPlay = next.currentTrick.find(entry => entry.playerId === 'p0');
  const passed = !!botPlay && botPlay.card.suit === 'diamonds' && botPlay.card.rank === 6;
  return {
    name: 'forced-trump-uses-lowest-legal-trump',
    passed,
    details: passed
      ? 'Bot used the lowest trump in a low-stakes forced-trump spot.'
      : `Unexpected forced trump play: ${JSON.stringify(botPlay)}`,
  };
}

function teamCardPointAggregationScenario(): TwelveBotScenarioResult {
  const p0 = makePlayer('p0', true, [], [], 5);
  const p1 = makePlayer('p1', true, [], [], 5);
  const p2 = makePlayer('p2', true, [], [], 5);
  const p3 = makePlayer('p3', true, [], [], 5);

  p0.capturedCards = [card('hearts', 14), card('hearts', 10)]; // 21
  p2.capturedCards = [card('clubs', 14), card('clubs', 10)]; // 21 => team 0 = 42
  p1.capturedCards = [card('diamonds', 14)]; // 11
  p3.capturedCards = [card('spades', 14)]; // 11 => team 1 = 22

  const state = makeState([p0, p1, p2, p3], 0);
  state.currentTrick = [
    { playerId: 'p0', card: card('hearts', 6), source: 'hand' },
    { playerId: 'p1', card: card('diamonds', 6), source: 'hand' },
    { playerId: 'p2', card: card('clubs', 6), source: 'hand' },
    { playerId: 'p3', card: card('spades', 6), source: 'hand' },
  ];
  state.trickWinner = 'p0';

  const next = processTwelveAction(state, { type: 'resolve-trick' }, 'p0') as TwelveState;

  const team0Score = next.players[0].totalScore;
  const team0Mate = next.players[2].totalScore;
  const team1Score = next.players[1].totalScore;
  const team1Mate = next.players[3].totalScore;

  const scoreSynced = team0Score === team0Mate && team1Score === team1Mate;
  const correctBonus = team0Score === 7 && team1Score === 5;
  const passed = scoreSynced && correctBonus;

  return {
    name: 'team-card-point-aggregation',
    passed,
    details: passed
      ? 'Team card points aggregated correctly, bonuses applied to team.'
      : `Scores: team0=[${team0Score},${team0Mate}] team1=[${team1Score},${team1Mate}]`,
  };
}

function teamTrumpScoreSyncScenario(): TwelveBotScenarioResult {
  const p0 = makePlayer('p0', true, [card('clubs', 12), card('clubs', 13)], [], 6);
  const p1 = makePlayer('p1', true, [card('hearts', 7)], [], 4);
  const p2 = makePlayer('p2', true, [card('diamonds', 6)], [], 6);
  const p3 = makePlayer('p3', true, [card('spades', 7)], [], 4);

  const state = makeState([p0, p1, p2, p3], 0);
  state.lastTrickWinnerId = 'p0';

  const next = processTwelveAction(state, { type: 'set-trump', suit: 'clubs' }, 'p0') as TwelveState;

  const passed =
    next.players[0].totalScore === 8 &&
    next.players[2].totalScore === 8 &&
    next.players[1].totalScore === 4 &&
    next.players[3].totalScore === 4;

  return {
    name: 'team-trump-score-sync',
    passed,
    details: passed
      ? 'Set-trump +2 applied to both teammates.'
      : `Scores: p0=${next.players[0].totalScore} p2=${next.players[2].totalScore} p1=${next.players[1].totalScore} p3=${next.players[3].totalScore}`,
  };
}

function teamWinnerResolutionScenario(): TwelveBotScenarioResult {
  const p0 = makePlayer('p0', true, [], [], 11);
  const p1 = makePlayer('p1', true, [], [], 5);
  const p2 = makePlayer('p2', true, [], [], 11);
  const p3 = makePlayer('p3', true, [], [], 5);

  p0.capturedCards = [card('hearts', 14)]; // 11
  p2.capturedCards = [card('clubs', 14)]; // 11 => team 0 = 22
  p1.capturedCards = [card('diamonds', 6)]; // 0
  p3.capturedCards = [card('spades', 6)]; // 0 => team 1 = 0

  const state = makeState([p0, p1, p2, p3], 0);
  state.currentTrick = [
    { playerId: 'p0', card: card('hearts', 6), source: 'hand' },
    { playerId: 'p1', card: card('diamonds', 7), source: 'hand' },
    { playerId: 'p2', card: card('clubs', 6), source: 'hand' },
    { playerId: 'p3', card: card('spades', 7), source: 'hand' },
  ];
  state.trickWinner = 'p1';

  const next = processTwelveAction(state, { type: 'resolve-trick' }, 'p1') as TwelveState;

  const gameOver = next.gameOver;
  const winnersIncludeBoth = next.winners.includes('p0') && next.winners.includes('p2');
  const winnersExcludeOpponents = !next.winners.includes('p1') && !next.winners.includes('p3');
  const passed = gameOver && winnersIncludeBoth && winnersExcludeOpponents;

  return {
    name: 'team-winner-resolution',
    passed,
    details: passed
      ? 'Both teammates returned as winners when team reaches 12.'
      : `gameOver=${gameOver} winners=${JSON.stringify(next.winners)} scores=[${next.players.map(p => p.totalScore)}]`,
  };
}

function teamBonusCountedOnceScenario(): TwelveBotScenarioResult {
  const p0 = makePlayer('p0', true, [], [], 0);
  const p1 = makePlayer('p1', true, [], [], 0);
  const p2 = makePlayer('p2', true, [], [], 0);
  const p3 = makePlayer('p3', true, [], [], 0);

  p0.capturedCards = [card('hearts', 14)]; // 11
  p2.capturedCards = [card('clubs', 14)]; // 11 => team 0 = 22
  p1.capturedCards = [card('diamonds', 6)]; // 0
  p3.capturedCards = [card('spades', 6)]; // 0 => team 1 = 0

  const state = makeState([p0, p1, p2, p3], 0);
  state.currentTrick = [
    { playerId: 'p0', card: card('hearts', 6), source: 'hand' },
    { playerId: 'p1', card: card('diamonds', 7), source: 'hand' },
    { playerId: 'p2', card: card('clubs', 6), source: 'hand' },
    { playerId: 'p3', card: card('spades', 7), source: 'hand' },
  ];
  state.trickWinner = 'p0';

  const next = processTwelveAction(state, { type: 'resolve-trick' }, 'p0') as TwelveState;

  const team0Score = next.players[0].totalScore;
  const team0MateScore = next.players[2].totalScore;
  const team1Score = next.players[1].totalScore;
  const passed = team0Score === 2 && team0MateScore === 2 && team1Score === 0;

  return {
    name: 'team-bonus-counted-once',
    passed,
    details: passed
      ? 'Team bonuses counted once toward race-to-12 (not per-player).'
      : `Scores: team0=[${team0Score},${team0MateScore}] team1=${team1Score}`,
  };
}

/** Opponent led 10 in suit; bot must win with ace instead of ducking with a low card. */
function aceOverLedTenScenario(): TwelveBotScenarioResult {
  const bot = makePlayer('p0', true, [card('hearts', 14), card('hearts', 6)], []);
  const opponent = makePlayer('p1', false, [], []);
  const state = makeState([bot, opponent], 0);
  state.currentTrick = [{ playerId: 'p1', card: card('hearts', 10), source: 'hand' }];

  const next = runTwelveBotTurn(state) as TwelveState;
  const botPlay = next.currentTrick.find(entry => entry.playerId === 'p0');
  const passed = !!botPlay && botPlay.card.suit === 'hearts' && botPlay.card.rank === 14;
  return {
    name: 'ace-over-led-ten-follow-suit',
    passed,
    details: passed
      ? 'Bot took opponent-led 10 with ace.'
      : `Unexpected play: ${JSON.stringify(botPlay)}`,
  };
}

export function runTwelveBotScenarioChecks(): TwelveBotScenarioResult[] {
  return [
    blockDeclarationWindowScenario(),
    setTrumpWhenThreatenedScenario(),
    preserveBetterPairForTjogScenario(),
    preferHandOverRevealScenario(),
    endgameLastTrickControlScenario(),
    mustPlayTrumpWhenVoidScenario(),
    forceTrumpDrainLeadScenario(),
    chooseLowestForcedTrumpScenario(),
    teamCardPointAggregationScenario(),
    teamTrumpScoreSyncScenario(),
    teamWinnerResolutionScenario(),
    teamBonusCountedOnceScenario(),
    aceOverLedTenScenario(),
  ];
}
