import type { Card, FrontPile, Rank, Suit, TwelvePlayer, TwelveState } from './types';
import { runTwelveBotTurn } from './logic';

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
    shogSuitsCalled: [],
  };
}

function makeState(players: TwelvePlayer[], currentPlayerIndex: number): TwelveState {
  return {
    players,
    pileCount: 4,
    phase: 'playing',
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
    roundCardPoints: {},
    roundSummary: '',
    gameOver: false,
    winners: [],
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

function preserveBetterPairForShogScenario(): TwelveBotScenarioResult {
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
    name: 'preserve-stronger-pair-for-future-shog',
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

export function runTwelveBotScenarioChecks(): TwelveBotScenarioResult[] {
  return [
    blockDeclarationWindowScenario(),
    setTrumpWhenThreatenedScenario(),
    preserveBetterPairForShogScenario(),
    preferHandOverRevealScenario(),
    endgameLastTrickControlScenario(),
  ];
}
