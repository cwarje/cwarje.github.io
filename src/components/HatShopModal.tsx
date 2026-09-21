import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import HatPickerGrid from './HatPickerGrid';
import { HATS_SECTION_THEME } from '../hats/hatsTheme';

interface HatShopModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HatShopModal({ open, onClose }: HatShopModalProps) {
  const theme = HATS_SECTION_THEME;

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a hat"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className={`max-h-[80vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border bg-gradient-to-br p-6 shadow-2xl shadow-black/40 backdrop-blur-md ${theme.gradient} ${theme.cardBorder}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Hats</h2>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-white/25 hover:bg-white/15"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-400 transition-colors hover:text-white" />
              </button>
            </div>
            <HatPickerGrid />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
