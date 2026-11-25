import queenOfSpadesSound from './assets/queen-of-spades.mp3';
import queenOfSpadesXmasSound from './assets/queen-of-spades-xmas.mp3';

/** Set to `true` before deploying for the holiday homepage snow effect. */
export const SITE_XMAS_THEME_ENABLED = true;

export const SITE_HEADER_TITLE = SITE_XMAS_THEME_ENABLED
  ? "Santa's Fav Games"
  : "Cam's Fav Games";

export const QUEEN_OF_SPADES_SOUND = SITE_XMAS_THEME_ENABLED
  ? queenOfSpadesXmasSound
  : queenOfSpadesSound;