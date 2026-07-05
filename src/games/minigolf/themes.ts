export type MinigolfCourseTheme =
  | 'classic'
  | 'desert'
  | 'tundra'
  | 'chocolate'
  | 'cemetery'
  | 'jungle'
  | 'space'
  | 'sahara'
  | 'farm'
  | 'australia'
  | 'ocean'
  | 'underwater'
  | 'volcano';
export type MinigolfThemeOption = 'classic' | 'random';
export type MinigolfDevThemeOption = 'random' | MinigolfCourseTheme;

export const MINIGOLF_COURSE_THEMES: readonly MinigolfCourseTheme[] = [
  'classic',
  'desert',
  'tundra',
  'chocolate',
  'cemetery',
  'jungle',
  'space',
  'sahara',
  'farm',
  'australia',
  'ocean',
  'underwater',
  'volcano',
];
export const MINIGOLF_THEME_OPTIONS: readonly MinigolfThemeOption[] = ['classic', 'random'];
export const MINIGOLF_DEV_THEME_OPTIONS: readonly MinigolfDevThemeOption[] = [
  'random',
  ...MINIGOLF_COURSE_THEMES,
];

export interface MinigolfFriction {
  mult: number;
  linear: number;
  /** Extra per-tick multiplier applied while the ball is inside a sand/mud trap. */
  sandTrapMult?: number;
  /** Per-tick speed multiplier while the ball is on an ice hazard (>1 speeds up). */
  iceSpeedMult?: number;
  /** Maximum speed allowed while on ice (prevents runaway acceleration). */
  iceSpeedCap?: number;
}

export interface MinigolfGenerationWeights {
  gateChance: number;
  hazardBlockChance: number;
  /** When a hazard block is placed, chance it becomes a sand trap vs sink hazard. */
  sandTrapSplit?: number;
  /** When a hazard block is placed (jungle), chance it becomes a mud trap vs sink hazard. */
  mudTrapSplit?: number;
  /** Cap on water/lava hazard rectangles per hole. */
  maxWaterHazards?: number;
  /** Skip gate walls and solid interior blocks (border walls only). */
  disallowSolidWalls?: boolean;
  /** Never place water/lava hazard rectangles. */
  disallowWaterHazards?: boolean;
  /** Override default landmine count range for this theme. */
  landmineCount?: { min: number; max: number };
}

export interface MinigolfPalette {
  fairwayBase: string;
  fairwayAlt: string;
  wallFill: string;
  wallEdge: string;
  hazardFill: string;
  hazardEdge: string;
  hazardHighlight: string;
  sandTrapFill: string;
  sandTrapEdge: string;
  cupFill: string;
  teeStroke: string;
}

export interface MinigolfChrome {
  boardBg: string;
  summaryPanelBg: string;
  summaryPanelBorder: string;
}

export type MinigolfHazardKind = 'water' | 'ice' | 'lava';

export interface MinigolfThemeConfig {
  label: string;
  hazardKind: MinigolfHazardKind;
  obstacleEmojis: readonly string[];
  friction: MinigolfFriction;
  generation: MinigolfGenerationWeights;
  palette: MinigolfPalette;
  chrome: MinigolfChrome;
}

