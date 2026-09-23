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

const LOBBY_WAITING_GIFS = [
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

export const LOBBY_WAITING_GIF_COUNT = LOBBY_WAITING_GIFS.length;

export const LOBBY_WAITING_GIF_URLS: readonly string[] = LOBBY_WAITING_GIFS;

export function pickRandomLobbyWaitingGifUrl(): string {
  const index = Math.floor(Math.random() * LOBBY_WAITING_GIF_COUNT);
  return LOBBY_WAITING_GIFS[index];
}
