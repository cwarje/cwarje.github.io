export type MinigolfCourseTheme = 'classic' | 'desert' | 'tundra' | 'chocolate' | 'cemetery' | 'jungle' | 'space';
export type MinigolfThemeOption = 'classic' | 'random';

export const MINIGOLF_COURSE_THEMES: readonly MinigolfCourseTheme[] = ['classic', 'desert', 'tundra', 'chocolate', 'cemetery', 'jungle', 'space'];
export const MINIGOLF_THEME_OPTIONS: readonly MinigolfThemeOption[] = ['classic', 'random'];

export interface MinigolfFriction {
  mult: number;
  linear: number;
  /** Extra per-tick multiplier applied while the ball is inside a sand trap. */
  sandTrapMult?: number;
}

export interface MinigolfGenerationWeights {
  gateChance: number;
  hazardBlockChance: number;
  /** When a hazard block is placed (desert only), chance it becomes a sand trap vs sink hazard. */
  sandTrapSplit?: number;
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

export type MinigolfHazardKind = 'water' | 'ice';

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
    friction: { mult: 0.968, linear: 0.005, sandTrapMult: 0.9 },
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
    obstacleEmojis: ['⛄️', '🧊', '🏂'],
    friction: { mult: 0.985, linear: 0.001 },
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
    obstacleEmojis: ['🪦', '👻', '🪾'],
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
    obstacleEmojis: ['🦧', '🦍', '🌴'],
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#2a6b32',
      fairwayAlt: '#358f3f',
      wallFill: '#1a4a22',
      wallEdge: '#0d2812',
      hazardFill: '#1a7a48',
      hazardEdge: '#0f5030',
      hazardHighlight: '#3cb878',
      sandTrapFill: '#f8ecc0',
      sandTrapEdge: '#d8bc78',
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

export function getMinigolfThemeOptionLabel(option: MinigolfThemeOption): string {
  if (option === 'random') return 'Random';
  return MINIGOLF_THEMES[option].label;
}

export function pickRandomCourseTheme(rng: () => number): MinigolfCourseTheme {
  return MINIGOLF_COURSE_THEMES[Math.floor(rng() * MINIGOLF_COURSE_THEMES.length)];
}
