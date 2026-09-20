import { motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { getLevelProgress } from '../xp/progress';
import { PROGRESS_SECTION_THEME } from '../xp/progressTheme';

interface ProgressCardProps {
  xp: number;
}

export default function ProgressCard({ xp }: ProgressCardProps) {
  const theme = PROGRESS_SECTION_THEME;
  const { level, xpIntoLevel, xpForNextLevel } = getLevelProgress(xp);
  const fillPercent = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);

  return (
    <motion.div
      aria-label={`Level ${level} progress`}
      className={`relative flex w-full min-h-[140px] flex-col rounded-2xl bg-gradient-to-br ${theme.gradient} p-6 backdrop-blur-md border ${theme.cardBorder}`}
    >
      <span
        className={`absolute top-3 right-3 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wider ${theme.playersTag}`}
      >
        Level {level}
      </span>
      <div className="flex flex-1 items-center justify-start">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex shrink-0 items-center justify-center">
            <ArrowUp className={`h-14 w-14 ${theme.iconColor}`} aria-hidden />
          </div>
          <h3 className="shrink-0 text-xl font-bold text-white">{level}</h3>
          <div className="min-w-0 flex-1 space-y-1">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-valuenow={xpIntoLevel}
              aria-valuemin={0}
              aria-valuemax={xpForNextLevel}
              aria-label={`Level ${level} progress`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-500 transition-[width] duration-300 ease-out"
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            <p className="text-right text-xs text-white/70">
              {xpIntoLevel} / {xpForNextLevel} XP
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
