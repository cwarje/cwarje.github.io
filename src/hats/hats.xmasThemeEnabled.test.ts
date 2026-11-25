import { describe, it, expect } from 'vitest';

vi.mock('../siteTheme', () => ({
  SITE_XMAS_THEME_ENABLED: true,
  SITE_HEADER_TITLE: "Santa's Fav Games",
}));

import { getLobbyPlayerSanitizedHatId } from './hats';

describe('hats christmas theme enabled', () => {
  it('shows elf hats on bots when SITE_XMAS_THEME_ENABLED is true', () => {
    const lobby = [{ id: 'bot', isBot: true, xp: 0, selectedHat: 'party' as const }];
    expect(getLobbyPlayerSanitizedHatId('bot', lobby)).toBe('elf');
  });
});