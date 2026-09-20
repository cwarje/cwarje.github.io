import { motion } from 'framer-motion';
import { BowlerHatIcon } from './icons/BowlerHatIcon';
import { HATS_SECTION_THEME } from '../hats/hatsTheme';

interface HatsCardProps {
  onSelect: () => void;
  disabled?: boolean;
  isExpanded?: boolean;
}

export default function HatsCard({ onSelect, disabled, isExpanded }: HatsCardProps) {
  const theme = HATS_SECTION_THEME;

  return (
    <motion.div
      whileHover={disabled || isExpanded ? {} : { scale: 1.02, y: -4 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-expanded={isExpanded}
      className={`relative w-full flex flex-col p-6 min-h-[140px] rounded-2xl bg-gradient-to-br ${theme.gradient} backdrop-blur-md border ${theme.cardBorder} ${isExpanded ? 'rounded-b-none border-b-0' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : `${theme.hoverBorder} cursor-pointer`} transition-colors duration-300 group`}
    >
      <span
        className={`absolute top-3 right-3 px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider ${theme.playersTag}`}
      >
        Change
      </span>
      <div className="flex-1 flex items-center justify-start">
        <div className="flex items-center gap-4">
          <div className="shrink-0 flex items-center justify-center">
            <BowlerHatIcon className={`w-14 h-14 ${theme.iconColor}`} />
          </div>
          <h3 className="text-xl font-bold text-white">Hats</h3>
        </div>
      </div>
    </motion.div>
  );
}
