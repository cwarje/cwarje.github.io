import { useRoomContext } from '../networking/roomStore';
import { XP_PER_LEVEL, getLevelProgress, readPlayerXp } from '../xp/progress';

const devButtonClass =
  'rounded-md border border-amber-300/60 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/30 cursor-pointer';

export default function HeaderLevelProgress() {
  const { myPlayer, updatePlayerXp } = useRoomContext();
  const xp = myPlayer?.xp ?? readPlayerXp();
  const { level, xpIntoLevel, xpForNextLevel } = getLevelProgress(xp);
  const fillPercent = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);
  const showDevLevelControls = import.meta.env.DEV;

  return (
    <div
      className="flex w-[min(100vw-8rem,20rem)] items-center gap-2 sm:w-[22rem] sm:gap-3"
      aria-label={`Level ${level} progress`}
    >
      <span className="shrink-0 text-xs font-bold text-white sm:text-sm">
        Lv {level}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/15 sm:h-2"
          role="progressbar"
          aria-valuenow={xpIntoLevel}
          aria-valuemin={0}
          aria-valuemax={xpForNextLevel}
          aria-label={`Level ${level} progress`}
        >
          <div
            className="h-full rounded-full bg-primary-500 transition-[width] duration-300 ease-out"
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <p className="hidden truncate text-right text-[10px] text-white/60 sm:block">
          {xpIntoLevel} / {xpForNextLevel} XP
        </p>
      </div>
      {showDevLevelControls && (
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <button
            type="button"
            className={devButtonClass}
            aria-label="Decrease level by one"
            onClick={() => updatePlayerXp(Math.max(0, xp - XP_PER_LEVEL))}
          >
            −1
          </button>
          <button
            type="button"
            className={devButtonClass}
            aria-label="Increase level by one"
            onClick={() => updatePlayerXp(xp + XP_PER_LEVEL)}
          >
            +1
          </button>
        </div>
      )}
    </div>
  );
}
