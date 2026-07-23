import type { PlayerColor } from './types';
import { DEFAULT_PLAYER_COLOR, normalizePlayerColor, PLAYER_COLOR_OPTIONS } from './playerColors';

export const FAVORITE_BOTS_CHANGED_EVENT = 'favorite-bots-changed';

export const DEFAULT_BOT_NAMES = [
  'Mr. Doyle',
  'Daniel',
  'Jennifer',
  'Maria',
  'Phil',
  'Vanessa',
  'Bryn',
];

/** @deprecated Use DEFAULT_BOT_NAMES */
export const BOT_NAMES = DEFAULT_BOT_NAMES;

export const MAX_FAVORITE_BOT_NAME_LENGTH = 24;

export interface FavoriteBot {
  id: string;
  name: string;
  color: PlayerColor;
}

const STORAGE_KEY = 'favoriteBots';
const LAST_SELECTED_KEY = 'lastSelectedBotIds';

const DEFAULT_SEED_COLORS: PlayerColor[] = PLAYER_COLOR_OPTIONS.map((o) => o.value);

function defaultBotId(name: string): string {
  return `default-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function createDefaultBot(name: string, colorIndex: number): FavoriteBot {
  return {
    id: defaultBotId(name),
    name,
    color: DEFAULT_SEED_COLORS[colorIndex % DEFAULT_SEED_COLORS.length],
  };
}

function isDefaultBot(bot: FavoriteBot): boolean {
  return (
    bot.id.startsWith('default-')
    || DEFAULT_BOT_NAMES.some((n) => n.toLowerCase() === bot.name.toLowerCase())
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isValidFavoriteBot(value: unknown): value is FavoriteBot {
  if (typeof value !== 'object' || value === null) return false;
  const bot = value as Record<string, unknown>;
  return (
    typeof bot.id === 'string'
    && bot.id.length > 0
    && typeof bot.name === 'string'
    && bot.name.trim().length > 0
    && bot.name.length <= MAX_FAVORITE_BOT_NAME_LENGTH
    && typeof bot.color === 'string'
    && PLAYER_COLOR_OPTIONS.some((o) => o.value === bot.color)
  );
}

function normalizeFavoriteBot(bot: FavoriteBot): FavoriteBot {
  return {
    id: bot.id,
    name: bot.name.trim(),
    color: normalizePlayerColor(bot.color),
  };
}

function notifyFavoriteBotsChanged(): void {
  window.dispatchEvent(new Event(FAVORITE_BOTS_CHANGED_EVENT));
}

/** Player-created bots saved in localStorage (defaults are never stored here). */
export function readCustomBots(): FavoriteBot[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const custom = parsed
      .filter(isValidFavoriteBot)
      .map(normalizeFavoriteBot)
      .filter((bot) => !isDefaultBot(bot));

    if (custom.length !== parsed.filter(isValidFavoriteBot).length) {
      writeCustomBots(custom);
    }

    return custom;
  } catch {
    return [];
  }
}

/** @deprecated Use readCustomBots */
export function readFavoriteBots(): FavoriteBot[] {
  return readCustomBots();
}

export function writeCustomBots(bots: FavoriteBot[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bots));
  notifyFavoriteBotsChanged();
}

export function writeFavoriteBots(bots: FavoriteBot[]): void {
  writeCustomBots(bots);
}

export function addFavoriteBot(name: string, color: PlayerColor): FavoriteBot | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_FAVORITE_BOT_NAME_LENGTH) return null;

  const bot: FavoriteBot = {
    id: crypto.randomUUID(),
    name: trimmed,
    color: normalizePlayerColor(color),
  };
  const bots = readCustomBots();
  writeCustomBots([...bots, bot]);
  return bot;
}

export function updateFavoriteBot(id: string, name: string, color: PlayerColor): FavoriteBot | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_FAVORITE_BOT_NAME_LENGTH) return null;

  const bots = readCustomBots();
  const index = bots.findIndex((b) => b.id === id);
  if (index < 0) return null;

  const updated: FavoriteBot = {
    id,
    name: trimmed,
    color: normalizePlayerColor(color),
  };
  const next = [...bots];
  next[index] = updated;
  writeCustomBots(next);
  return updated;
}

export function removeFavoriteBot(id: string): void {
  const bots = readCustomBots().filter((b) => b.id !== id);
  writeCustomBots(bots);
}

export function readLastSelectedBotIds(): string[] {
  const raw = localStorage.getItem(LAST_SELECTED_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function writeLastSelectedBotIds(ids: string[]): void {
  localStorage.setItem(LAST_SELECTED_KEY, JSON.stringify(ids));
}

/** Pick bots for a game: preferred custom bots first, then random defaults, then generic fallbacks. */
export function resolveBotsForCount(
  count: number,
  preferredIds: string[] = [],
  usedNames: string[] = [],
  customBots: FavoriteBot[] = readCustomBots(),
): FavoriteBot[] {
  if (count <= 0) return [];

  const used = new Set(usedNames.map((n) => n.toLowerCase()));
  const selected: FavoriteBot[] = [];
  const usedIds = new Set<string>();

  for (const id of preferredIds) {
    if (selected.length >= count) break;
    const bot = customBots.find((b) => b.id === id);
    if (!bot || usedIds.has(bot.id) || used.has(bot.name.toLowerCase())) continue;
    selected.push(bot);
    usedIds.add(bot.id);
    used.add(bot.name.toLowerCase());
  }

  for (const bot of customBots) {
    if (selected.length >= count) break;
    if (usedIds.has(bot.id) || used.has(bot.name.toLowerCase())) continue;
    selected.push(bot);
    usedIds.add(bot.id);
    used.add(bot.name.toLowerCase());
  }

  const defaultBots = shuffle(
    DEFAULT_BOT_NAMES.map((name, i) => createDefaultBot(name, i)),
  );
  for (const bot of defaultBots) {
    if (selected.length >= count) break;
    if (used.has(bot.name.toLowerCase())) continue;
    selected.push(bot);
    used.add(bot.name.toLowerCase());
  }

  let fallbackIndex = 1;
  while (selected.length < count) {
    const name = `Bot ${fallbackIndex++}`;
    if (used.has(name.toLowerCase())) continue;
    selected.push({
      id: `fallback-${name}`,
      name,
      color: DEFAULT_PLAYER_COLOR,
    });
    used.add(name.toLowerCase());
  }

  return selected;
}
