import { describe, expect, it } from 'vitest';
import type { Card, GolfPlayer, Rank, TableSlot } from './types';
import {
  bestSwapImprovement,
  bestSwapSlot,
  createGolfStateForTest,
  runGolfBotTurn,
  swapTableScoreImprovement,
} from './logic';

function card(rank: Rank, suit: Card['suit'] = 'hearts'): Card {
  return { rank, suit };
}

function slot(c: Card, faceUp = true): TableSlot {
  return { card: c, faceUp };
}

function makeBot(id: string, table: TableSlot[], totalScore = 0): GolfPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: true,
    table,
    totalScore,
  };
}

function makeHuman(id: string, table: TableSlot[], totalScore = 0): GolfPlayer {
  return {
    id,
    name: id,
    color: 'red',
    isBot: false,
    table,
    totalScore,
  };
}

describe('swapTableScoreImprovement', () => {
  it('uses actual hidden card values, not the face-down estimate', () => {
    const bot = makeBot('bot', [
      slot(card(13, 'hearts'), false),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(10, 'spades'), true),
      slot(card(5), true),
      slot(card(2), true),
    ]);

    expect(swapTableScoreImprovement(bot, card(9), 0)).toBe(-9);
    expect(swapTableScoreImprovement(bot, card(9), 3)).toBe(1);
  });

  it('counts column-pair cancellation across the full table', () => {
    const bot = makeBot('bot', [
      slot(card(7, 'hearts'), false),
      slot(card(3), true),
      slot(card(9), true),
      slot(card(7, 'spades'), true),
      slot(card(4), true),
      slot(card(2), true),
    ]);

    expect(swapTableScoreImprovement(bot, card(5), 0)).toBe(-12);
    expect(bestSwapImprovement(bot, card(5))).toBe(4);
  });

  it('measures improvement when replacing a hidden jack with a low card', () => {
    const bot = makeBot('bot', [
      slot(card(11, 'hearts'), false),
      slot(card(4), true),
      slot(card(8), true),
      slot(card(9), true),
      slot(card(5), true),
      slot(card(6), true),
    ]);

    expect(swapTableScoreImprovement(bot, card(3, 'spades'), 0)).toBe(7);
    expect(bestSwapImprovement(bot, card(3, 'spades'))).toBe(7);
  });
});

describe('bestSwapSlot', () => {
  it('preserves a hidden column pair instead of swapping the matching card away', () => {
    const bot = makeBot('bot', [
      slot(card(7, 'hearts'), false),
      slot(card(3), true),
      slot(card(9), true),
      slot(card(7, 'spades'), true),
      slot(card(4), true),
      slot(card(2), true),
    ]);

    expect(bestSwapSlot(bot, card(6))).not.toBe(0);
    expect(bestSwapSlot(bot, card(6))).not.toBe(3);
  });

  it('does not swap away a hidden king for a marginal draw', () => {
    const bot = makeBot('bot', [
      slot(card(13, 'clubs'), false),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(10, 'diamonds'), true),
      slot(card(5), true),
      slot(card(2), true),
    ]);

    expect(bestSwapSlot(bot, card(9))).not.toBe(0);
  });
});

