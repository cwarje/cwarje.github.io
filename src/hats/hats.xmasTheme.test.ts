import { describe, it, expect } from 'vitest';

vi.mock('../siteTheme', () => ({
  SITE_XMAS_THEME_ENABLED: false,
  SITE_HEADER_TITLE: "Cam's Fav Games",
}));

import { getLobbyPlayerSanitizedHatId } from './hats';

describe('hats christmas theme', () => {
  it('does not show elf hats on bots when SITE_XMAS_THEME_ENABLED is false', () => {
    const lobby = [{ id: 'bot', isBot: true, xp: 0, selectedHat: 'party' as const }];
    expect(getLobbyPlayerSanitizedHatId('bot', lobby)).toBe('none');
  });
});