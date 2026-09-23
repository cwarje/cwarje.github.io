import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Copy, X, LogOut, Loader2, Settings, StopCircle, RotateCcw, Pencil, Trash2, Check, Plus, User } from 'lucide-react';
import PlayerList from './PlayerList';
import ColorSwatchGrid from './ColorSwatchGrid';
import ColoredBotIcon from './ColoredBotIcon';
import { useRoomContext } from '../networking/roomStore';
import { useToast } from './Toast';
import { useLocation, useNavigate } from 'react-router-dom';
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
import HatShopModal from './HatShopModal';
import {
  HAT_CATALOG,
  getPlayerLevelForPlayer,
  readSelectedHat,
  sanitizeSelectedHat,
} from '../hats/hats';
import { readPlayerXp } from '../xp/progress';
import HeaderLevelProgress from './HeaderLevelProgress';

type LobbyMenuProps = { variant?: 'default' | 'icon' };
type MenuPanel = 'profile' | 'level' | 'lobby';

const botRowClass = 'rounded-md border border-surface-200 bg-surface-50 px-2 py-1 min-h-[40px]';
const botActionClass =
  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer touch-manipulation';
const botInputClass =
  'min-w-0 flex-1 rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 placeholder-surface-400 focus:border-primary-500 focus:outline-none';

const dropdownPanelClassName =
  'absolute right-0 top-full mt-2 w-80 bg-white border border-surface-200 rounded-2xl shadow-2xl shadow-black/15 z-50 overflow-hidden';

