import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import type { GameType, GameStartOptions, HeartsTargetScore, UpRiverStartMode } from '../networking/types';
import { GAME_CATALOG } from '../games/gameCatalog';
import { CARD_BORDER, BUTTON_COLORS, LABEL_COLORS, PANEL_BG } from './gameCardThemes';

const DEFAULT_HEARTS_TARGET: HeartsTargetScore = 100;
const DEFAULT_UP_RIVER_MODE: UpRiverStartMode = 'down-up'; // 7-1-7
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
  const catalog = GAME_CATALOG[gameType];
  const minBots = Math.max(0, catalog.minPlayers - playerCount);
  const maxBots = catalog.maxPlayers - playerCount;
  const showBots = catalog.minPlayers !== catalog.maxPlayers && playerCount < catalog.maxPlayers;

  const [heartsTarget, setHeartsTarget] = useState<HeartsTargetScore>(DEFAULT_HEARTS_TARGET);
  const [upRiverMode, setUpRiverMode] = useState<UpRiverStartMode>(DEFAULT_UP_RIVER_MODE);
  const [botCount, setBotCount] = useState(DEFAULT_BOT_COUNT);

  useEffect(() => {
    if (showBots) {
      setBotCount((c) => Math.max(minBots, Math.min(maxBots, c)));
    }
  }, [showBots, minBots, maxBots]);

  const canStart =
    playerCount >= catalog.minPlayers &&
    playerCount <= catalog.maxPlayers &&
    (!showBots || playerCount + botCount >= catalog.minPlayers);

  const handlePlay = () => {
    if (!canStart || !isHost) return;
    const options: GameStartOptions = {};
    if (gameType === 'hearts') options.targetScore = heartsTarget;
    if (gameType === 'up-and-down-the-river') {
      options.upRiverStartMode = upRiverMode;
      if (showBots) options.botCount = botCount;
    }
    if (showBots && gameType !== 'up-and-down-the-river') options.botCount = botCount;
    onStart(Object.keys(options).length ? options : undefined);
  };

  const panelBg = PANEL_BG[gameType];
  const border = CARD_BORDER[gameType];
  const buttonClass = BUTTON_COLORS[gameType];
  const labelClass = LABEL_COLORS[gameType];

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className={`w-full min-w-0 -mt-px overflow-hidden rounded-b-2xl border border-t-0 ${border} ${panelBg}`}
      role="region"
      aria-label={`Options for ${catalog.title}`}
    >
      <div className="p-4 pt-2 pb-5 space-y-4">
        {gameType === 'hearts' && (
          <div className="space-y-2">
            <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Game to</p>
            <div className="flex gap-2">
              {([50, 100] as const).map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setHeartsTarget(score)}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                    heartsTarget === score
                      ? 'bg-rose-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameType === 'up-and-down-the-river' && (
          <div className="space-y-2">
            <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Round order</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUpRiverMode('up-down')}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                  upRiverMode === 'up-down'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
                }`}
              >
                1 - 7 - 1
              </button>
              <button
                type="button"
                onClick={() => setUpRiverMode('down-up')}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                  upRiverMode === 'down-up'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
                }`}
              >
                7 - 1 - 7
              </button>
            </div>
          </div>
        )}

        {showBots && (
          <div className="space-y-2">
            <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Bots</p>
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
          className={`w-full py-3 px-4 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none ${buttonClass}`}
        >
          Play
        </button>
      </div>
    </motion.div>
  );
}
