import { describe, expect, it } from 'vitest';
import {
  LOBBY_WAITING_GIF_COUNT,
  lobbyWaitingGifIndex,
  lobbyWaitingGifUrl,
} from './waitingGif';

describe('lobbyWaitingGif', () => {
  it('maps the same room code to the same index and URL', () => {
    expect(lobbyWaitingGifIndex('abcd')).toBe(lobbyWaitingGifIndex('ABCD'));
    expect(lobbyWaitingGifUrl('abcd')).toBe(lobbyWaitingGifUrl('ABCD'));
  });

  it('returns an index in range for any code', () => {
    for (const code of ['AAAA', 'ABCD', 'WXYZ', 'ZZZZ']) {
      const index = lobbyWaitingGifIndex(code);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(LOBBY_WAITING_GIF_COUNT);
    }
  });

  it('can differ across room codes', () => {
    const indices = new Set(['ABCD', 'WXYZ', 'QWER', 'HJKL'].map(lobbyWaitingGifIndex));
    expect(indices.size).toBeGreaterThan(1);
  });
});
