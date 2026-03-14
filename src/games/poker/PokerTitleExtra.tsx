import type { PokerState } from './types';
import type { GameHudProps } from '../registry';

export default function PokerTitleExtra({ state }: GameHudProps) {
  const s = state as PokerState;
  if (s.handNumber == null || s.handNumber <= 0) return null;
  return <p className="text-xs sm:text-sm text-white/80">Hand #{s.handNumber}</p>;
}
