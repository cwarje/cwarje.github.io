import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Copy, X, LogOut, Loader2, Settings, StopCircle, RotateCcw, Pencil, Trash2, Check, Plus } from 'lucide-react';
import PlayerList from './PlayerList';
import ColorSwatchGrid from './ColorSwatchGrid';
import ColoredBotIcon from './ColoredBotIcon';
import { useRoomContext } from '../networking/roomStore';
import { useToast } from './Toast';
import { useNavigate } from 'react-router-dom';
import type { PlayerColor } from '../networking/types';
import { DEFAULT_PLAYER_COLOR, normalizePlayerColor, PLAYER_COLOR_HEX } from '../networking/playerColors';
import {
  addFavoriteBot,
  MAX_FAVORITE_BOT_NAME_LENGTH,
  readCustomBots,
  removeFavoriteBot,
  updateFavoriteBot,
  type FavoriteBot,
} from '../networking/favoriteBots';
import { DEALER_SPEED_OPTIONS } from '../networking/dealerSpeed';
import { gameHasCardDealing } from '../games/registry';

type LobbyMenuProps = { variant?: 'default' | 'icon' };

const botRowClass = 'rounded-md border border-surface-200 bg-surface-50 px-2 py-1 min-h-[40px]';
const botActionClass =
  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer touch-manipulation';
const botInputClass =
  'min-w-0 flex-1 rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 placeholder-surface-400 focus:border-primary-500 focus:outline-none';

