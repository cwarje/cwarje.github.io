import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFavoriteBot,
  DEFAULT_BOT_NAMES,
  readCustomBots,
  readLastSelectedBotIds,
  removeFavoriteBot,
  resolveBotsForCount,
  updateFavoriteBot,
  writeCustomBots,
  writeLastSelectedBotIds,
} from './favoriteBots';

describe('favoriteBots', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => `uuid-${Math.random().toString(36).slice(2, 8)}`,
    });
  });

  afterEach(() => {
    window.localStorage.removeItem('favoriteBots');
    window.localStorage.removeItem('lastSelectedBotIds');
    vi.unstubAllGlobals();
  });

  it('starts with no custom bots saved', () => {
    expect(readCustomBots()).toEqual([]);
  });

  it('filters seeded default bots out of stored custom bots', () => {
    window.localStorage.setItem(
      'favoriteBots',
      JSON.stringify([
        { id: 'default-mr-doyle', name: 'Mr. Doyle', color: 'red' },
        { id: 'custom-1', name: 'R2-D2', color: 'blue' },
      ]),
    );

    expect(readCustomBots()).toEqual([
      { id: 'custom-1', name: 'R2-D2', color: 'blue' },
    ]);
  });

  it('adds, updates, and removes custom bots', () => {
    writeCustomBots([]);
    const added = addFavoriteBot('R2-D2', 'blue');
    expect(added).not.toBeNull();

    let bots = readCustomBots();
    expect(bots).toHaveLength(1);
    expect(bots[0].name).toBe('R2-D2');

    const updated = updateFavoriteBot(bots[0].id, 'C-3PO', 'yellow');
    expect(updated?.name).toBe('C-3PO');
    expect(updated?.color).toBe('yellow');

    removeFavoriteBot(bots[0].id);
    bots = readCustomBots();
    expect(bots).toHaveLength(0);
  });

  it('rejects empty or overly long bot names', () => {
    writeCustomBots([]);
    expect(addFavoriteBot('', 'blue')).toBeNull();
    expect(addFavoriteBot('   ', 'blue')).toBeNull();
    expect(addFavoriteBot('x'.repeat(25), 'blue')).toBeNull();
  });

  it('persists last selected bot ids', () => {
    writeLastSelectedBotIds(['a', 'b']);
    expect(readLastSelectedBotIds()).toEqual(['a', 'b']);
  });

  it('fills missing bots from random defaults when resolving', () => {
    writeCustomBots([{ id: 'custom-1', name: 'R2-D2', color: 'blue' }]);
    const resolved = resolveBotsForCount(3, ['custom-1'], [], readCustomBots());
    expect(resolved).toHaveLength(3);
    expect(resolved[0].name).toBe('R2-D2');
    expect(resolved.slice(1).every((b) => DEFAULT_BOT_NAMES.includes(b.name))).toBe(true);
  });

  it('uses defaults when no custom bots exist', () => {
    const resolved = resolveBotsForCount(3, [], [], []);
    expect(resolved).toHaveLength(3);
    expect(resolved.every((b) => DEFAULT_BOT_NAMES.includes(b.name))).toBe(true);
  });
});
