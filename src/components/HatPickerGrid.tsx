import { Lock } from 'lucide-react';
import type { HatId } from '../networking/types';
import { useRoomContext } from '../networking/roomStore';
import {
  HAT_CATALOG,
  getPlayerLevelForPlayer,
  isHatUnlocked,
  sanitizeSelectedHat,
} from '../hats/hats';
import { readPlayerXp } from '../xp/progress';

export default function HatPickerGrid() {
  const { myPlayer, updateSelectedHat } = useRoomContext();

  const xp = myPlayer?.xp ?? readPlayerXp();
  const level = getPlayerLevelForPlayer({ xp });
  const equipped = sanitizeSelectedHat(myPlayer?.selectedHat ?? 'none', level);

  const handleSelect = (hatId: HatId) => {
    if (!isHatUnlocked(hatId, level)) return;
    updateSelectedHat(hatId);
  };

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      role="listbox"
      aria-label="Choose a hat"
    >
      {HAT_CATALOG.map((hat) => {
        const unlocked = isHatUnlocked(hat.id, level);
        const selected = equipped === hat.id;
        const unlockLabel = hat.requiredLevel > 0 ? `Lv ${hat.requiredLevel}` : null;

        return (
          <button
            key={hat.id}
            type="button"
            role="option"
            aria-label={hat.label}
            aria-selected={selected}
            disabled={!unlocked}
            onClick={() => handleSelect(hat.id)}
            className={`relative flex flex-col items-center rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
              selected
                ? 'border-white/60 bg-white/20 text-white'
                : unlocked
                  ? 'border-white/20 bg-white/5 text-white/90 hover:bg-white/10'
                  : 'border-white/10 bg-black/20 text-white/40 cursor-not-allowed'
            }`}
          >
            {!unlocked && unlockLabel ? (
              <>
                <Lock
                  className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 shrink-0 text-white/50"
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute top-1.5 right-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/50"
                  aria-hidden
                >
                  {unlockLabel}
                </span>
              </>
            ) : null}
            <div
              className={`flex h-16 w-16 justify-center ${hat.imageUrl ? 'items-end' : 'items-center'}`}
            >
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
          </button>
        );
      })}
    </div>
  );
}
