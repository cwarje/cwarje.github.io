import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Loader2, Search } from 'lucide-react';
import { useRoomContext } from '../networking/roomStore';
import { useToast } from '../components/Toast';
import LobbyMenu from '../components/LobbyMenu';
import { GAME_CATALOG } from '../games/gameCatalog';
import YahtzeeBoard from '../games/yahtzee/YahtzeeBoard';
import HeartsBoard from '../games/hearts/HeartsBoard';
import BattleshipBoard from '../games/battleship/BattleshipBoard';
import LiarsDiceBoard from '../games/liars-dice/LiarsDiceBoard';
import PokerBoard from '../games/poker/PokerBoard';
import UpAndDownTheRiverBoard from '../games/up-and-down-the-river/UpAndDownTheRiverBoard';
import type { YahtzeeState } from '../games/yahtzee/types';
import type { HeartsState } from '../games/hearts/types';
import type { BattleshipState } from '../games/battleship/types';
import type { LiarsDiceState } from '../games/liars-dice/types';
import type { PokerState } from '../games/poker/types';
import type { UpRiverState } from '../games/up-and-down-the-river/types';

function rankDisplay(rank: number | null | undefined): string {
  if (!rank) return '';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { room, gameState, myId, isHost, sendAction, returnToLobby, leaveRoom, rejoinRoom, connecting, reconnecting, error, clearError } = useRoomContext();
  const { toast } = useToast();
  const rejoinAttempted = useRef(false);
  const hasHadRoom = useRef(!!room);
  const [isHandZoomed, setIsHandZoomed] = useState(false);

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
  const isHearts = room.gameType === 'hearts';
  const heartsState = isHearts ? (gameState as HeartsState) : null;
  const isUpRiver = room.gameType === 'up-and-down-the-river';
  const heartsTargetScore = heartsState?.targetScore ?? 100;
  const heartsBroken = heartsState?.heartsBroken ?? false;
  const upRiverState = isUpRiver ? (gameState as UpRiverState) : null;
  const fullBoardGame = isHearts || isUpRiver || room.gameType === 'yahtzee';
  const showHandZoomToggle = isHearts || isUpRiver;
  const gameTitle = room.gameType ? GAME_CATALOG[room.gameType].title : 'Game';
  const suitSymbols = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' } as const;
  const suitColors = { hearts: 'text-red-400', diamonds: 'text-red-400', clubs: 'text-gray-800', spades: 'text-gray-800' } as const;

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
    <div className="relative h-full flex flex-col">
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

      {/* Floating game HUD (no layout height) */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-3 sm:p-4 pointer-events-none">
        <div className="pointer-events-none">
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {room.gameType === 'up-and-down-the-river' ? (
              <>
                Up and Down
                <br />
                the River
              </>
            ) : (
              gameTitle
            )}
          </h1>
          {isHearts && heartsTargetScore && (
            <>
              <p className="text-xs sm:text-sm text-white/80">Game to {heartsTargetScore}</p>
              {heartsBroken && (
                <p className="text-xs sm:text-sm text-white/80">
                  <span className="text-red-400">♥</span> broken
                </p>
              )}
            </>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {isUpRiver && upRiverState?.trumpCard && (
            <div className="river-hudTrumpCard">
              <div className="river-card river-card--compact">
                <div className="river-cardCorner">
                  <span className={`river-cardRank ${suitColors[upRiverState.trumpCard.suit]}`}>{rankDisplay(upRiverState.trumpCard.rank)}</span>
                  <span className={`river-cardSuit ${suitColors[upRiverState.trumpCard.suit]}`}>{suitSymbols[upRiverState.trumpCard.suit]}</span>
                </div>
              </div>
            </div>
          )}
          {showBackToLobby && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleReturnToLobby}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Back to Lobby
            </motion.button>
          )}
          <LobbyMenu variant="icon" />
        </div>
      </div>

      {showHandZoomToggle && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-4 pointer-events-none">
          <div className="pointer-events-auto ml-auto w-fit">
            <button
              type="button"
              onClick={() => setIsHandZoomed(v => !v)}
              className={`flex items-center justify-center w-9 h-9 text-white hover:text-white/80 transition-all duration-150 cursor-pointer group active:scale-90 ${isHandZoomed ? 'scale-90' : ''}`}
              title={isHandZoomed ? 'Shrink hand text' : 'Zoom hand text'}
              aria-label={isHandZoomed ? 'Shrink hand text' : 'Zoom hand text'}
              aria-pressed={isHandZoomed}
            >
              <Search className="w-6 h-6 stroke-white" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-1/2 z-20 w-[min(90vw,40rem)] -translate-x-1/2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Game Board */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={fullBoardGame ? 'h-full p-0' : 'p-4 sm:p-6 lg:p-8'}
        >
          {room.gameType === 'yahtzee' && (
            <YahtzeeBoard state={gameState as YahtzeeState} myId={myId} onAction={sendAction} />
          )}
          {room.gameType === 'hearts' && (
            <HeartsBoard state={gameState as HeartsState} myId={myId} onAction={sendAction} isHandZoomed={isHandZoomed} />
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
          {room.gameType === 'up-and-down-the-river' && (
            <UpAndDownTheRiverBoard state={gameState as UpRiverState} myId={myId} onAction={sendAction} isHandZoomed={isHandZoomed} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
