import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import type { GameType, GameStartOptions } from '../networking/types';
import { GAME_REGISTRY } from '../games/registry';

const DEFAULT_BOT_COUNT = 0;

interface GameStartOptionsPanelProps {
  gameType: GameType;
  playerCount: number;
  isHost: boolean;
  onStart: (options?: GameStartOptions) => void;
}

export default function GameStartOptionsPanel({
  gameType,
  playerCount,
  isHost,
  onStart,
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

  const [botCount, setBotCount] = useState(DEFAULT_BOT_COUNT);
  const [gameOptions, setGameOptions] = useState<Partial<GameStartOptions>>({});

  const handleOptionsChange = useCallback((opts: Partial<GameStartOptions>) => {
    setGameOptions(opts);
  }, []);

  useEffect(() => {
    if (showBots) {
      setBotCount((c) => Math.max(minBots, Math.min(maxBots, c)));
    }
  }, [showBots, minBots, maxBots]);

  const totalCount = playerCount + botCount;
  const canStart =
    playerCount >= 1 &&
    validTotals.includes(totalCount);

  const handlePlay = () => {
    if (!canStart || !isHost) return;
    const options: GameStartOptions = { ...gameOptions };
    if (showBots) options.botCount = botCount;
    onStart(Object.keys(options).length ? options : undefined);
  };

  const GameOptions = gameDef.OptionsPanel;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className={`w-full min-w-0 -mt-px overflow-hidden rounded-b-2xl border border-t-0 ${theme.cardBorder} ${theme.panelBg}`}
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
                {botCount === 0 ? 'No bots' : `${botCount} ${botCount === 1 ? 'bot' : 'bots'}`}
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
