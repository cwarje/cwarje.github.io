import type { Player } from '../../networking/types';
import { shuffleArray, shufflePlayers } from './shufflePlayers';

function createTestPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `player-${idx + 1}`,
    name: `Player ${idx + 1}`,
    color: 'red',
    isBot: idx > 0,
    isHost: idx === 0,
    connected: true,
  }));
}

describe('shuffleArray', () => {
  it('returns a permutation with the same items', () => {
    const input = [1, 2, 3, 4, 5];
    const output = shuffleArray(input);

    expect(output).toHaveLength(input.length);
    expect(output.sort()).toEqual(input.sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    const snapshot = [...input];
    shuffleArray(input);
    expect(input).toEqual(snapshot);
  });

  it('produces a deterministic order when random is injected', () => {
    const values = [0.1, 0.1, 0.1];
    let call = 0;
    const random = () => values[call++ % values.length];

    expect(shuffleArray(['a', 'b', 'c', 'd'], random)).toEqual(['b', 'c', 'd', 'a']);
    call = 0;
    expect(shuffleArray(['a', 'b', 'c', 'd'], random)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('shufflePlayers', () => {
  it('returns a permutation with the same player ids', () => {
    const players = createTestPlayers(4);
    const shuffled = shufflePlayers(players);

    expect(shuffled).toHaveLength(players.length);
    expect(shuffled.map((p) => p.id).sort()).toEqual(players.map((p) => p.id).sort());
  });

  it('includes bots in the shuffled order', () => {
    const players = createTestPlayers(4);
    const random = () => 0;
    const shuffled = shufflePlayers(players, random);

    expect(shuffled.some((p) => p.isBot)).toBe(true);
    expect(shuffled.map((p) => p.id).sort()).toEqual(players.map((p) => p.id).sort());
  });
});
