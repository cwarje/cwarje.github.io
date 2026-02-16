import type { PlayerColor } from './types';

export const PLAYER_COLOR_OPTIONS: { value: PlayerColor; label: string }[] = [
  { value: 'red', label: 'red' },
  { value: 'orange', label: 'orange' },
  { value: 'yellow', label: 'yellow' },
  { value: 'green', label: 'green' },
  { value: 'blue', label: 'blue' },
  { value: 'indigo', label: 'indigo' },
  { value: 'violet', label: 'violet' },
  { value: 'dark-purple', label: 'dark purple' },
];

export const DEFAULT_PLAYER_COLOR: PlayerColor = 'blue';

export const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  'dark-purple': '#581c87',
};

export const DARK_PLAYER_COLORS = new Set<PlayerColor>(['indigo', 'violet', 'dark-purple']);

export function isPlayerColor(value: string | null): value is PlayerColor {
  return !!value && PLAYER_COLOR_OPTIONS.some(option => option.value === value);
}

export function normalizePlayerColor(value: string | null): PlayerColor {
  return isPlayerColor(value) ? value : DEFAULT_PLAYER_COLOR;
}