describe('runGolfBotTurn', () => {
  it('takes a king from discard when it improves the table', () => {
    const bot = makeBot('bot', [
      slot(card(2), true),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(10, 'spades'), true),
      slot(card(5), true),
      slot(card(6), true),
    ]);
    const state = createGolfStateForTest([bot], 1, {
      stock: [card(9, 'diamonds')],
      discard: [card(4, 'clubs'), card(13, 'hearts')],
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.pendingDraw).toEqual(card(13, 'hearts'));
    expect(next.pendingDrawSource).toBe('discard');
  });

  it('swaps a stock draw into a hidden high card using accurate scoring', () => {
    const bot = makeBot('bot', [
      slot(card(11, 'hearts'), false),
      slot(card(4), true),
      slot(card(8), true),
      slot(card(9), true),
      slot(card(5), true),
      slot(card(6), true),
    ]);
    const state = createGolfStateForTest([bot], 1, {
      stock: [card(3, 'spades')],
      discard: [card(4, 'clubs')],
      pendingDraw: card(3, 'spades'),
      pendingDrawSource: 'stock',
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.players[0].table[0].card).toEqual(card(3, 'spades'));
    expect(next.players[0].table[0].faceUp).toBe(true);
    expect(next.discard.at(-1)).toEqual(card(11, 'hearts'));
  });

  it('discards a stock draw that does not improve the table', () => {
    const bot = makeBot('bot', [
      slot(card(2), true),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(5), true),
      slot(card(6), true),
      slot(card(7), true),
    ]);
    const state = createGolfStateForTest([bot], 1, {
      stock: [],
      discard: [card(4, 'clubs')],
      pendingDraw: card(10, 'spades'),
      pendingDrawSource: 'stock',
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.pendingDraw).toBeNull();
    expect(next.discard.at(-1)).toEqual(card(10, 'spades'));
  });

  it('prefers flipping the last face-down card when ahead to end the round', () => {
    const bot = makeBot('bot', [
      slot(card(13, 'hearts'), true),
      slot(card(13, 'diamonds'), true),
      slot(card(13, 'clubs'), true),
      slot(card(13, 'spades'), true),
      slot(card(13, 'hearts'), true),
      slot(card(13, 'clubs'), false),
    ]);
    const opponent = makeHuman('human', [
      slot(card(10), true),
      slot(card(10, 'diamonds'), true),
      slot(card(10, 'clubs'), true),
      slot(card(10, 'spades'), true),
      slot(card(9), true),
      slot(card(9, 'diamonds'), true),
    ]);
    const state = createGolfStateForTest([bot, opponent], 1, {
      currentPlayerIndex: 0,
      stock: [card(13, 'spades')],
      discard: [card(8, 'clubs')],
      pendingDraw: card(13, 'spades'),
      pendingDrawSource: 'stock',
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.players[0].table[5].faceUp).toBe(true);
  });

  it('avoids flipping the last hidden card when far behind unless the swap is strong', () => {
    const bot = makeBot('bot', [
      slot(card(8), true),
      slot(card(9), true),
      slot(card(9, 'clubs'), true),
      slot(card(7), true),
      slot(card(6), true),
      slot(card(13, 'hearts'), false),
    ]);
    const opponent = makeHuman('human', [
      slot(card(2), true),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(5), true),
      slot(card(6), true),
      slot(card(7), true),
    ]);
    const state = createGolfStateForTest([bot, opponent], 1, {
      currentPlayerIndex: 0,
      stock: [card(10, 'diamonds')],
      discard: [card(8, 'clubs')],
      pendingDraw: card(11, 'spades'),
      pendingDrawSource: 'stock',
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.players[0].table[5].faceUp).toBe(false);
    expect(next.pendingDraw).toBeNull();
    expect(next.discard.at(-1)).toEqual(card(11, 'spades'));
  });

  it('avoids gifting a discard that completes an opponent column pair', () => {
    const bot = makeBot('bot', [
      slot(card(2), true),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(5), true),
      slot(card(6), true),
      slot(card(7, 'clubs'), true),
    ]);
    const opponent = makeHuman('human', [
      slot(card(9), true),
      slot(card(8), true),
      slot(card(6, 'diamonds'), true),
      slot(card(7, 'spades'), true),
      slot(card(4, 'diamonds'), true),
      slot(card(2, 'clubs'), true),
    ]);
    const state = createGolfStateForTest([bot, opponent], 1, {
      stock: [card(14, 'hearts')],
      discard: [card(8, 'clubs')],
      pendingDraw: card(7, 'hearts'),
      pendingDrawSource: 'stock',
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.discard.at(-1)?.rank).not.toBe(7);
  });
});

describe('runGolfBotTurn integration', () => {
  it('draws from stock when discard improvement is too small', () => {
    const bot = makeBot('bot', [
      slot(card(2), true),
      slot(card(3), true),
      slot(card(5), true),
      slot(card(8), true),
      slot(card(9), true),
      slot(card(10, 'clubs'), true),
    ]);
    const state = createGolfStateForTest([bot], 1, {
      stock: [card(8, 'diamonds')],
      discard: [card(4, 'clubs'), card(11, 'spades')],
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.pendingDraw).toEqual(card(8, 'diamonds'));
    expect(next.pendingDrawSource).toBe('stock');
  });

  it('takes discard when it completes a column pair', () => {
    const bot = makeBot('bot', [
      slot(card(2), true),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(5), true),
      slot(card(6), true),
      slot(card(7), true),
    ]);
    const state = createGolfStateForTest([bot], 1, {
      stock: [card(8, 'diamonds')],
      discard: [card(4, 'clubs'), card(7, 'spades')],
    });

    const next = runGolfBotTurn(state) as typeof state;
    expect(next.pendingDraw).toEqual(card(7, 'spades'));
    expect(next.pendingDrawSource).toBe('discard');
  });

  it('completes a discard swap when required', () => {
    const bot = makeBot('bot', [
      slot(card(2), true),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(10, 'spades'), true),
      slot(card(5), true),
      slot(card(6), true),
    ]);
    let state = createGolfStateForTest([bot], 1, {
      stock: [card(9, 'diamonds')],
      discard: [card(4, 'clubs'), card(13, 'hearts')],
    });

    state = runGolfBotTurn(state) as typeof state;
    state = runGolfBotTurn(state) as typeof state;

    expect(state.pendingDraw).toBeNull();
    expect(state.players[0].table.some(tableSlot => tableSlot.card.rank === 13)).toBe(true);
  });
});
