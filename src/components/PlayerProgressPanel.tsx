import { getLevelProgress, isDoubleXpWeekend } from '../xp/progress';

interface PlayerProgressPanelProps {
  xp: number;
  className?: string;
  showDoubleXpWeekendBadge?: boolean;
}

export default function PlayerProgressPanel({
  xp,
  className,
  showDoubleXpWeekendBadge = true,
}: PlayerProgressPanelProps) {
  const { level, xpIntoLevel, xpForNextLevel } = getLevelProgress(xp);
  const fillPercent = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);
  const showDoubleXp = showDoubleXpWeekendBadge && isDoubleXpWeekend();

  return (
    <div className={`minigolf-progressCard ${className ?? ''}`.trim()}>
      <h4 className="minigolf-progressTitle">Progress</h4>
      <p className="minigolf-progressLevel">Level {level}</p>
      <div
        className="minigolf-progressMeter"
        role="progressbar"
        aria-valuenow={xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={xpForNextLevel}
        aria-label={`Level ${level} progress`}
      >
        <div className="minigolf-progressMeterFill" style={{ width: `${fillPercent}%` }} />
      </div>
      <div className="minigolf-progressFooter">
        <p className="minigolf-progressMeta">
          {xpIntoLevel} / {xpForNextLevel} XP
        </p>
        {showDoubleXp && (
          <div className="minigolf-progressBadges">
            <span className="minigolf-doubleXpWeekendBadge">Double XP Weekend</span>
          </div>
        )}
      </div>
    </div>
  );
}
