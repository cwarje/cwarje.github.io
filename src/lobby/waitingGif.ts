import bean1Gif from '../assets/bean1.gif';
import bean2Gif from '../assets/bean2.gif';
import bean3Gif from '../assets/bean3.gif';
import bean4Gif from '../assets/bean4.gif';
import bean5Gif from '../assets/bean5.gif';
import bean6Gif from '../assets/bean6.gif';
import bean7Gif from '../assets/bean7.gif';
import bean8Gif from '../assets/bean8.gif';
import bean9Gif from '../assets/bean9.gif';
import bean10Gif from '../assets/bean10.gif';
import xmas1Gif from '../assets/xmas1.gif';
import xmas2Gif from '../assets/xmas2.gif';
import xmas3Gif from '../assets/xmas3.gif';
import xmas4Gif from '../assets/xmas4.gif';
import xmas5Gif from '../assets/xmas5.gif';
import xmas6Gif from '../assets/xmas6.gif';
import xmas7Gif from '../assets/xmas7.gif';
import xmas8Gif from '../assets/xmas8.gif';
import xmas9Gif from '../assets/xmas9.gif';
import xmas10Gif from '../assets/xmas10.gif';
import { SITE_XMAS_THEME_ENABLED } from '../siteTheme';

const LOBBY_WAITING_BEAN_GIFS = [
  bean1Gif,
  bean2Gif,
  bean3Gif,
  bean4Gif,
  bean5Gif,
  bean6Gif,
  bean7Gif,
  bean8Gif,
  bean9Gif,
  bean10Gif,
] as const;

const LOBBY_WAITING_XMAS_GIFS = [
  xmas1Gif,
  xmas2Gif,
  xmas3Gif,
  xmas4Gif,
  xmas5Gif,
  xmas6Gif,
  xmas7Gif,
  xmas8Gif,
  xmas9Gif,
  xmas10Gif,
] as const;

const LOBBY_WAITING_GIFS = SITE_XMAS_THEME_ENABLED
  ? LOBBY_WAITING_XMAS_GIFS
  : LOBBY_WAITING_BEAN_GIFS;

export const LOBBY_WAITING_GIF_COUNT = LOBBY_WAITING_GIFS.length;

export const LOBBY_WAITING_GIF_URLS: readonly string[] = LOBBY_WAITING_GIFS;

export function pickRandomLobbyWaitingGifUrl(): string {
  const index = Math.floor(Math.random() * LOBBY_WAITING_GIF_COUNT);
  return LOBBY_WAITING_GIFS[index];
}