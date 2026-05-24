import { describe, expect, it } from 'vitest';
import { runMobilizationBotTurn } from './logic';
import type { Card, MobilizationPlayer, MobilizationState } from './types';

function c(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank };
}

function makePlayer(
  id: string,
  hand: Card[],
  isBot: boolean,
  overrides: Partial<MobilizationPlayer> = {},
): MobilizationPlayer {
  return {
    id,
    name: id,
    color: 'red',
    isBot,
    hand,
    tricksThisRound: 0,
    clubsThisRound: 0,
    queensThisRound: 0,
    hadKingClubs: false,
    tookLastTrick: false,
    roundScore: 0,
    totalScore: 0,
    ...overrides,
  };
}

function makeRound3PlayingState(
  players: MobilizationPlayer[],
  opts: {
    currentPlayerIndex?: number;
    leaderIndex?: number;
    currentTrick?: { playerId: string; card: Card }[];
    trickNumber?: number;
    cardsPerTrickRound?: number;
  } = {},
): MobilizationState {
  const currentPlayerIndex = opts.currentPlayerIndex ?? 0;
  const leaderIndex = opts.leaderIndex ?? currentPlayerIndex;
  return {
    players,
    phase: 'playing',
    roundIndex: 3,
    dealerIndex: 0,
    leaderIndex,
    currentPlayerIndex,
    currentTrick: opts.currentTrick ?? [],
    trickWinner: null,
    trickNumber: opts.trickNumber ?? 1,
    cardsPerTrickRound: opts.cardsPerTrickRound ?? 4,
    removedCards: [],
    gameOver: false,
    pigHolderId: null,
    solitaireColumns: [],
  };
}

function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function botPlayedCard(before: MobilizationState, after: MobilizationState): Card | null {
  const botId = before.players[before.currentPlayerIndex]!.id;
  const entry = after.currentTrick.find(t => t.playerId === botId);
  return entry?.card ?? null;
}

describe('runMobilizationBotTurn round 3', () => {
  it('does not lead King of Clubs when other cards are available', () => {
    const before = makeRound3PlayingState([
      makePlayer('bot', [c('clubs', 13), c('hearts', 5), c('diamonds', 3)], true),
      makePlayer('p1', [c('clubs', 2), c('diamonds', 4)], false),
      makePlayer('p2', [c('clubs', 5), c('spades', 6)], false),
      makePlayer('p3', [c('clubs', 7), c('hearts', 8)], false),
    ]);

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(played).not.toBeNull();
    expect(cardEquals(played!, c('clubs', 13))).toBe(false);
    expect(cardEquals(played!, c('hearts', 5))).toBe(true);
  });

  it('leads the highest card when winning the trick has no penalty', () => {
    const before = makeRound3PlayingState([
      makePlayer('bot', [c('diamonds', 3), c('hearts', 5), c('spades', 14)], true),
      makePlayer('p1', [c('clubs', 2), c('clubs', 4)], false),
      makePlayer('p2', [c('clubs', 6), c('clubs', 8)], false),
      makePlayer('p3', [c('clubs', 9), c('clubs', 10)], false),
    ], { trickNumber: 2, cardsPerTrickRound: 4 });

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(cardEquals(played!, c('spades', 14))).toBe(true);
  });

  it('avoids leading a suit that would capture King of Clubs from a void dump', () => {
    const before = makeRound3PlayingState([
      makePlayer('bot', [c('hearts', 14), c('diamonds', 5)], true),
      makePlayer('p1', [c('clubs', 13), c('diamonds', 3)], false),
      makePlayer('p2', [c('clubs', 4), c('clubs', 6)], false),
    ], { trickNumber: 2, cardsPerTrickRound: 4 });

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(cardEquals(played!, c('diamonds', 5))).toBe(true);
  });

  it('leads King of Clubs when it is the only card', () => {
    const before = makeRound3PlayingState([
      makePlayer('bot', [c('clubs', 13)], true),
      makePlayer('p1', [c('hearts', 2)], false),
    ], { cardsPerTrickRound: 1, trickNumber: 1 });

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(cardEquals(played!, c('clubs', 13))).toBe(true);
  });

  it('follows clubs with a lower club instead of King of Clubs', () => {
    const before = makeRound3PlayingState([
      makePlayer('p0', [c('hearts', 2)], false),
      makePlayer('bot', [c('clubs', 13), c('clubs', 4)], true),
      makePlayer('p2', [c('diamonds', 5)], false),
      makePlayer('p3', [c('spades', 6)], false),
    ], {
      currentPlayerIndex: 1,
      leaderIndex: 0,
      currentTrick: [{ playerId: 'p0', card: c('clubs', 3) }],
    });

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(cardEquals(played!, c('clubs', 4))).toBe(true);
  });

  it('sheds high cards when winning the trick has no penalty', () => {
    const before = makeRound3PlayingState([
      makePlayer('bot', [c('hearts', 2), c('spades', 14)], true),
      makePlayer('p1', [c('clubs', 3), c('diamonds', 4)], false),
      makePlayer('p2', [c('clubs', 5), c('diamonds', 6)], false),
      makePlayer('p3', [c('clubs', 7), c('diamonds', 8)], false),
    ], { trickNumber: 2, cardsPerTrickRound: 4 });

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(cardEquals(played!, c('spades', 14))).toBe(true);
  });

  it('retains a low exit card when tricks remain after this one', () => {
    const before = makeRound3PlayingState([
      makePlayer('bot', [c('diamonds', 2), c('spades', 14)], true),
      makePlayer('p1', [c('clubs', 3), c('hearts', 4)], false),
      makePlayer('p2', [c('clubs', 5), c('hearts', 6)], false),
      makePlayer('p3', [c('clubs', 7), c('hearts', 8)], false),
    ], { trickNumber: 3, cardsPerTrickRound: 4 });

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(cardEquals(played!, c('spades', 14))).toBe(true);
    expect(after.players[0]!.hand.some(h => cardEquals(h, c('diamonds', 2)))).toBe(true);
  });

  it('avoids winning the last trick when a losing card is available', () => {
    const before = makeRound3PlayingState([
      makePlayer('p0', [c('hearts', 5)], false),
      makePlayer('bot', [c('diamonds', 2), c('spades', 14)], true),
    ], {
      currentPlayerIndex: 1,
      leaderIndex: 0,
      currentTrick: [{ playerId: 'p0', card: c('hearts', 5) }],
      trickNumber: 4,
      cardsPerTrickRound: 4,
    });

    const after = runMobilizationBotTurn(before) as MobilizationState;
    const played = botPlayedCard(before, after);

    expect(cardEquals(played!, c('diamonds', 2))).toBe(true);
  });
});
