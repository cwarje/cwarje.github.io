import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import GameCard from '../components/GameCard';
import RoomCodeInput from '../components/RoomCodeInput';
import { useRoomContext } from '../networking/roomStore';
import type { GameType, HeartsTargetScore, PlayerColor } from '../networking/types';
import { DEFAULT_PLAYER_COLOR, normalizePlayerColor, PLAYER_COLOR_HEX, PLAYER_COLOR_OPTIONS } from '../networking/playerColors';
import { GAME_CATALOG } from '../games/gameCatalog';

export default function Home() {
  const navigate = useNavigate();
  const { room, isHost, createLobby, joinRoom, startGame, connecting, error, clearError } = useRoomContext();
  const [playerName] = useState(() => {
    return localStorage.getItem('playerName') || '';
  });
  const [playerColor] = useState<PlayerColor>(() => normalizePlayerColor(localStorage.getItem('playerColor')));
  const [nameInput, setNameInput] = useState(playerName);
  const [colorInput, setColorInput] = useState<PlayerColor>(playerColor);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [showHeartsTargetPrompt, setShowHeartsTargetPrompt] = useState(false);
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  const [infoGameType, setInfoGameType] = useState<GameType | null>(null);
  const lobbyCreatingRef = useRef(false);

  const closeInfo = useCallback(() => setInfoGameType(null), []);

  useEffect(() => {
    if (!infoGameType) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInfo();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [infoGameType, closeInfo]);

  useEffect(() => {
    if (!showHeartsTargetPrompt) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHeartsTargetPrompt(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showHeartsTargetPrompt]);

  const saveName = (name: string) => {
    localStorage.setItem('playerName', name);
    return name;
  };

  const saveColor = (color: PlayerColor) => {
    localStorage.setItem('playerColor', color);
    return color;
  };

  // Clear errors when room is lost (e.g. host disconnected) — auto-create will handle recovery
  useEffect(() => {
    if (!room && error) {
      clearError();
    }
  }, [room, error, clearError]);

  // Auto-create lobby on mount when no room exists and name is available
  useEffect(() => {
    if (room || connecting || lobbyCreatingRef.current || error) return;
    const storedName = localStorage.getItem('playerName');
    const storedColor = normalizePlayerColor(localStorage.getItem('playerColor'));
    if (storedName) {
      lobbyCreatingRef.current = true;
      createLobby(storedName, storedColor).catch(() => {}).finally(() => {
        lobbyCreatingRef.current = false;
      });
    } else {
      // No stored name — show prompt
      setShowNamePrompt(true);
    }
  }, [room, connecting, error, createLobby]);

  // Navigate to game when it starts
  useEffect(() => {
    if (room?.phase === 'playing' || room?.phase === 'finished') {
      navigate(`/game/${room.roomCode}`);
    }
  }, [room?.phase, room?.roomCode, navigate]);

  const handleConfirmName = async () => {
    const name = saveName(nameInput.trim() || `Player${Math.floor(Math.random() * 9999)}`);
    const color = saveColor(colorInput || DEFAULT_PLAYER_COLOR);
    setShowNamePrompt(false);

    if (pendingJoinCode) {
      // Joining another lobby
      const code = pendingJoinCode;
      setPendingJoinCode(null);
      try {
        await joinRoom(code, name, color);
      } catch {
        // Error is handled by context
      }
    } else if (!room) {
      // Creating own lobby
      try {
        await createLobby(name, color);
      } catch {
        // Error is handled by context
      }
    }
  };

  const handleJoinRoom = (code: string) => {
    const storedName = localStorage.getItem('playerName');
    const storedColor = normalizePlayerColor(localStorage.getItem('playerColor'));
    if (!storedName) {
      setPendingJoinCode(code);
      setShowNamePrompt(true);
      return;
    }
    // Silently close own lobby and join other (joinRoomInternal handles cleanup)
    joinRoom(code, storedName, storedColor).catch(() => {});
  };

  const handleSelectGame = (gameType: GameType) => {
    if (!isHost || !room) return;
    const count = room.players.length;
    const catalog = GAME_CATALOG[gameType];
    if (count < catalog.minPlayers || count > catalog.maxPlayers) return;
    if (gameType === 'hearts') {
      setShowHeartsTargetPrompt(true);
      return;
    }
    startGame(gameType);
  };

  const handleStartHeartsWithTarget = (targetScore: HeartsTargetScore) => {
    if (!isHost || !room) return;
    const catalog = GAME_CATALOG.hearts;
    const count = room.players.length;
    if (count < catalog.minPlayers || count > catalog.maxPlayers) return;
    startGame('hearts', { targetScore });
    setShowHeartsTargetPrompt(false);
  };

  const playerCount = room?.players.length ?? 0;

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            {isHost ? 'Pick a Game' : room ? 'Waiting for Host' : 'Pick a Game'}
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-md mx-auto">
          {isHost || !room
            ? 'Use the Lobby menu to invite friends or add bots, then pick a game.'
            : 'The host will pick a game to start.'}
        </p>
      </motion.div>

      {/* Join Room Bar — hidden when player has joined someone else's lobby */}
      {(!room || isHost) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <span className="text-sm text-gray-500">Have a lobby code?</span>
          <RoomCodeInput onJoin={handleJoinRoom} loading={connecting} />
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-md mx-auto cursor-pointer"
          onClick={clearError}
        >
          {error}
        </motion.div>
      )}

      {/* Game Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(['yahtzee', 'hearts', 'battleship', 'liars-dice', 'poker'] as GameType[]).map((game, i) => {
            const catalog = GAME_CATALOG[game];
            const canPlay = room ? playerCount >= catalog.minPlayers && playerCount <= catalog.maxPlayers : true;
            const isDisabled = room ? (!isHost || !canPlay) : false;

            return (
              <motion.div
                key={game}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
              >
                <GameCard
                  gameType={game}
                  onSelect={handleSelectGame}
                  onInfo={setInfoGameType}
                  disabled={isDisabled}
                  actionLabel="Start"
                />
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Non-host notice */}
      {room && !isHost && room.phase === 'lobby' && (
        <div className="text-center py-2">
          <p className="text-gray-500 text-sm">Waiting for the host to pick a game...</p>
        </div>
      )}

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
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pick your colour</p>
              <div className="grid grid-cols-8 gap-1.5">
                {PLAYER_COLOR_OPTIONS.map((option) => {
                  const isSelected = colorInput === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setColorInput(option.value)}
                      className={`w-full aspect-square p-0 rounded-full border-2 transition-all cursor-pointer ${isSelected ? 'border-white ring-2 ring-white/40' : 'border-white/25 hover:border-white/60'}`}
                      style={{ backgroundColor: PLAYER_COLOR_HEX[option.value] }}
                      aria-pressed={isSelected}
                      aria-label={option.label}
                    >
                      <span className="sr-only">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={handleConfirmName}
              disabled={connecting}
              className="w-full px-4 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {connecting ? 'Connecting...' : 'Go'}
            </button>
          </motion.div>
        </motion.div>
      )}

      {showHeartsTargetPrompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowHeartsTargetPrompt(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose Hearts target score"
          >
            <h2 className="text-lg font-bold text-white">Start Hearts</h2>
            <p className="text-sm text-gray-400">Choose the game length:</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => handleStartHeartsWithTarget(50)}
                className="w-full px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-500 transition-colors cursor-pointer"
              >
                Game to 50
              </button>
              <button
                type="button"
                onClick={() => handleStartHeartsWithTarget(100)}
                className="w-full px-4 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors cursor-pointer"
              >
                Game to 100
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
