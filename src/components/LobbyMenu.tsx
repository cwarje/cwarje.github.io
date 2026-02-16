import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Copy, Plus, X, LogOut, Loader2 } from 'lucide-react';
import PlayerList from './PlayerList';
import { useRoomContext } from '../networking/roomStore';
import { useToast } from './Toast';
import { useNavigate } from 'react-router-dom';
import { GAME_CATALOG } from '../games/gameCatalog';

export default function LobbyMenu() {
  const { room, isHost, addBot, removeBot, removePlayer, leaveRoom, connecting } = useRoomContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const playerCount = room?.players.length ?? 0;
  const hasRoom = !!room;
  const isLobbyPhase = room?.phase === 'lobby';
  const maxPlayersAcrossGames = Math.max(...Object.values(GAME_CATALOG).map(g => g.maxPlayers));
  const canManagePlayers = isHost && isLobbyPhase;
  const canAddBot = canManagePlayers && playerCount < maxPlayersAcrossGames;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const copyCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.roomCode);
      toast('Lobby code copied!', 'info');
    }
  };

  const handleLeave = () => {
    setOpen(false);
    leaveRoom();
    toast(isHost ? 'Lobby closed.' : 'Left lobby.', 'info');
    navigate('/');
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={connecting && !room}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-medium text-gray-300 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {connecting && !room ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : (
          <Users className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Lobby</span>
        {hasRoom && (
          <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary-600 text-[11px] font-bold text-white leading-none">
            {playerCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden"
          >
            {!hasRoom ? (
              <div className="px-5 py-8 text-center space-y-2">
                {connecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                    <p className="text-sm text-gray-400">Creating lobby...</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No active lobby</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {/* Lobby code section */}
                <div className="px-5 py-4 space-y-2">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Lobby Code</p>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-extrabold tracking-[0.3em] text-white font-mono">
                      {room.roomCode}
                    </span>
                    <button
                      onClick={copyCode}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                      title="Copy lobby code"
                    >
                      <Copy className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">Share this code with friends to invite them</p>
                </div>

                {/* Players section */}
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium text-gray-400">
                      Players ({playerCount})
                    </h3>
                    {canAddBot && (
                      <button
                        onClick={addBot}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-medium text-gray-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add Bot
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto -mx-1 px-1">
                    <PlayerList
                      players={room.players}
                      hostId={room.hostId}
                      isHost={isHost}
                      onRemoveBot={canManagePlayers ? removeBot : undefined}
                      onRemovePlayer={canManagePlayers ? removePlayer : undefined}
                      wins={room.wins}
                    />
                  </div>
                </div>

                {/* Leave button */}
                <div className="px-5 py-3">
                  <button
                    onClick={handleLeave}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all duration-200 cursor-pointer"
                  >
                    {isHost ? <X className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                    <span className="text-sm font-medium">{isHost ? 'Close Lobby' : 'Leave Lobby'}</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