export const MINIGOLF_THEMES: Record<MinigolfCourseTheme, MinigolfThemeConfig> = {
  classic: {
    label: 'Classic',
    hazardKind: 'water',
    obstacleEmojis: ['🌲', '🌳', '🪨'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#2e8b45',
      fairwayAlt: '#37a04f',
      wallFill: '#7a4f2a',
      wallEdge: '#4a3018',
      hazardFill: '#1e78c8',
      hazardEdge: '#1a5a8a',
      hazardHighlight: '#4da6e8',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#10241a',
      teeStroke: 'rgba(255,255,255,0.35)',
    },
    chrome: {
      boardBg: '#022c22',
      summaryPanelBg: 'rgba(6, 46, 30, 0.95)',
      summaryPanelBorder: 'rgba(255, 255, 255, 0.15)',
    },
  },
  desert: {
    label: 'Desert',
    hazardKind: 'water',
    obstacleEmojis: ['🌵', '🐪', '🐫'],
    friction: { mult: 0.968, linear: 0.005, sandTrapMult: 0.82 },
    generation: { gateChance: 0.4, hazardBlockChance: 0.65, sandTrapSplit: 0.6 },
    palette: {
      fairwayBase: '#c4a35a',
      fairwayAlt: '#d4b86a',
      wallFill: '#b88858',
      wallEdge: '#7a6040',
      hazardFill: '#2a8ec8',
      hazardEdge: '#1a5a8a',
      hazardHighlight: '#6ec0f0',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#3a2818',
      teeStroke: 'rgba(255,255,255,0.45)',
    },
    chrome: {
      boardBg: '#3d2a14',
      summaryPanelBg: 'rgba(61, 42, 20, 0.95)',
      summaryPanelBorder: 'rgba(255, 220, 180, 0.2)',
    },
  },
  tundra: {
    label: 'Tundra',
    hazardKind: 'ice',
    obstacleEmojis: ['⛄️', '🧊', '🎄'],
    friction: { mult: 0.985, linear: 0.001, iceSpeedMult: 1.006, iceSpeedCap: 5.0 },
    generation: { gateChance: 0.7, hazardBlockChance: 0.45 },
    palette: {
      fairwayBase: '#e8f4fc',
      fairwayAlt: '#d0e8f0',
      wallFill: '#d0eeff',
      wallEdge: '#7ab0cc',
      hazardFill: '#a8d4f8',
      hazardEdge: '#5090c8',
      hazardHighlight: '#c8e8ff',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#1a2838',
      teeStroke: 'rgba(80,120,160,0.4)',
    },
    chrome: {
      boardBg: '#1a2838',
      summaryPanelBg: 'rgba(26, 40, 56, 0.95)',
      summaryPanelBorder: 'rgba(200, 220, 240, 0.2)',
    },
  },
  chocolate: {
    label: 'Chocolate',
    hazardKind: 'water',
    obstacleEmojis: ['🍫', '🍩', '🍪'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#8b5a38',
      fairwayAlt: '#9d6844',
      wallFill: '#ed2029',
      wallEdge: '#a81820',
      hazardFill: '#432816',
      hazardEdge: '#2f1c0d',
      hazardHighlight: '#72482b',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#1a0f08',
      teeStroke: 'rgba(255,255,255,0.35)',
    },
    chrome: {
      boardBg: '#2a1410',
      summaryPanelBg: 'rgba(42, 20, 16, 0.95)',
      summaryPanelBorder: 'rgba(255, 200, 180, 0.2)',
    },
  },
  cemetery: {
    label: 'Cemetery',
    hazardKind: 'water',
    obstacleEmojis: ['🪦', '👻', '🪾', '🎃'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#4a5548',
      fairwayAlt: '#3d4638',
      wallFill: '#5c5c5c',
      wallEdge: '#3a3a3a',
      hazardFill: '#1a2838',
      hazardEdge: '#0f1820',
      hazardHighlight: '#2a4058',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#141820',
      teeStroke: 'rgba(200,200,200,0.3)',
    },
    chrome: {
      boardBg: '#1a1c20',
      summaryPanelBg: 'rgba(26, 28, 32, 0.95)',
      summaryPanelBorder: 'rgba(200, 200, 200, 0.15)',
    },
  },
  jungle: {
    label: 'Jungle',
    hazardKind: 'water',
    obstacleEmojis: ['🦧', '🦍', '🌴', '🗿'],
    friction: { mult: 0.978, linear: 0.003, sandTrapMult: 0.9 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5, mudTrapSplit: 0.55 },
    palette: {
      fairwayBase: '#2a6b32',
      fairwayAlt: '#358f3f',
      wallFill: '#1a4a22',
      wallEdge: '#0d2812',
      hazardFill: '#1a7a48',
      hazardEdge: '#0f5030',
      hazardHighlight: '#3cb878',
      sandTrapFill: '#6b4423',
      sandTrapEdge: '#4a3018',
      cupFill: '#0a1a0c',
      teeStroke: 'rgba(255,255,255,0.35)',
    },
    chrome: {
      boardBg: '#0a2010',
      summaryPanelBg: 'rgba(10, 32, 16, 0.95)',
      summaryPanelBorder: 'rgba(160, 220, 160, 0.2)',
    },
  },
  space: {
    label: 'Space',
    hazardKind: 'water',
    obstacleEmojis: ['✨', '🪐', '🛸'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#1a1a1a',
      fairwayAlt: '#121212',
      wallFill: '#000000',
      wallEdge: '#1a1a1a',
      hazardFill: '#000000',
      hazardEdge: '#2a2a2a',
      hazardHighlight: '#505058',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#0a0a0a',
      teeStroke: 'rgba(255,255,255,0.25)',
    },
    chrome: {
      boardBg: '#08080a',
      summaryPanelBg: 'rgba(10, 10, 14, 0.95)',
      summaryPanelBorder: 'rgba(255, 220, 120, 0.15)',
    },
  },
  sahara: {
    label: 'Sahara',
    hazardKind: 'water',
    obstacleEmojis: ['🐅', '🐆', '🐘', '🦛', '🦏', '🦒'],
    friction: { mult: 0.968, linear: 0.005, sandTrapMult: 0.82 },
    generation: {
      gateChance: 0,
      hazardBlockChance: 0.75,
      sandTrapSplit: 0.7,
      maxWaterHazards: 1,
      disallowSolidWalls: true,
      landmineCount: { min: 4, max: 6 },
    },
    palette: {
      fairwayBase: '#d4a855',
      fairwayAlt: '#e0bc68',
      wallFill: '#c89848',
      wallEdge: '#8a6830',
      hazardFill: '#2a8ec8',
      hazardEdge: '#1a5a8a',
      hazardHighlight: '#6ec0f0',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#3a2818',
      teeStroke: 'rgba(255,255,255,0.45)',
    },
    chrome: {
      boardBg: '#4a3018',
      summaryPanelBg: 'rgba(74, 48, 24, 0.95)',
      summaryPanelBorder: 'rgba(255, 220, 180, 0.2)',
    },
  },
  farm: {
    label: 'Farm',
    hazardKind: 'water',
    obstacleEmojis: ['🐖', '🐄', '🐐'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#4a8c38',
      fairwayAlt: '#5aa848',
      wallFill: '#8b6914',
      wallEdge: '#5a4510',
      hazardFill: '#1e78c8',
      hazardEdge: '#1a5a8a',
      hazardHighlight: '#4da6e8',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#1a2810',
      teeStroke: 'rgba(255,255,255,0.35)',
    },
    chrome: {
      boardBg: '#1a3010',
      summaryPanelBg: 'rgba(26, 48, 16, 0.95)',
      summaryPanelBorder: 'rgba(200, 240, 160, 0.2)',
    },
  },
  australia: {
    label: 'Australia',
    hazardKind: 'water',
    obstacleEmojis: ['🦚', '🦘'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: {
      gateChance: 0.5,
      hazardBlockChance: 0.55,
      disallowWaterHazards: true,
      landmineCount: { min: 4, max: 6 },
    },
    palette: {
      fairwayBase: '#c45a30',
      fairwayAlt: '#d47040',
      wallFill: '#a84828',
      wallEdge: '#703018',
      hazardFill: '#2a8ec8',
      hazardEdge: '#1a5a8a',
      hazardHighlight: '#6ec0f0',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#3a1810',
      teeStroke: 'rgba(255,255,255,0.4)',
    },
    chrome: {
      boardBg: '#3a1810',
      summaryPanelBg: 'rgba(58, 24, 16, 0.95)',
      summaryPanelBorder: 'rgba(255, 200, 160, 0.2)',
    },
  },
  ocean: {
    label: 'Ocean',
    hazardKind: 'water',
    obstacleEmojis: ['⛵️', '🚤', '🐳', '🏝️'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: {
      gateChance: 0,
      hazardBlockChance: 0.75,
      disallowSolidWalls: true,
    },
    palette: {
      fairwayBase: '#1a5080',
      fairwayAlt: '#206898',
      wallFill: '#0a3058',
      wallEdge: '#061828',
      hazardFill: '#2088c8',
      hazardEdge: '#1060a0',
      hazardHighlight: '#50b8f0',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#081828',
      teeStroke: 'rgba(255,255,255,0.35)',
    },
    chrome: {
      boardBg: '#081828',
      summaryPanelBg: 'rgba(8, 24, 40, 0.95)',
      summaryPanelBorder: 'rgba(160, 220, 255, 0.2)',
    },
  },
  underwater: {
    label: 'Underwater',
    hazardKind: 'water',
    obstacleEmojis: ['🐟', '🐠', '🐡', '🪼', '🪸'],
    friction: { mult: 0.985, linear: 0.001 },
    generation: {
      gateChance: 0,
      hazardBlockChance: 0.75,
      disallowSolidWalls: true,
    },
    palette: {
      fairwayBase: '#1a6878',
      fairwayAlt: '#208090',
      wallFill: '#0a4858',
      wallEdge: '#063038',
      hazardFill: '#1098b8',
      hazardEdge: '#087088',
      hazardHighlight: '#40c8e8',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#081820',
      teeStroke: 'rgba(255,255,255,0.3)',
    },
    chrome: {
      boardBg: '#081820',
      summaryPanelBg: 'rgba(8, 24, 32, 0.95)',
      summaryPanelBorder: 'rgba(160, 240, 255, 0.2)',
    },
  },
  volcano: {
    label: 'Volcano',
    hazardKind: 'lava',
    obstacleEmojis: ['🌋'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#3a3a3a',
      fairwayAlt: '#2a2a2a',
      wallFill: '#2a2a2a',
      wallEdge: '#1a1a1a',
      hazardFill: '#e85810',
      hazardEdge: '#a83808',
      hazardHighlight: '#ff8830',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
      cupFill: '#0a0a0a',
      teeStroke: 'rgba(255,255,255,0.25)',
    },
    chrome: {
      boardBg: '#141010',
      summaryPanelBg: 'rgba(20, 16, 16, 0.95)',
      summaryPanelBorder: 'rgba(255, 120, 60, 0.2)',
    },
  },
};

export function getMinigolfTheme(theme: MinigolfCourseTheme | undefined): MinigolfThemeConfig {
  return MINIGOLF_THEMES[theme ?? 'classic'];
}

export function pickObstacleEmoji(theme: MinigolfCourseTheme, rng: () => number): string {
  const emojis = MINIGOLF_THEMES[theme].obstacleEmojis;
  return emojis[Math.floor(rng() * emojis.length)];
}

export function isFrozenIceHazard(theme: MinigolfCourseTheme): boolean {
  return MINIGOLF_THEMES[theme].hazardKind === 'ice';
}

export function isLavaHazard(theme: MinigolfCourseTheme): boolean {
  return MINIGOLF_THEMES[theme].hazardKind === 'lava';
}

export function isSinkHazard(theme: MinigolfCourseTheme): boolean {
  const kind = MINIGOLF_THEMES[theme].hazardKind;
  return kind === 'water' || kind === 'lava';
}

export function getMinigolfThemeOptionLabel(option: MinigolfThemeOption): string {
  if (option === 'random') return 'Random';
  return MINIGOLF_THEMES[option].label;
}

export function pickRandomCourseTheme(rng: () => number): MinigolfCourseTheme {
  return MINIGOLF_COURSE_THEMES[Math.floor(rng() * MINIGOLF_COURSE_THEMES.length)];
}

export function resolveDevThemeOption(
  option: MinigolfDevThemeOption,
  rng: () => number,
): MinigolfCourseTheme {
  return option === 'random' ? pickRandomCourseTheme(rng) : option;
}

export function getMinigolfDevThemeOptionLabel(option: MinigolfDevThemeOption): string {
  if (option === 'random') return 'Random';
  return MINIGOLF_THEMES[option].label;
}
