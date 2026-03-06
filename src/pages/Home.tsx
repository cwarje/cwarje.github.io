import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy } from 'lucide-react';
import GameCard from '../components/GameCard';
import RoomCodeInput from '../components/RoomCodeInput';
import PlayerList from '../components/PlayerList';
import { useToast } from '../components/Toast';
import { useRoomContext } from '../networking/roomStore';
import type { GameStartOptions, GameType, HeartsTargetScore, PlayerColor, UpRiverStartMode } from '../networking/types';
import { DEFAULT_PLAYER_COLOR, normalizePlayerColor, PLAYER_COLOR_HEX, PLAYER_COLOR_OPTIONS } from '../networking/playerColors';
import { GAME_CATALOG } from '../games/gameCatalog';

const GAMES_HIDDEN_IN_DEV: GameType[] = ['battleship', 'liars-dice', 'poker'];
const allGameTypes: GameType[] = ['yahtzee', 'hearts', 'up-and-down-the-river', 'battleship', 'liars-dice', 'poker'];
const gameTypesToShow = import.meta.env.DEV ? allGameTypes.filter(g => !GAMES_HIDDEN_IN_DEV.includes(g)) : allGameTypes;

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { room, isHost, createLobby, joinRoom, startGame, removeBot, removePlayer, connecting, error, clearError } = useRoomContext();
  const [playerName] = useState(() => {
    return localStorage.getItem('playerName') || '';
  });
  const [playerColor] = useState<PlayerColor>(() => normalizePlayerColor(localStorage.getItem('playerColor')));
  const [nameInput, setNameInput] = useState(playerName);
  const [colorInput, setColorInput] = useState<PlayerColor>(playerColor);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [showHeartsTargetPrompt, setShowHeartsTargetPrompt] = useState(false);
  const [showUpRiverStartPrompt, setShowUpRiverStartPrompt] = useState(false);
  const [pendingBotGame, setPendingBotGame] = useState<GameType | null>(null);
  const [pendingUpRiverStartMode, setPendingUpRiverStartMode] = useState<UpRiverStartMode | null>(null);
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

  useEffect(() => {
    if (!showUpRiverStartPrompt) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowUpRiverStartPrompt(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showUpRiverStartPrompt]);

  useEffect(() => {
    if (!pendingBotGame) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingBotGame(null);
        setPendingUpRiverStartMode(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pendingBotGame]);

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
    if (count > catalog.maxPlayers) return;

    if (gameType === 'hearts') {
      setShowHeartsTargetPrompt(true);
      return;
    }

    if (gameType === 'up-and-down-the-river') {
      setShowUpRiverStartPrompt(true);
      return;
    }

    // Variable-count game with room for bots — show bot selection modal
    if (catalog.minPlayers !== catalog.maxPlayers && count < catalog.maxPlayers) {
      setPendingUpRiverStartMode(null);
      setPendingBotGame(gameType);
      return;
    }

    startGame(gameType);
  };

  const handleStartHeartsWithTarget = (targetScore: HeartsTargetScore) => {
    if (!isHost || !room) return;
    const count = room.players.length;
    if (count > GAME_CATALOG.hearts.maxPlayers) return;
    startGame('hearts', { targetScore });
    setShowHeartsTargetPrompt(false);
  };

  const handleStartUpRiverWithMode = (upRiverStartMode: UpRiverStartMode) => {
    if (!isHost || !room) return;
    const count = room.players.length;
    const catalog = GAME_CATALOG['up-and-down-the-river'];
    if (count > catalog.maxPlayers) return;

    if (count < catalog.maxPlayers) {
      setPendingUpRiverStartMode(upRiverStartMode);
      setPendingBotGame('up-and-down-the-river');
      setShowUpRiverStartPrompt(false);
      return;
    }

    startGame('up-and-down-the-river', { upRiverStartMode });
    setShowUpRiverStartPrompt(false);
  };

  const handleStartWithBots = (botCount: number) => {
    if (!isHost || !room || !pendingBotGame) return;
    const options: GameStartOptions = { botCount };
    if (pendingBotGame === 'up-and-down-the-river' && pendingUpRiverStartMode) {
      options.upRiverStartMode = pendingUpRiverStartMode;
    }
    startGame(pendingBotGame, options);
    setPendingBotGame(null);
    setPendingUpRiverStartMode(null);
  };

  const playerCount = room?.players.length ?? 0;
  const isLobbyPhase = room?.phase === 'lobby';
  const canManagePlayers = isHost && isLobbyPhase;

  const copyLobbyCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.roomCode);
      toast('Lobby code copied!', 'info');
    }
  };

  return (
    <div className="space-y-10">
      {/* Two-card lobby section: join (left/top) + share code (right/bottom) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Card 1: Enter friend's code + player list (first on mobile, left on desktop) */}
        <div className="rounded-2xl glass border border-white/10 p-6 sm:p-7 flex flex-col min-h-[240px] order-1 lg:order-1">
          {(!room || isHost) && (
            <div className="mb-5 w-full">
              <RoomCodeInput onJoin={handleJoinRoom} loading={connecting} variant="large" />
            </div>
          )}
          {room ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="mb-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Players in lobby ({playerCount})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
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
          ) : (
            <p className="mt-1 text-sm text-gray-500">Join a lobby above or create one to see players here.</p>
          )}
        </div>

        {/* Card 2: Host + share code (second on mobile, right on desktop) */}
        <div className="rounded-2xl glass border border-white/10 p-6 sm:p-7 flex min-h-[240px] flex-col items-center justify-center text-center order-2 lg:order-2">
          {room ? (
            <div className="flex flex-col items-center gap-3">
              <h2 className="text-2xl font-semibold text-white">Host</h2>
              <p className="max-w-xs text-sm text-gray-400">Share this code with friends to invite them</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-extrabold tracking-[0.3em] text-white font-mono sm:text-5xl">
                  {room.roomCode}
                </span>
                <button
                  type="button"
                  onClick={copyLobbyCode}
                  className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors cursor-pointer hover:bg-white/10"
                  title="Copy lobby code"
                >
                  <Copy className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <h2 className="text-2xl font-semibold text-white">Host</h2>
              {connecting ? (
                <p className="text-sm text-gray-400">Creating your lobby...</p>
              ) : (
                <p className="max-w-xs text-sm text-gray-500">Your lobby code will appear here once a lobby is created.</p>
              )}
            </div>
          )}
        </div>
      </motion.div>

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

      {/* Games section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-6"
      >
        <div className="text-center sm:text-left">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isHost ? 'Pick a game' : room ? 'Waiting for host' : 'Pick a game'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {isHost || !room
              ? 'Choose a game below. Add bots from the lobby card if needed.'
              : 'The host will start a game when ready.'}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {gameTypesToShow.map((game, i) => {
            const catalog = GAME_CATALOG[game];
            const tooManyPlayers = room ? playerCount > catalog.maxPlayers : false;
            const isDisabled = room ? (!isHost || tooManyPlayers) : false;

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

      {showUpRiverStartPrompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowUpRiverStartPrompt(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose Up and Down the River start mode"
          >
            <h2 className="text-lg font-bold text-white">Start Up and Down the River</h2>
            <p className="text-sm text-gray-400">Choose how round sizes progress:</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => handleStartUpRiverWithMode('up-down')}
                className="w-full px-4 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors cursor-pointer"
              >
                Up and Down the River (1-7-1)
              </button>
              <button
                type="button"
                onClick={() => handleStartUpRiverWithMode('down-up')}
                className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                Down and Up the River (7-1-7)
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {pendingBotGame && (() => {
        const catalog = GAME_CATALOG[pendingBotGame];
        const minBots = Math.max(0, catalog.minPlayers - playerCount);
        const maxBots = catalog.maxPlayers - playerCount;
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setPendingBotGame(null);
              setPendingUpRiverStartMode(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Start ${catalog.title}`}
            >
              <h2 className="text-lg font-bold text-white">Start {catalog.title}</h2>
              <p className="text-sm text-gray-400">
                {playerCount} {playerCount === 1 ? 'player' : 'players'} in lobby.
                {maxBots > 0 ? ' Add bots to fill seats?' : ''}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {Array.from({ length: maxBots - minBots + 1 }, (_, i) => {
                  const botCount = minBots + i;
                  const totalPlayers = playerCount + botCount;
                  return (
                    <button
                      key={botCount}
                      type="button"
                      onClick={() => handleStartWithBots(botCount)}
                      className="w-full px-4 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors cursor-pointer"
                    >
                      {botCount === 0
                        ? `Start with ${totalPlayers} ${totalPlayers === 1 ? 'player' : 'players'} (no bots)`
                        : `Start with ${botCount} ${botCount === 1 ? 'bot' : 'bots'} (${totalPlayers} players total)`}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        );
      })()}
    </div>
  );
}
