import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import type { HatId } from '../networking/types';
import { useRoomContext } from '../networking/roomStore';
import {
  HAT_CATALOG,
  getPlayerLevelForPlayer,
  isHatUnlocked,
  sanitizeSelectedHat,
} from '../hats/hats';
import { HATS_SECTION_THEME } from '../hats/hatsTheme';
import { readPlayerXp } from '../xp/progress';
import PlayerProgressPanel from './PlayerProgressPanel';

interface HatsShopPanelProps {
  className?: string;
}

export default function HatsShopPanel({ className }: HatsShopPanelProps) {
  const { myPlayer, updateSelectedHat } = useRoomContext();
  const theme = HATS_SECTION_THEME;

  const xp = myPlayer?.xp ?? readPlayerXp();
  const level = getPlayerLevelForPlayer({ xp });
  const equipped = sanitizeSelectedHat(myPlayer?.selectedHat ?? 'none', level);

  const handleSelect = (hatId: HatId) => {
    if (!isHatUnlocked(hatId, level)) return;
    updateSelectedHat(hatId);
  };

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
      aria-label="Hat shop"
    >
      <div className="p-4 pt-2 pb-5 space-y-4">
        <PlayerProgressPanel xp={xp} />
        <div
          className="grid grid-cols-2 sm:grid-cols-3 gap-3"
          role="listbox"
          aria-label="Choose a hat"
        >
          {HAT_CATALOG.map((hat) => {
            const unlocked = isHatUnlocked(hat.id, level);
            const selected = equipped === hat.id;
            const unlockLabel =
              hat.requiredLevel > 0 ? `Lv ${hat.requiredLevel}` : null;

            return (
              <button
                key={hat.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={!unlocked}
                onClick={() => handleSelect(hat.id)}
                className={`relative flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-white/60 bg-white/20 text-white'
                    : unlocked
                      ? 'border-white/20 bg-white/5 text-white/90 hover:bg-white/10'
                      : 'border-white/10 bg-black/20 text-white/40 cursor-not-allowed'
                }`}
              >
                <div className="flex h-16 w-16 items-end justify-center">
                  {hat.imageUrl ? (
                    <img
                      src={hat.imageUrl}
                      alt=""
                      className={`max-h-full max-w-full object-contain ${unlocked ? '' : 'opacity-40 grayscale'}`}
                    />
                  ) : (
                    <span className="text-xs uppercase tracking-wide text-white/50">None</span>
                  )}
                </div>
                <span className="text-center leading-tight">{hat.label}</span>
                {!unlocked && unlockLabel && (
                  <span className="absolute top-2 right-2 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    <Lock className="h-3 w-3" aria-hidden />
                    {unlockLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
