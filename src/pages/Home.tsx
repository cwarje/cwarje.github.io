import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import GameCard from '../components/GameCard';
import RoomCodeInput from '../components/RoomCodeInput';
import { useRoomContext } from '../networking/roomStore';
import type { GameType } from '../networking/types';
import { GAME_CATALOG } from '../games/gameCatalog';

export default function Home() {
  const navigate = useNavigate();
  const { createRoom, joinRoom, connecting, error } = useRoomContext();
  const [playerName] = useState(() => {
    return localStorage.getItem('playerName') || `Player${Math.floor(Math.random() * 9999)}`;
  });
  const [nameInput, setNameInput] = useState(playerName);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'create'; gameType: GameType } | { type: 'join'; code: string } | null>(null);
  const [infoGameType, setInfoGameType] = useState<GameType | null>(null);

  const closeInfo = useCallback(() => setInfoGameType(null), []);

  useEffect(() => {
    if (!infoGameType) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInfo();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [infoGameType, closeInfo]);

  const saveName = (name: string) => {
    localStorage.setItem('playerName', name);
    return name;
  };

  const handleSelectGame = (gameType: GameType) => {
    setPendingAction({ type: 'create', gameType });
    setShowNamePrompt(true);
  };

  const handleJoinRoom = (code: string) => {
    setPendingAction({ type: 'join', code });
    setShowNamePrompt(true);
  };

  const handleConfirmName = async () => {
    const name = saveName(nameInput.trim() || playerName);
    setShowNamePrompt(false);

    if (!pendingAction) return;

    try {
      if (pendingAction.type === 'create') {
        const roomCode = await createRoom(pendingAction.gameType, name);
        navigate(`/lobby/${roomCode}`);
      } else {
        await joinRoom(pendingAction.code, name);
        navigate(`/lobby/${pendingAction.code}`);
      }
    } catch {
      // Error is handled by context
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            Pick a Game
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-md mx-auto">
          Play solo against bots or challenge your friends with a room code.
        </p>
      </motion.div>

      {/* Join Room Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row items-center justify-center gap-3"
      >
        <span className="text-sm text-gray-500">Have a room code?</span>
        <RoomCodeInput onJoin={handleJoinRoom} loading={connecting} />
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-md mx-auto"
        >
          {error}
        </motion.div>
      )}

      {/* Game Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {(['yahtzee', 'hearts', 'battleship', 'liars-dice', 'poker'] as GameType[]).map((game, i) => (
          <motion.div
            key={game}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
          >
            <GameCard gameType={game} onSelect={handleSelectGame} onInfo={setInfoGameType} />
          </motion.div>
        ))}
      </motion.div>

      {/* Game Info Modal */}
      <AnimatePresence>
        {infoGameType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeInfo}
            role="dialog"
            aria-modal="true"
            aria-label={`About ${GAME_CATALOG[infoGameType].title}`}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{GAME_CATALOG[infoGameType].title}</h2>
                <button
                  onClick={closeInfo}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Goal */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-primary-400 uppercase tracking-wider">Goal</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{GAME_CATALOG[infoGameType].info.goal}</p>
              </div>

              {/* How to Play */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-primary-400 uppercase tracking-wider">How to Play</h3>
                <ol className="space-y-1.5 list-decimal list-inside">
                  {GAME_CATALOG[infoGameType].info.howToPlay.map((step, i) => (
                    <li key={i} className="text-sm text-gray-300 leading-relaxed">{step}</li>
                  ))}
                </ol>
              </div>

              {/* Rules */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-primary-400 uppercase tracking-wider">Rules</h3>
                <ul className="space-y-1.5 list-disc list-inside">
                  {GAME_CATALOG[infoGameType].info.rules.map((rule, i) => (
                    <li key={i} className="text-sm text-gray-300 leading-relaxed">{rule}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name Prompt Modal */}
      {showNamePrompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowNamePrompt(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white">Enter Your Name</h2>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmName()}
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all"
              placeholder="Your name"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNamePrompt(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmName}
                disabled={connecting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {connecting ? 'Connecting...' : 'Go'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
