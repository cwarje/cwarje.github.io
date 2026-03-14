import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Loader2, Search } from 'lucide-react';
import { useRoomContext } from '../networking/roomStore';
import { useToast } from '../components/Toast';
import LobbyMenu from '../components/LobbyMenu';
import { GAME_REGISTRY } from '../games/registry';

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

  const gameDef = room.gameType ? GAME_REGISTRY[room.gameType] : null;
  const isFinished = room.phase === 'finished';

  // Show "Back to Lobby" for host when game is finished or poker session is over
  const showBackToLobby = isHost && (
    isFinished || (gameState as Record<string, unknown>)?.sessionOver === true
  );

  const handleLeave = () => {
    leaveRoom();
    toast('Left the table.', 'info');
    navigate('/');
  };

  const Board = gameDef?.Board;

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
            {gameDef?.hudTitleLines
              ? gameDef.hudTitleLines.map((line, i) => (
                  <span key={i}>{i > 0 && <br />}{line}</span>
                ))
              : gameDef?.title ?? 'Game'}
          </h1>
          {gameDef?.TitleExtra && <gameDef.TitleExtra state={gameState} />}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {gameDef?.ToolbarExtra && <gameDef.ToolbarExtra state={gameState} isHandZoomed={gameDef?.hasHandZoom ? isHandZoomed : undefined} />}
          {showBackToLobby && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={returnToLobby}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Back to Lobby
            </motion.button>
          )}
          {gameDef?.hasHandZoom && (
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
          )}
          <LobbyMenu variant="icon" />
        </div>
      </div>

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
          className={gameDef?.fullBoard ? 'h-full p-0' : 'p-4 sm:p-6 lg:p-8'}
        >
          {Board && (
            <Board
              state={gameState}
              myId={myId}
              onAction={sendAction}
              isHost={isHost}
              isHandZoomed={isHandZoomed}
              onLeave={handleLeave}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
