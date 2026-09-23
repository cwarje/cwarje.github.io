import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOBBY_WAITING_GIF_COUNT,
  LOBBY_WAITING_GIF_URLS,
  pickRandomLobbyWaitingGifUrl,
} from './waitingGif';

describe('lobbyWaitingGif', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a URL from the lobby GIF set', () => {
    const url = pickRandomLobbyWaitingGifUrl();
    expect(LOBBY_WAITING_GIF_URLS).toContain(url);
  });

  it('uses Math.random to pick an index in range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    expect(pickRandomLobbyWaitingGifUrl()).toBe(LOBBY_WAITING_GIF_URLS[9]);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickRandomLobbyWaitingGifUrl()).toBe(LOBBY_WAITING_GIF_URLS[0]);
  });

  it('never picks an out-of-range index', () => {
    for (let i = 0; i < LOBBY_WAITING_GIF_COUNT; i += 1) {
      const random = (i + 0.5) / LOBBY_WAITING_GIF_COUNT;
      vi.spyOn(Math, 'random').mockReturnValue(random);
      expect(LOBBY_WAITING_GIF_URLS).toContain(pickRandomLobbyWaitingGifUrl());
      vi.restoreAllMocks();
    }
  });
});
