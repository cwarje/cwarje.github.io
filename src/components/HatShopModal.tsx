import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
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
    <AnimatedModal
      open={open}
      onClose={handleClose}
      modalKey="hat-shop"
      ariaLabel="Choose a hat"
      panelClassName={`max-h-[80vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border p-6 shadow-2xl shadow-black/40 ${theme.panelBg} ${theme.cardBorder}`}
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
    </AnimatedModal>
  );
}
