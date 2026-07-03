export type MinigolfCourseTheme = 'classic' | 'desert' | 'tundra';
export type MinigolfThemeOption = MinigolfCourseTheme | 'random';

export const MINIGOLF_COURSE_THEMES: readonly MinigolfCourseTheme[] = ['classic', 'desert', 'tundra'];
export const MINIGOLF_THEME_OPTIONS: readonly MinigolfThemeOption[] = [
  ...MINIGOLF_COURSE_THEMES,
  'random',
];

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

export interface MinigolfThemeConfig {
  label: string;
  friction: MinigolfFriction;
  generation: MinigolfGenerationWeights;
  palette: MinigolfPalette;
  chrome: MinigolfChrome;
}

export const MINIGOLF_THEMES: Record<MinigolfCourseTheme, MinigolfThemeConfig> = {
  classic: {
    label: 'Classic',
    friction: { mult: 0.978, linear: 0.003 },
    generation: { gateChance: 0.55, hazardBlockChance: 0.5 },
    palette: {
      fairwayBase: '#2e8b45',
      fairwayAlt: '#37a04f',
      wallFill: '#8a6337',
      wallEdge: '#5f4224',
      hazardFill: '#1e78c8',
      hazardEdge: '#1a5a8a',
      hazardHighlight: '#4da6e8',
      sandTrapFill: '#c4a35a',
      sandTrapEdge: '#9a7a3a',
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
    friction: { mult: 0.968, linear: 0.005, sandTrapMult: 0.9 },
    generation: { gateChance: 0.4, hazardBlockChance: 0.65, sandTrapSplit: 0.6 },
    palette: {
      fairwayBase: '#c4a35a',
      fairwayAlt: '#d4b86a',
      wallFill: '#b8874a',
      wallEdge: '#8a6337',
      hazardFill: '#3a8a7a',
      hazardEdge: '#2a6a5a',
      hazardHighlight: '#5ab8a0',
      sandTrapFill: '#a07840',
      sandTrapEdge: '#7a5a28',
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
    friction: { mult: 0.985, linear: 0.001 },
    generation: { gateChance: 0.7, hazardBlockChance: 0.45 },
    palette: {
      fairwayBase: '#e8f4fc',
      fairwayAlt: '#d0e8f0',
      wallFill: '#7a8a9a',
      wallEdge: '#5a6a7a',
      hazardFill: '#a8d4f0',
      hazardEdge: '#6a9ab8',
      hazardHighlight: '#d0ecff',
      sandTrapFill: '#c0d0e0',
      sandTrapEdge: '#90a0b0',
      cupFill: '#1a2838',
      teeStroke: 'rgba(80,120,160,0.4)',
    },
    chrome: {
      boardBg: '#1a2838',
      summaryPanelBg: 'rgba(26, 40, 56, 0.95)',
      summaryPanelBorder: 'rgba(200, 220, 240, 0.2)',
    },
  },
};

export function getMinigolfTheme(theme: MinigolfCourseTheme | undefined): MinigolfThemeConfig {
  return MINIGOLF_THEMES[theme ?? 'classic'];
}

export function getMinigolfThemeOptionLabel(option: MinigolfThemeOption): string {
  if (option === 'random') return 'Random';
  return MINIGOLF_THEMES[option].label;
}

export function pickRandomCourseTheme(rng: () => number): MinigolfCourseTheme {
  return MINIGOLF_COURSE_THEMES[Math.floor(rng() * MINIGOLF_COURSE_THEMES.length)];
}
