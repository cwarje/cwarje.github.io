import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import type { TwelveState } from './types';
import { createTwelveState } from './logic';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    color: 'blue' as const,
    isBot: false,
    isHost: i === 0,
    connected: true,
  }));
}

describe('createTwelveState pileCount 0', () => {
  it('deals the full deck to hands with no table piles', () => {
    const state = createTwelveState(makePlayers(4), { pileCount: 0 }) as TwelveState;

    expect(state.pileCount).toBe(0);
    expect(state.players).toHaveLength(4);
    for (const player of state.players) {
      expect(player.frontPiles).toHaveLength(0);
      expect(player.hand).toHaveLength(9);
    }
    const totalCards = state.players.reduce(
      (sum, p) => sum + p.hand.length,
      0,
    );
    expect(totalCards).toBe(36);
  });
});
