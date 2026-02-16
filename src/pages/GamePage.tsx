import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Loader2 } from 'lucide-react';
import { useRoomContext } from '../networking/roomStore';
import { useToast } from '../components/Toast';
import YahtzeeBoard from '../games/yahtzee/YahtzeeBoard';
import HeartsBoard from '../games/hearts/HeartsBoard';
import BattleshipBoard from '../games/battleship/BattleshipBoard';
import LiarsDiceBoard from '../games/liars-dice/LiarsDiceBoard';
import PokerBoard from '../games/poker/PokerBoard';
import type { YahtzeeState } from '../games/yahtzee/types';
import type { HeartsState } from '../games/hearts/types';
import type { BattleshipState } from '../games/battleship/types';
import type { LiarsDiceState } from '../games/liars-dice/types';
import type { PokerState } from '../games/poker/types';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { room, gameState, myId, isHost, sendAction, returnToLobby, leaveRoom, rejoinRoom, connecting, reconnecting, error, clearError } = useRoomContext();
  const { toast } = useToast();
  const rejoinAttempted = useRef(false);
  const hasHadRoom = useRef(!!room);

  useEffect(() => {
    if (room) hasHadRoom.current = true;
  }, [room]);

  // Auto-rejoin: only if we NEVER had a room (direct URL navigation)
  useEffect(() => {
    if (!room && !error && !connecting && roomCode && !rejoinAttempted.current && !hasHadRoom.current) {
      rejoinAttempted.current = true;
      rejoinRoom(roomCode).catch(() => {
        navigate('/');
      });
    }
  }, [room, error, connecting, roomCode, rejoinRoom, navigate]);

  useEffect(() => {
    if (!room && error && !reconnecting) {
      const message = error.includes('Host disconnected') || error.includes('Disconnected from host')
        ? 'Host disconnected. The lobby is closed.'
        : error;
      toast(message, 'info');
      clearError();
      navigate('/');
    }
  }, [room, error, reconnecting, navigate, toast, clearError]);

  // Navigate back to homepage when room returns to lobby phase
  useEffect(() => {
    if (room?.phase === 'lobby') {
      navigate('/');
    }
  }, [room?.phase, navigate]);

  if (!room || !gameState) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">{connecting ? 'Reconnecting...' : 'Loading game...'}</p>
      </div>
    );
  }

  const isFinished = room.phase === 'finished';
  const isPoker = room.gameType === 'poker';
  const pokerState = isPoker ? (gameState as PokerState) : null;
  const isPokerSessionOver = pokerState?.sessionOver ?? false;

  // Show "Back to Lobby" for host when game is finished (non-poker) or poker session is over
  const showBackToLobby = isHost && (
    (isFinished && !isPoker) || (isPoker && isPokerSessionOver)
  );

  const handlePokerLeave = () => {
    leaveRoom();
    toast('Left the table.', 'info');
    navigate('/');
  };

  const handleReturnToLobby = () => {
    returnToLobby();
  };

  return (
    <div className="space-y-6 relative">
      {/* Reconnecting overlay */}
      <AnimatePresence>
        {reconnecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-gray-900/90 border border-white/10">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
              <p className="text-sm font-medium text-gray-300">Reconnecting...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header actions */}
      {showBackToLobby && (
        <div className="flex items-center justify-end">
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={handleReturnToLobby}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Back to Lobby
          </motion.button>
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Game Board */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {room.gameType === 'yahtzee' && (
          <YahtzeeBoard state={gameState as YahtzeeState} myId={myId} onAction={sendAction} />
        )}
        {room.gameType === 'hearts' && (
          <HeartsBoard state={gameState as HeartsState} myId={myId} onAction={sendAction} />
        )}
        {room.gameType === 'battleship' && (
          <BattleshipBoard state={gameState as BattleshipState} myId={myId} onAction={sendAction} />
        )}
        {room.gameType === 'liars-dice' && (
          <LiarsDiceBoard state={gameState as LiarsDiceState} myId={myId} onAction={sendAction} />
        )}
        {room.gameType === 'poker' && (
          <PokerBoard state={gameState as PokerState} myId={myId} onAction={sendAction} isHost={isHost} onLeave={handlePokerLeave} />
        )}
      </motion.div>
    </div>
  );
}
