import type { GameHudProps } from '../registry';
import { getPlayerHudTextColor } from '../../networking/playerColors';
import type { UpRiverState } from './types';

export default function UpRiverTitleExtra({ state, myId }: GameHudProps) {
  const s = state as UpRiverState;
  const isBiddingPhase =
    s.phase === 'bidding' || s.phase === 'bid-countdown' || s.phase === 'bid-reveal';
  if (!isBiddingPhase) return null;

  const leader = s.players[s.leaderIndex];
  if (!leader) return null;

  return (
    <p className="text-xs sm:text-sm text-white/80">
      {leader.id === myId ? (
        'You lead'
      ) : (
        <>
          <span style={{ color: getPlayerHudTextColor(leader.color) }}>{leader.name}</span>
          {' leads'}
        </>
      )}
    </p>
  );
}
