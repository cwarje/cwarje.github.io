import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { GameType } from '../networking/types';
import { useRoomContext } from '../networking/roomStore';
import { readPlayerXp } from './progress';
import { GAME_REGISTRY } from '../games/registry';
import type { MinigolfState } from '../games/minigolf/types';
import type { PokerState } from '../games/poker/types';
import { computeXpAwardsForGame, isReadyToAwardXp } from './awards';

export interface LastXpAward {
  earned: number;
  priorXp: number;
  gameType: GameType;
}

interface PlayerXpAwardContextValue {
  lastAward: LastXpAward | null;
  clearLastAward: () => void;
}

const PlayerXpAwardContext = createContext<PlayerXpAwardContextValue | null>(null);

export function usePlayerXpAwardContext(): PlayerXpAwardContextValue {
  const ctx = useContext(PlayerXpAwardContext);
  if (!ctx) {
    return { lastAward: null, clearLastAward: () => {} };
  }
  return ctx;
}

function awardSignature(gameType: GameType, state: unknown): string {
  if (gameType === 'minigolf') {
    const s = state as MinigolfState;
    return `minigolf:${s.winners.slice().sort().join(',')}:${s.courses.length}:${s.obstacles}`;
  }
  if (gameType === 'poker') {
    const s = state as PokerState;
    const chips = s.players
      .filter((p) => !p.leftGame)
      .map((p) => `${p.id}:${p.chips}`)
      .sort()
      .join('|');
    return `poker-session:${chips}`;
  }
  const winners = GAME_REGISTRY[gameType].getWinners(state).slice().sort().join(',');
  return `${gameType}:${winners}`;
}

export function PlayerXpAwardProvider({ children }: { children: ReactNode }) {
  const { room, gameState, myId, myPlayer, updatePlayerXp } = useRoomContext();
  const [lastAward, setLastAward] = useState<LastXpAward | null>(null);
  const awardedSignatureRef = useRef<string | null>(null);
  const clearLastAward = useCallback(() => setLastAward(null), []);

  useEffect(() => {
    if (!room?.gameType || !gameState || !myId || myPlayer?.isBot) return;

    const ready = isReadyToAwardXp(room.gameType, gameState);
    if (!ready) {
      awardedSignatureRef.current = null;
      return;
    }

    const signature = awardSignature(room.gameType, gameState);
    if (awardedSignatureRef.current === signature) return;
    awardedSignatureRef.current = signature;

    const awards = computeXpAwardsForGame(room.gameType, gameState);
    const earned = awards.get(myId) ?? 0;
    if (earned <= 0) return;

    const priorXp = readPlayerXp();
    updatePlayerXp(priorXp + earned);
    setLastAward({ earned, priorXp, gameType: room.gameType });
  }, [room?.gameType, gameState, myId, myPlayer?.isBot, updatePlayerXp]);

  return (
    <PlayerXpAwardContext.Provider value={{ lastAward, clearLastAward }}>
      {children}
    </PlayerXpAwardContext.Provider>
  );
}
