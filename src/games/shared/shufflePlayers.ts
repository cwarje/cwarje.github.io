import type { Player } from '../../networking/types';

export function shuffleArray<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function shufflePlayers(players: Player[], random: () => number = Math.random): Player[] {
  return shuffleArray(players, random);
}
