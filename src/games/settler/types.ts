import type { PlayerColor } from '../../networking/types';

export type Terrain = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | 'desert';
export type Resource = Exclude<Terrain, 'desert'>;

/** Harbor tile on a coastal vertex (standard 4× 3:1 + 5× 2:1). */
export type HarborKind =
  | { kind: 'generic-3' }
  | { kind: 'special-2'; resource: Resource };

export const RESOURCE_LIST: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

/** Standard Catan supply: 19 cards per resource type in the bank at game start (95 total). */
export const BANK_CARDS_PER_RESOURCE = 19;

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

export function initialBank(): ResourceHand {
  return {
    wood: BANK_CARDS_PER_RESOURCE,
    brick: BANK_CARDS_PER_RESOURCE,
    sheep: BANK_CARDS_PER_RESOURCE,
    wheat: BANK_CARDS_PER_RESOURCE,
    ore: BANK_CARDS_PER_RESOURCE,
  };
}

export function depositToBank(bank: ResourceHand, r: Resource, n: number): ResourceHand {
  return { ...bank, [r]: bank[r] + n };
}

export function withdrawFromBank(
  bank: ResourceHand,
  r: Resource,
  n: number
): { bank: ResourceHand; taken: number } {
  const taken = Math.min(n, bank[r]);
  return { bank: { ...bank, [r]: bank[r] - taken }, taken };
}

export function handTotal(h: ResourceHand): number {
  return h.wood + h.brick + h.sheep + h.wheat + h.ore;
}

export function totalDevCardCount(h: DevCardHand): number {
  return (
    h.knight +
    h['victory-point'] +
    h['road-building'] +
    h['year-of-plenty'] +
    h.monopoly
  );
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

/** Only present while `phase === 'setup-order-roll'`. */
export interface SetupOrderRollState {
  /** Player ids still to roll in the current wave (seat / join order). */
  remainingIds: string[];
  /** Sums from the current wave only (cleared when starting a new wave). */
  waveScores: Record<string, number>;
  /**
   * Working turn order (player ids, highest roll first). Empty until the first wave completes.
   */
  orderedIds: string[];
  /**
   * Ordering key (see logic): starts as initial 2d6 sum; after each resolved tie-break,
   * `key = key * 100 + waveSum` so tie-break values are not compared directly to outsiders.
   */
  rankScores: Record<string, number>;
  /** Inclusive range in `orderedIds` for the tie-break currently in progress. */
  tieResolveRange?: { start: number; end: number };
}

/**
 * High-level turn flow: **setup-order-roll**, then **setup-settlement** / **setup-road** (snake order),
 * then repeating **pre-roll** → (on 7: **discard** …) until **finished**.
 */
export type Phase =
  | 'setup-order-roll'
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
  /** Resource cards remaining in the supply (not in any player's hand). */
  bank: ResourceHand;
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
  /** Active player offered a trade; target may accept or decline. */
  pendingDomesticTrade: PendingDomesticTrade | null;
  /**
   * Harbor kinds keyed by coastal edge id (`EdgeLayout.id`, one land hex). Random per game.
   * Omitted in legacy persisted state.
   */
  portKindsByCoastalEdgeId?: Record<string, HarborKind>;
  /** Host-set Unix ms when the current idle human must act; null if no timer (bots, finished). */
  turnDeadlineAt?: number | null;
  /**
   * Permutation of indices 0..n-1: setup snake step k acts as `players[setupTurnOrder[k]]`.
   * Omitted in legacy state (treated as identity).
   */
  setupTurnOrder?: number[];
  /** Dice contest for setup order; only while `phase === 'setup-order-roll'`. */
  setupOrderRoll?: SetupOrderRollState;
  /**
   * Player id whose setup-order roll is currently being shown in the sidebar dice slot.
   * Cleared when setup-order rolling is not active.
   */
  setupOrderDisplayRollerId?: string | null;
}

export interface PendingDomesticTrade {
  proposerId: string;
  targetId: string;
  give: Partial<Record<Resource, number>>;
  want: Partial<Record<Resource, number>>;
}

/**
 * Every mutation the UI requests goes through `onAction` as one of these shapes — toolbar buttons,
 * hex/edge/vertex clicks, and sidebar dice roll. The host calls `processSettlerAction` with the
 * authenticated player id.
 */
export type SettlerAction =
  | { type: 'place-settlement'; vertexId: number }
  | { type: 'place-road'; edgeId: string }
  | { type: 'roll-setup-order' }
  | { type: 'roll' }
  | { type: 'discard'; cards: Partial<Record<Resource, number>> }
  | { type: 'move-robber'; hexIndex: number }
  | { type: 'steal-from'; victimId: string }
  | { type: 'build-road'; edgeId: string }
  | { type: 'place-free-road'; edgeId: string }
  | { type: 'skip-free-road' }
  | { type: 'build-settlement'; vertexId: number }
  | { type: 'build-city'; vertexId: number }
  | { type: 'maritime-trade'; give: Resource; receive: Resource; ratio: 2 | 3 | 4 }
  | {
      type: 'propose-domestic-trade';
      targetId: string;
      give: Partial<Record<Resource, number>>;
      want: Partial<Record<Resource, number>>;
    }
  | { type: 'respond-domestic-trade'; accept: boolean }
  | { type: 'cancel-domestic-trade' }
  | { type: 'buy-dev-card' }
  | { type: 'play-knight' }
  | { type: 'play-road-building' }
  | { type: 'play-year-of-plenty'; resourceA: Resource; resourceB: Resource }
  | { type: 'play-monopoly'; resource: Resource }
  | { type: 'end-turn' };

export const VP_TO_WIN = 10;

/** Base-game piece supply per player */
export const MAX_ROADS_PER_PLAYER = 15;
export const MAX_SETTLEMENTS_PER_PLAYER = 5;
export const MAX_CITIES_PER_PLAYER = 4;

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
