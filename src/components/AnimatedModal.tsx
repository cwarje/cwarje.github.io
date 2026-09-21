import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const BACKDROP_TRANSITION = { duration: 0.18, ease: 'easeOut' as const };
const PANEL_TRANSITION = { duration: 0.18, ease: 'easeOut' as const };

export interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  /** Stable id for AnimatePresence (e.g. "hat-shop", "game-info"). */
  modalKey: string;
  ariaLabel: string;
  panelClassName: string;
  children: ReactNode;
  onExitComplete?: () => void;
}

export default function AnimatedModal({
  open,
  onClose,
  modalKey,
  ariaLabel,
  panelClassName,
  children,
  onExitComplete,
}: AnimatedModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence initial={false} onExitComplete={onExitComplete}>
      {open && (
        <motion.div
          key={modalKey}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          initial="closed"
          animate="open"
          exit="closed"
          variants={{
            open: { opacity: 1 },
            closed: { opacity: 1 },
          }}
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            variants={{
              open: { opacity: 1 },
              closed: { opacity: 0 },
            }}
            transition={BACKDROP_TRANSITION}
            className="absolute inset-0 cursor-default border-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            variants={{
              open: { scale: 1 },
              closed: { scale: 0.95 },
            }}
            transition={PANEL_TRANSITION}
            className={`relative z-10 ${panelClassName}`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