export default function LobbyMenu({ variant = 'default' }: LobbyMenuProps) {
  const { room, myId, myPlayer, isHost, removeBot, removePlayer, leaveRoom, endGame, updateProfile, setDealerSpeed, connecting } = useRoomContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [nameInput, setNameInput] = useState(() => localStorage.getItem('playerName') || '');
  const [colorInput, setColorInput] = useState<PlayerColor>(() => normalizePlayerColor(localStorage.getItem('playerColor')));
  const [favoriteBots, setFavoriteBots] = useState<FavoriteBot[]>(() => readCustomBots());
  const [newBotName, setNewBotName] = useState('');
  const [newBotColor, setNewBotColor] = useState<PlayerColor>(DEFAULT_PLAYER_COLOR);
  const [addingBot, setAddingBot] = useState(false);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [editBotName, setEditBotName] = useState('');
  const [editBotColor, setEditBotColor] = useState<PlayerColor>(DEFAULT_PLAYER_COLOR);
  const panelRef = useRef<HTMLDivElement>(null);

  const playerCount = room?.players.length ?? 0;
  const hasRoom = !!room;
  const isOnlyHumanInLobby = hasRoom && room.players.filter((p) => !p.isBot).length === 1;
  const isLobbyPhase = room?.phase === 'lobby';
  const gameInProgress = room?.phase === 'playing' || room?.phase === 'finished';
  const canManagePlayers = isHost && isLobbyPhase;

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
    const profileName = myPlayer?.name ?? localStorage.getItem('playerName') ?? '';
    const profileColor = myPlayer?.color ?? normalizePlayerColor(localStorage.getItem('playerColor'));
    setNameInput(profileName);
    setColorInput(profileColor);
    setFavoriteBots(readCustomBots());
    setEditingBotId(null);
    setAddingBot(false);
    setNewBotName('');
    setNewBotColor(DEFAULT_PLAYER_COLOR);
  }, [open, myPlayer?.name, myPlayer?.color]);

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
    const leaveMessage = !isHost
      ? 'Left lobby.'
      : isOnlyHumanInLobby
        ? 'Lobby reset.'
        : 'Lobby closed.';
    toast(leaveMessage, 'info');
    navigate('/');
  };

  const handleEndGame = () => {
    setOpen(false);
    endGame();
  };

  const handleSaveProfile = () => {
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      toast('Please enter a name.', 'error');
      return;
    }
    updateProfile(trimmedName, colorInput);
    toast('Profile updated.', 'success');
  };

  const handleSelectColor = (nextColor: PlayerColor) => {
    setColorInput(nextColor);
    const fallbackName = myPlayer?.name ?? localStorage.getItem('playerName') ?? '';
    const nameToSave = nameInput.trim() || fallbackName.trim();
    if (!nameToSave) {
      toast('Please enter a name before changing color.', 'error');
      return;
    }
    updateProfile(nameToSave, nextColor);
  };

  const handleAddBot = () => {
    const trimmed = newBotName.trim();
    if (!trimmed) {
      toast('Please enter a bot name.', 'error');
      return;
    }
    const bot = addFavoriteBot(trimmed, newBotColor);
    if (!bot) {
      toast(`Bot name must be 1–${MAX_FAVORITE_BOT_NAME_LENGTH} characters.`, 'error');
      return;
    }
    setFavoriteBots(readCustomBots());
    setNewBotName('');
    setAddingBot(false);
    toast('Bot added.', 'success');
  };

  const cancelAddBot = () => {
    setAddingBot(false);
    setNewBotName('');
    setNewBotColor(DEFAULT_PLAYER_COLOR);
  };

  const startEditBot = (bot: FavoriteBot) => {
    setEditingBotId(bot.id);
    setEditBotName(bot.name);
    setEditBotColor(bot.color);
  };

  const cancelEditBot = () => {
    setEditingBotId(null);
  };

  const handleSaveEditBot = () => {
    if (!editingBotId) return;
    const trimmed = editBotName.trim();
    if (!trimmed) {
      toast('Please enter a bot name.', 'error');
      return;
    }
    const updated = updateFavoriteBot(editingBotId, trimmed, editBotColor);
    if (!updated) {
      toast(`Bot name must be 1–${MAX_FAVORITE_BOT_NAME_LENGTH} characters.`, 'error');
      return;
    }
    setFavoriteBots(readCustomBots());
    setEditingBotId(null);
    toast('Bot updated.', 'success');
  };

  const handleRemoveBot = (id: string) => {
    removeFavoriteBot(id);
    setFavoriteBots(readCustomBots());
    if (editingBotId === id) setEditingBotId(null);
    toast('Bot removed.', 'info');
  };

  const isIconVariant = variant === 'icon';
  const otherPlayers = hasRoom ? room.players.filter((p) => p.id !== myId) : [];
  const triggerClassName = isIconVariant
    ? `flex items-center justify-center w-9 h-9 text-white hover:text-white/80 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer group active:scale-90 ${open ? 'scale-90' : ''}`
    : 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-medium text-gray-300 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={connecting && !room}
        className={triggerClassName}
        title={isIconVariant ? 'Lobby' : 'Open lobby'}
        aria-label={isIconVariant ? 'Lobby' : 'Open lobby'}
      >
        {connecting && !room ? (
          <Loader2 className={`w-4 h-4 animate-spin ${isIconVariant ? 'text-white/70' : 'text-gray-400'}`} />
        ) : isIconVariant ? (
          <Settings className="w-6 h-6 stroke-white fill-transparent group-hover:fill-white/50 transition-colors duration-150" />
        ) : (
          <>
            {otherPlayers.map((p) => {
              const letter = (p.name && p.name[0]) ? p.name[0].toUpperCase() : '?';
              const color = PLAYER_COLOR_HEX[p.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
              return (
                <span key={p.id} className="flex-shrink-0 text-sm font-semibold leading-none" style={{ color }}>
                  {letter}
                </span>
              );
            })}
            <Users className="w-4 h-4 flex-shrink-0" />
          </>
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
            className="absolute right-0 top-full mt-2 w-80 bg-white border border-surface-200 rounded-2xl shadow-2xl shadow-black/15 z-50 overflow-hidden"
          >
            <div className="divide-y divide-surface-200">
              {/* Profile section */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Profile</p>
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={24}
                    className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:border-primary-500"
                    placeholder="Your name"
                  />
                  <button
                    onClick={handleSaveProfile}
                    className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Save
                  </button>
                </div>
                <ColorSwatchGrid value={colorInput} onChange={handleSelectColor} />
              </div>

              {/* My Bots section */}
              <div className="px-5 py-3 space-y-2">
                <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">My Bots</p>
                <ul className="max-h-52 space-y-1 overflow-y-auto -mx-1 px-1">
                  {addingBot ? (
                    <li className={`${botRowClass} space-y-1.5 py-1.5`}>
                      <div className="flex min-h-[40px] items-center gap-1.5 min-w-0">
                        <ColoredBotIcon color={newBotColor} />
                        <input
                          type="text"
                          value={newBotName}
                          onChange={(e) => setNewBotName(e.target.value)}
                          maxLength={MAX_FAVORITE_BOT_NAME_LENGTH}
                          className={botInputClass}
                          placeholder="New bot name"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddBot()}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleAddBot}
                          className="rounded-md bg-primary-600 px-2.5 py-1.5 text-sm font-medium text-white transition-colors cursor-pointer whitespace-nowrap touch-manipulation"
                        >
                          Add
                        </button>
                      </div>
                      <ColorSwatchGrid compact value={newBotColor} onChange={setNewBotColor} />
                      <button
                        type="button"
                        onClick={cancelAddBot}
                        className="w-full rounded-md bg-surface-200 py-1.5 text-xs font-medium text-surface-700 transition-colors cursor-pointer touch-manipulation hover:bg-surface-300"
                      >
                        Cancel
                      </button>
                    </li>
                  ) : (
                    <li className={botRowClass}>
                      <button
                        type="button"
                        onClick={() => setAddingBot(true)}
                        className="flex min-h-[40px] w-full items-center gap-1.5 min-w-0 cursor-pointer touch-manipulation"
                        aria-label="Add bot"
                      >
                        <ColoredBotIcon muted />
                        <span className="flex-1 min-w-0 text-left text-sm text-surface-500">Add bot</span>
                        <span className={`${botActionClass} text-surface-600`}>
                          <Plus className="h-4 w-4" />
                        </span>
                      </button>
                    </li>
                  )}
                  {favoriteBots.map((bot) => (
                    <li key={bot.id} className={botRowClass}>
                      {editingBotId === bot.id ? (
                        <div className="space-y-1.5 py-0.5">
                          <input
                            type="text"
                            value={editBotName}
                            onChange={(e) => setEditBotName(e.target.value)}
                            maxLength={MAX_FAVORITE_BOT_NAME_LENGTH}
                            className={`${botInputClass} w-full`}
                          />
                          <ColorSwatchGrid compact value={editBotColor} onChange={setEditBotColor} />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={handleSaveEditBot}
                              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary-600 py-1.5 text-sm font-medium text-white cursor-pointer touch-manipulation hover:bg-primary-500"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditBot}
                              className="flex-1 rounded-md bg-surface-200 py-1.5 text-sm font-medium text-surface-700 cursor-pointer touch-manipulation hover:bg-surface-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-[40px] items-center gap-1.5 min-w-0">
                          <ColoredBotIcon color={bot.color} />
                          <span className="flex-1 min-w-0 truncate text-sm leading-tight text-surface-900">{bot.name}</span>
                          <button
                            type="button"
                            onClick={() => startEditBot(bot)}
                            className={`${botActionClass} text-surface-600 hover:bg-surface-200`}
                            aria-label={`Edit ${bot.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveBot(bot.id)}
                            className={`${botActionClass} text-red-600 hover:bg-red-100`}
                            aria-label={`Remove ${bot.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {!hasRoom ? (
                <div className="px-5 py-8 text-center space-y-2">
                  {connecting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-surface-400 mx-auto" />
                      <p className="text-sm text-surface-600">Creating lobby...</p>
                    </>
                  ) : (
                    <p className="text-sm text-surface-600">No active lobby</p>
                  )}
                </div>
              ) : (
                <>
                  {/* Lobby code section */}
                  <div className="px-5 py-4 space-y-2">
                    <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Lobby Code</p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold tracking-[0.3em] text-surface-900 font-mono">
                        {room.roomCode}
                      </span>
                      <button
                        onClick={copyCode}
                        className="w-8 h-8 rounded-lg bg-surface-100 border border-surface-200 hover:bg-surface-200 flex items-center justify-center transition-colors cursor-pointer"
                        title="Copy lobby code"
                      >
                        <Copy className="w-4 h-4 text-surface-600" />
                      </button>
                    </div>
                    <p className="text-[11px] text-surface-500">Share this code with friends to invite them</p>
                  </div>

                  {isHost && gameHasCardDealing(room.gameType) && (
                    <div className="px-5 py-4 space-y-2">
                      <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Dealer speed</p>
                      <div className="flex gap-2">
                        {DEALER_SPEED_OPTIONS.map(({ value, label }) => {
                          const currentSpeed = room.dealerSpeed ?? 'medium';
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setDealerSpeed(value)}
                              className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                currentSpeed === value
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-surface-100 text-surface-700 hover:bg-surface-200 border border-surface-200'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Players section */}
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-medium text-surface-600">
                        Players ({playerCount})
                      </h3>
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

                  {/* Leave button(s) */}
                  <div className="px-5 py-3">
                    {isHost && gameInProgress ? (
                      <button
                        onClick={handleEndGame}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer bg-red-500 border border-red-500 text-white hover:bg-red-400 hover:border-red-400"
                      >
                        <StopCircle className="w-4 h-4" />
                        <span className="font-medium">End Game</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleLeave}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer bg-red-500 border border-red-500 text-white hover:bg-red-400 hover:border-red-400"
                      >
                        {isHost ? (
                          isOnlyHumanInLobby ? <RotateCcw className="w-4 h-4" /> : <X className="w-4 h-4" />
                        ) : (
                          <LogOut className="w-4 h-4" />
                        )}
                        <span className="font-medium">
                          {isHost ? (isOnlyHumanInLobby ? 'Reset Lobby' : 'Close Lobby') : 'Leave Lobby'}
                        </span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
