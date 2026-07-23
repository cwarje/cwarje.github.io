import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import type { GameType, GameStartOptions } from '../networking/types';
import { GAME_REGISTRY } from '../games/registry';
import {
  FAVORITE_BOTS_CHANGED_EVENT,
  readCustomBots,
  readLastSelectedBotIds,
  resolveBotsForCount,
  writeLastSelectedBotIds,
  type FavoriteBot,
} from '../networking/favoriteBots';
import ColoredBotIcon from './ColoredBotIcon';

const DEFAULT_BOT_COUNT = 0;

interface GameStartOptionsPanelProps {
  gameType: GameType;
  playerCount: number;
  isHost: boolean;
  onStart: (options?: GameStartOptions) => void;
  className?: string;
}

export default function GameStartOptionsPanel({
  gameType,
  playerCount,
  isHost,
  onStart,
  className,
}: GameStartOptionsPanelProps) {
  const gameDef = GAME_REGISTRY[gameType];
  const { theme } = gameDef;
  const allowed = gameDef.allowedPlayerCounts;
  const minBots = allowed
    ? Math.max(0, Math.min(...allowed) - playerCount)
    : Math.max(0, gameDef.minPlayers - playerCount);
  const maxBots = allowed
    ? Math.max(0, Math.max(...allowed) - playerCount)
    : gameDef.maxPlayers - playerCount;
  const validTotals = allowed ?? [gameDef.minPlayers];
  const showBots = (allowed ? playerCount < Math.max(...allowed) : gameDef.minPlayers !== gameDef.maxPlayers && playerCount < gameDef.maxPlayers) && maxBots > 0;

  const [customBots, setCustomBots] = useState<FavoriteBot[]>(() => readCustomBots());
  const [botCount, setBotCount] = useState(DEFAULT_BOT_COUNT);
  const [preferredBotIds, setPreferredBotIds] = useState<string[]>(() => readLastSelectedBotIds());
  const [gameOptions, setGameOptions] = useState<Partial<GameStartOptions>>({});

  const handleOptionsChange = useCallback((opts: Partial<GameStartOptions>) => {
    setGameOptions(opts);
  }, []);

  useEffect(() => {
    const refreshBots = () => setCustomBots(readCustomBots());
    refreshBots();
    window.addEventListener(FAVORITE_BOTS_CHANGED_EVENT, refreshBots);
    window.addEventListener('storage', refreshBots);
    return () => {
      window.removeEventListener(FAVORITE_BOTS_CHANGED_EVENT, refreshBots);
      window.removeEventListener('storage', refreshBots);
    };
  }, []);

  useEffect(() => {
    if (showBots) {
      setBotCount((c) => Math.max(minBots, Math.min(maxBots, c || minBots)));
    }
  }, [showBots, minBots, maxBots]);

  useEffect(() => {
    setPreferredBotIds((ids) => {
      const valid = ids.filter((id) => customBots.some((b) => b.id === id));
      const next = [...valid];
      for (const bot of customBots) {
        if (next.length >= botCount) break;
        if (!next.includes(bot.id)) next.push(bot.id);
      }
      return next;
    });
  }, [botCount, customBots]);

  const joiningBotIds = useMemo(() => {
    const resolved = resolveBotsForCount(botCount, preferredBotIds, [], customBots);
    return new Set(
      resolved
        .filter((bot) => customBots.some((custom) => custom.id === bot.id))
        .map((bot) => bot.id),
    );
  }, [botCount, preferredBotIds, customBots]);

  const toggleBot = (id: string) => {
    setPreferredBotIds((ids) => {
      if (ids.includes(id)) {
        return ids.filter((x) => x !== id);
      }
      if (ids.length >= botCount) {
        return [...ids.slice(1), id];
      }
      return [...ids, id];
    });
  };

  const totalCount = playerCount + botCount;
  const canStart = (() => {
    if (playerCount < 1) return false;
    if (playerCount > gameDef.maxPlayers) return false;
    if (allowed) return validTotals.includes(totalCount);
    if (gameDef.minPlayers === gameDef.maxPlayers) return true;
    return totalCount >= gameDef.minPlayers && totalCount <= gameDef.maxPlayers;
  })();

  const handlePlay = () => {
    if (!canStart || !isHost) return;
    const options: GameStartOptions = { ...gameOptions };
    if (showBots && botCount > 0) {
      const resolved = resolveBotsForCount(botCount, preferredBotIds, [], customBots);
      options.botCount = botCount;
      options.selectedBots = resolved.map((b) => ({
        id: b.id,
        name: b.name,
        color: b.color,
      }));
      writeLastSelectedBotIds(
        resolved
          .filter((bot) => customBots.some((custom) => custom.id === bot.id))
          .map((b) => b.id),
      );
    }
    onStart(Object.keys(options).length ? options : undefined);
  };

  const GameOptions = gameDef.OptionsPanel;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={{
        duration: 0.2,
        ease: 'easeInOut',
        opacity: { duration: 0.15 },
      }}
      className={`w-full min-w-0 -mt-px overflow-hidden rounded-b-2xl border border-t-0 shadow-xl shadow-black/40 ${theme.cardBorder} ${theme.panelBg}${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={`Options for ${gameDef.title}`}
    >
      <div className="p-4 pt-2 pb-5 space-y-4">
        {GameOptions && (
          <GameOptions
            onChange={handleOptionsChange}
            labelClass={theme.labelColor}
            playerCount={playerCount}
            botCount={showBots ? botCount : 0}
          />
        )}

        {showBots && (
          <div className="space-y-2">
            <p className={`text-sm font-semibold uppercase tracking-wider ${theme.labelColor}`}>Bots</p>
            <div
              className="flex items-center justify-center gap-4 py-1"
              role="group"
              aria-label="Number of bots"
            >
              <button
                type="button"
                aria-label="Fewer bots"
                disabled={botCount <= minBots}
                onClick={() => setBotCount((c) => Math.max(minBots, c - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <Minus className="h-5 w-5" />
              </button>
              <span
                className="min-w-[3rem] text-center text-lg font-medium text-white"
                aria-valuenow={botCount}
                aria-valuemin={minBots}
                aria-valuemax={maxBots}
              >
                {botCount === 1 ? '1 bot' : `${botCount} bots`}
              </span>
              <button
                type="button"
                aria-label="More bots"
                disabled={botCount >= maxBots}
                onClick={() => setBotCount((c) => Math.min(maxBots, c + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            {customBots.length > 0 && (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Choose bots for this game"
              >
                {customBots.map((bot) => {
                  const joining = joiningBotIds.has(bot.id);
                  return (
                    <button
                      key={bot.id}
                      type="button"
                      aria-pressed={joining}
                      onClick={() => toggleBot(bot.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                        joining
                          ? 'border-white/60 bg-white/20 text-white'
                          : 'border-white/20 bg-white/5 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      <ColoredBotIcon color={bot.color} />
                      {bot.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handlePlay}
          disabled={!canStart || !isHost}
          className={`w-full py-3 px-4 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none ${theme.buttonColors}`}
        >
          Play
        </button>
      </div>
    </motion.div>
  );
}
