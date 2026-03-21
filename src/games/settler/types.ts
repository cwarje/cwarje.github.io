import type { PlayerColor } from '../../networking/types';

export type Terrain = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | 'desert';
export type Resource = Exclude<Terrain, 'desert'>;

export const RESOURCE_LIST: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export const RESOURCE_EMOJI: Record<Resource, string> = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '🪨',
};

export const TERRAIN_EMOJI: Record<Terrain, string> = {
  ...RESOURCE_EMOJI,
  desert: '🏜️',
};

export const TERRAIN_DECK: Terrain[] = [
  ...Array(4).fill('wood'),
  ...Array(4).fill('sheep'),
  ...Array(4).fill('wheat'),
  ...Array(3).fill('brick'),
  ...Array(3).fill('ore'),
  'desert',
] as Terrain[];

/** Number tokens on standard board (18 on non-desert); desert has none */
export const NUMBER_DECK: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

export interface ResourceHand {
  wood: number;
  brick: number;
  sheep: number;
  wheat: number;
  ore: number;
}

export type DevCard =
  | 'knight'
  | 'victory-point'
  | 'road-building'
  | 'year-of-plenty'
  | 'monopoly';

export interface DevCardHand {
  knight: number;
  'victory-point': number;
  'road-building': number;
  'year-of-plenty': number;
  monopoly: number;
}

export function emptyDevHand(): DevCardHand {
  return {
    knight: 0,
    'victory-point': 0,
    'road-building': 0,
    'year-of-plenty': 0,
    monopoly: 0,
  };
}

export function emptyHand(): ResourceHand {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function handTotal(h: ResourceHand): number {
  return h.wood + h.brick + h.sheep + h.wheat + h.ore;
}

export function addResource(h: ResourceHand, r: Resource, n: number): ResourceHand {
  return { ...h, [r]: h[r] + n };
}

export function removeResource(h: ResourceHand, r: Resource, n: number): ResourceHand {
  return { ...h, [r]: Math.max(0, h[r] - n) };
}

export interface SettlerPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: ResourceHand;
  devCards: DevCardHand;
  /** Development cards bought this turn cannot be played until next turn. */
  newDevCards: DevCardHand;
  playedKnights: number;
}

export type BuildKind = 'road' | 'settlement' | 'city';

export interface HexTile {
  terrain: Terrain;
  /** Production number; null only for desert */
  numberToken: number | null;
}

export interface ProductionSummaryEntry {
  playerId: string;
  resource: Resource;
  amount: number;
}

export interface SettlerActionLogEntry {
  playerId: string;
  text: string;
}

export type Phase =
  | 'setup-settlement'
  | 'setup-road'
  | 'pre-roll'
  | 'discard'
  | 'robber-move'
  | 'robber-steal'
  | 'main-build'
  | 'finished';

export interface SettlerState {
  players: SettlerPlayer[];
  hexes: HexTile[];
  robberHexIndex: number;
  /** vertex id -> piece */
  settlements: Record<number, { playerId: string; kind: 'settlement' | 'city' }>;
  /** edge id -> owner */
  roads: Record<string, string>;
  currentPlayerIndex: number;
  phase: Phase;
  /** Setup: 1 then 2 */
  setupRound: 1 | 2;
  /** Index into order array for current round */
  setupOrderIndex: number;
  /** Vertex where settlement was just placed; road must touch this vertex */
  pendingRoadFromVertex: number | null;
  dice: { d1: number; d2: number } | null;
  /** Hex indices that produced on last non-7 roll (UI) */
  lastProductionHexIndices: number[];
  /** Flattened resource distribution from the last production roll. */
  lastProductionSummary: ProductionSummaryEntry[];
  /** Players who must discard (in order) when a 7 is rolled */
  discardQueue: string[];
  /** How many cards each id in discardQueue must still drop */
  discardRequired: Record<string, number>;
  /** After robber placed: victims with ≥1 card */
  robberStealTargets: string[];
  devDeck: DevCard[];
  largestArmyHolderId: string | null;
  longestRoadHolderId: string | null;
  playedDevCardThisTurn: boolean;
  /** Remaining free roads from Road Building card (0-2). */
  roadBuildingRemaining: number;
  actionLog: SettlerActionLogEntry[];
  /** Heads-up message shown by the board. */
  lastEvent: string | null;
  winnerIds: string[] | null;
}

export type SettlerAction =
  | { type: 'place-settlement'; vertexId: number }
  | { type: 'place-road'; edgeId: string }
  | { type: 'roll' }
  | { type: 'discard'; cards: Partial<Record<Resource, number>> }
  | { type: 'move-robber'; hexIndex: number }
  | { type: 'steal-from'; victimId: string }
  | { type: 'build-road'; edgeId: string }
  | { type: 'place-free-road'; edgeId: string }
  | { type: 'skip-free-road' }
  | { type: 'build-settlement'; vertexId: number }
  | { type: 'build-city'; vertexId: number }
  | { type: 'maritime-trade'; give: Resource; receive: Resource }
  | { type: 'buy-dev-card' }
  | { type: 'play-knight' }
  | { type: 'play-road-building' }
  | { type: 'play-year-of-plenty'; resourceA: Resource; resourceB: Resource }
  | { type: 'play-monopoly'; resource: Resource }
  | { type: 'end-turn' };

export const VP_TO_WIN = 10;

export const COSTS: Record<BuildKind, Partial<Record<Resource, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { ore: 3, wheat: 2 },
};

export const DEV_CARD_COST: Partial<Record<Resource, number>> = { sheep: 1, wheat: 1, ore: 1 };

export const DEV_DECK: DevCard[] = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('victory-point'),
  ...Array(2).fill('road-building'),
  ...Array(2).fill('year-of-plenty'),
  ...Array(2).fill('monopoly'),
] as DevCard[];
