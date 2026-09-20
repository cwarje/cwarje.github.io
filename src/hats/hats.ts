import type { CSSProperties } from 'react';
import type { HatId, Player } from '../networking/types';
import { getLevel } from '../xp/progress';
import partyHatUrl from '../assets/party-hat.png';
import chefHatUrl from '../assets/chef-hat.png';
import captainHatUrl from '../assets/captain-hat.png';
import beanieHatUrl from '../assets/beanie-hat.png';
import cowboyHatUrl from '../assets/cowboy-hat.png';

export const SELECTED_HAT_STORAGE_KEY = 'selectedHat';

export interface HatDefinition {
  id: HatId;
  label: string;
  imageUrl?: string;
  requiredLevel: number;
}

export const HAT_CATALOG: HatDefinition[] = [
  { id: 'none', label: 'No hat', requiredLevel: 0 },
  { id: 'party', label: 'Party hat', imageUrl: partyHatUrl, requiredLevel: 0 },
  { id: 'chef', label: 'Chef hat', imageUrl: chefHatUrl, requiredLevel: 10 },
  { id: 'captain', label: 'Captain hat', imageUrl: captainHatUrl, requiredLevel: 20 },
  { id: 'beanie', label: 'Beanie', imageUrl: beanieHatUrl, requiredLevel: 30 },
  { id: 'cowboy', label: 'Cowboy hat', imageUrl: cowboyHatUrl, requiredLevel: 40 },
];

const HAT_IDS = new Set<HatId>(HAT_CATALOG.map((h) => h.id));

export function getPlayerLevelForPlayer(player: Pick<Player, 'xp'>): number {
  return getLevel(player.xp ?? 0);
}

export function isHatUnlocked(hatId: HatId, level: number): boolean {
  const def = HAT_CATALOG.find((h) => h.id === hatId);
  if (!def) return false;
  return level >= def.requiredLevel;
}

export function countUnlockedWearableHats(level: number): number {
  return HAT_CATALOG.filter((h) => h.id !== 'none' && isHatUnlocked(h.id, level)).length;
}

export function normalizeHatId(raw: unknown): HatId {
  if (typeof raw === 'string' && HAT_IDS.has(raw as HatId)) {
    return raw as HatId;
  }
  return 'none';
}

export function resolveNetworkSelectedHat(
  xp: number,
  requested: HatId | undefined,
  existing?: HatId,
): HatId {
  const level = getLevel(xp);
  if (requested !== undefined) {
    return sanitizeSelectedHat(requested, level);
  }
  if (existing !== undefined) {
    return sanitizeSelectedHat(existing, level);
  }
  return 'none';
}

export function sanitizeSelectedHat(hatId: HatId | undefined, level: number): HatId {
  const normalized = hatId ?? 'none';
  if (normalized === 'none') return 'none';
  return isHatUnlocked(normalized, level) ? normalized : 'none';
}

export function readSelectedHat(): HatId {
  try {
    const raw = localStorage.getItem(SELECTED_HAT_STORAGE_KEY);
    return normalizeHatId(raw);
  } catch {
    return 'none';
  }
}

export function writeSelectedHat(hatId: HatId): void {
  localStorage.setItem(SELECTED_HAT_STORAGE_KEY, hatId);
}

export function getHatImageUrl(hatId: HatId): string | undefined {
  return HAT_CATALOG.find((h) => h.id === hatId)?.imageUrl;
}

export function getSeatPillHatProps(selectedHatId: HatId): {
  className: string;
  style?: CSSProperties;
} {
  if (selectedHatId === 'none') {
    return { className: '' };
  }
  const imageUrl = getHatImageUrl(selectedHatId);
  if (!imageUrl) {
    return { className: '' };
  }
  return {
    className: 'seat-pill--hat',
    style: { ['--seat-pill-hat-url' as string]: `url(${imageUrl})` },
  };
}

export interface LobbyPlayerHatLookup {
  id: string;
  isBot?: boolean;
  xp?: number;
  selectedHat?: HatId;
}

export function getLobbyPlayerSanitizedHatId(
  playerId: string,
  lobbyPlayers: LobbyPlayerHatLookup[] | undefined,
): HatId {
  const lobbyPlayer = lobbyPlayers?.find((p) => p.id === playerId);
  if (!lobbyPlayer || lobbyPlayer.isBot) {
    return 'none';
  }
  const level = getLevel(lobbyPlayer.xp ?? 0);
  return sanitizeSelectedHat(lobbyPlayer.selectedHat, level);
}

export function getSeatPillHatPropsForLobbyPlayer(
  playerId: string,
  lobbyPlayers: LobbyPlayerHatLookup[] | undefined,
): { className: string; style?: CSSProperties } {
  return getSeatPillHatProps(getLobbyPlayerSanitizedHatId(playerId, lobbyPlayers));
}

export function mergeSeatPillHatClassName(baseClassName: string, hatClassName: string): string {
  return hatClassName ? `${baseClassName} ${hatClassName}` : baseClassName;
}

export function mergeSeatPillHatStyle(
  baseStyle: CSSProperties | undefined,
  hatStyle: CSSProperties | undefined,
): CSSProperties | undefined {
  if (!hatStyle) return baseStyle;
  return { ...baseStyle, ...hatStyle };
}