export default function LobbyMenu({ variant = 'default' }: LobbyMenuProps) {
  const { room, myId, myPlayer, isHost, removeBot, removePlayer, leaveRoom, endGame, updateProfile, setDealerSpeed, connecting } = useRoomContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isHomePage = useLocation().pathname === '/';
  const [activePanel, setActivePanel] = useState<MenuPanel | null>(null);
  const [hatShopOpen, setHatShopOpen] = useState(false);
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
  const isIconVariant = variant === 'icon';
  const useSplitHomeMenus = isHomePage && !isIconVariant;
  const isMenuOpen = activePanel !== null;

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePanel(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const profileName = myPlayer?.name ?? localStorage.getItem('playerName') ?? '';
    const profileColor = myPlayer?.color ?? normalizePlayerColor(localStorage.getItem('playerColor'));
    setNameInput(profileName);
    setColorInput(profileColor);
    setFavoriteBots(readCustomBots());
    setEditingBotId(null);
    setAddingBot(false);
    setNewBotName('');
    setNewBotColor(DEFAULT_PLAYER_COLOR);
  }, [isMenuOpen, myPlayer?.name, myPlayer?.color]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setActivePanel(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isMenuOpen]);

  const closePanel = () => setActivePanel(null);

  const togglePanel = (panel: MenuPanel) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const copyCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.roomCode);
      toast('Lobby code copied!', 'info');
    }
  };

  const handleLeave = () => {
    closePanel();
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
    closePanel();
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

  const otherPlayers = hasRoom ? room.players.filter((p) => p.id !== myId) : [];
  const playerXp = myPlayer?.xp ?? readPlayerXp();
  const playerLevel = getPlayerLevelForPlayer({ xp: playerXp });
  const equippedHatId = sanitizeSelectedHat(myPlayer?.selectedHat ?? readSelectedHat(), playerLevel);
  const equippedHat = HAT_CATALOG.find((h) => h.id === equippedHatId) ?? HAT_CATALOG[0];
  const profileDisplayName = myPlayer?.name ?? localStorage.getItem('playerName') ?? '';
  const profileDisplayColor = myPlayer?.color ?? normalizePlayerColor(localStorage.getItem('playerColor'));
  const profileTriggerName = profileDisplayName.trim() || 'Player';
  const myInitial = profileTriggerName[0].toUpperCase();
  const myColorHex = PLAYER_COLOR_HEX[profileDisplayColor] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];

  const pillTriggerClassName =
    'flex h-9 items-center gap-1.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-medium leading-none text-gray-300 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  const iconTriggerClassName = `flex items-center justify-center w-9 h-9 text-white hover:text-white/80 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer group active:scale-90 ${isMenuOpen ? 'scale-90' : ''}`;

  const renderDropdownShell = (panelKey: MenuPanel, children: ReactNode) => (
    <motion.div
      key={panelKey}
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={dropdownPanelClassName}
    >
      {children}
    </motion.div>
  );

  const renderProfileSection = (showChangeHat: boolean) => (
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
      {showChangeHat && (
        <button
          type="button"
          onClick={() => {
            closePanel();
            setHatShopOpen(true);
          }}
          aria-label={`Change Hat, currently ${equippedHat.label}`}
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-surface-200 bg-surface-100 px-3 py-2 text-sm font-medium text-surface-800 transition-colors hover:bg-surface-200"
        >
          <span className="min-w-0 text-left">Change Hat</span>
          <div
            className={`flex h-9 w-9 shrink-0 justify-center rounded-md border border-surface-200/80 bg-white ${equippedHat.imageUrl ? 'items-end' : 'items-center'}`}
            aria-hidden
          >
            {equippedHat.imageUrl ? (
              <img
                src={equippedHat.imageUrl}
                alt=""
                className="max-h-8 max-w-8 object-contain"
              />
            ) : (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-surface-400">
                None
              </span>
            )}
          </div>
        </button>
      )}
    </div>
  );

  const renderLevelSection = () => (
    <div className="px-5 py-4 space-y-2">
      <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Level</p>
      <HeaderLevelProgress variant="menu" />
    </div>
  );

  const renderBotsSection = () => (
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
  );

  const renderNoRoomSection = () => (
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
  );

  const renderLobbyRoomSections = (includeBotsAfterPlayers: boolean) => {
    if (!hasRoom || !room) {
      return renderNoRoomSection();
    }

    return (
      <>
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

        <div className="px-5 py-3 space-y-1.5">
          <h3 className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">
            Players ({playerCount})
          </h3>
          <div className="max-h-40 overflow-y-auto -mx-1 px-1">
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

        {includeBotsAfterPlayers && renderBotsSection()}

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
    );
  };

  const otherPlayerNames = otherPlayers.map((p) => p.name.trim() || 'Player');

  const renderLobbyTriggerContent = () => {
    if (connecting && !room) {
      return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
    }
    return (
      <>
        {otherPlayers.map((p, index) => {
          const displayName = p.name.trim() || 'Player';
          const letter = displayName[0].toUpperCase();
          const color = PLAYER_COLOR_HEX[p.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
          return (
            <span key={p.id} className="inline-flex min-w-0 flex-shrink-0 items-center">
              {index > 0 && (
                <span className="hidden flex-shrink-0 text-sm leading-none text-gray-500 sm:inline">, </span>
              )}
              <span
                className="flex-shrink-0 text-sm font-semibold leading-none sm:hidden"
                style={{ color }}
              >
                {letter}
              </span>
              <span
                className="hidden max-w-[5rem] truncate text-sm font-semibold leading-none sm:inline"
                style={{ color }}
              >
                {displayName}
              </span>
            </span>
          );
        })}
        <Users className="w-4 h-4 flex-shrink-0" />
      </>
    );
  };

  return (
    <div className={useSplitHomeMenus ? 'relative flex items-center gap-2' : 'relative'} ref={panelRef}>
      {useSplitHomeMenus ? (
        <>
          <button
            type="button"
            onClick={() => togglePanel('profile')}
            disabled={connecting && !room}
            className={pillTriggerClassName}
            title={profileTriggerName}
            aria-label="Profile"
            aria-expanded={activePanel === 'profile'}
          >
            <span
              className="flex-shrink-0 text-sm font-semibold leading-none sm:hidden"
              style={{ color: myColorHex }}
            >
              {myInitial}
            </span>
            <span
              className="hidden max-w-[9rem] truncate text-sm font-semibold leading-none sm:inline"
              style={{ color: myColorHex }}
            >
              {profileTriggerName}
            </span>
            <User className="w-4 h-4 flex-shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => togglePanel('level')}
            disabled={connecting && !room}
            className={pillTriggerClassName}
            title="Level progress"
            aria-label="Level progress"
            aria-expanded={activePanel === 'level'}
          >
            <span className="font-semibold tabular-nums">Lv {playerLevel}</span>
          </button>
          <button
            type="button"
            onClick={() => togglePanel('lobby')}
            disabled={connecting && !room}
            className={pillTriggerClassName}
            title={otherPlayerNames.length > 0 ? otherPlayerNames.join(', ') : 'Open lobby'}
            aria-label="Open lobby"
            aria-expanded={activePanel === 'lobby'}
          >
            {renderLobbyTriggerContent()}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => togglePanel('lobby')}
          disabled={connecting && !room}
          className={isIconVariant ? iconTriggerClassName : pillTriggerClassName}
          title={
            isIconVariant
              ? 'Lobby'
              : otherPlayerNames.length > 0
                ? otherPlayerNames.join(', ')
                : 'Open lobby'
          }
          aria-label={isIconVariant ? 'Lobby' : 'Open lobby'}
          aria-expanded={isMenuOpen}
        >
          {connecting && !room ? (
            <Loader2 className={`w-4 h-4 animate-spin ${isIconVariant ? 'text-white/70' : 'text-gray-400'}`} />
          ) : isIconVariant ? (
            <Settings className="w-6 h-6 stroke-white fill-transparent group-hover:fill-white/50 transition-colors duration-150" />
          ) : (
            renderLobbyTriggerContent()
          )}
        </button>
      )}

      <AnimatePresence>
        {useSplitHomeMenus && activePanel === 'profile' && renderDropdownShell(
          'profile',
          renderProfileSection(true),
        )}
        {useSplitHomeMenus && activePanel === 'level' && renderDropdownShell(
          'level',
          renderLevelSection(),
        )}
        {useSplitHomeMenus && activePanel === 'lobby' && renderDropdownShell(
          'lobby',
          <div className="divide-y divide-surface-200">
            {renderLobbyRoomSections(true)}
          </div>,
        )}
        {!useSplitHomeMenus && activePanel === 'lobby' && renderDropdownShell(
          'lobby',
          <div className="divide-y divide-surface-200">
            {renderProfileSection(isHomePage)}
            {renderLobbyRoomSections(false)}
          </div>,
        )}
      </AnimatePresence>

      <HatShopModal open={hatShopOpen} onClose={() => setHatShopOpen(false)} />
    </div>
  );
}
