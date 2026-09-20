import type { GameTheme } from '../games/registry';

export type ProgressSectionTheme = GameTheme & {
  /** Darker primary than the level badge, same hue as the section. */
  progressBarFill: string;
};

const levelBadgeBackground = 'bg-primary-800/50';
const progressBarFillBackground = 'bg-primary-950/60';

/** Matches Double XP Weekend badge (`--color-primary-600` / indigo). */
export const PROGRESS_SECTION_THEME: ProgressSectionTheme = {
  gradient: 'from-primary-600 to-primary-700',
  cardBorder: 'border-primary-400/35',
  hoverBorder: 'hover:border-primary-400/55',
  playersTag: `${levelBadgeBackground} text-white border border-primary-300/25`,
  iconColor: 'text-white',
  buttonColors: 'bg-primary-600 hover:bg-primary-500',
  panelBg: 'bg-primary-950',
  labelColor: 'text-white',
  progressBarFill: progressBarFillBackground,
};
