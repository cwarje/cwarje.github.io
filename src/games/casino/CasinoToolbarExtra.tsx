import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info } from 'lucide-react';

type CheatSheetSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

const SUIT_SYMBOLS: Record<CheatSheetSuit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<CheatSheetSuit, string> = {
  hearts: 'text-red-400',
  diamonds: 'text-red-400',
  clubs: 'text-gray-800',
  spades: 'text-gray-800',
};

function ColoredCard({ suit, children }: { suit: CheatSheetSuit; children: ReactNode }) {
  return (
    <span className={`inline-block origin-left scale-150 leading-none ${SUIT_COLORS[suit]}`}>
      {children}
    </span>
  );
}

const CHEAT_SHEET_ROWS: {
  card: ReactNode;
  countsAs: string;
  points?: string;
}[] = [
  {
    card: (
      <ColoredCard suit="spades">
        5{SUIT_SYMBOLS.spades}
      </ColoredCard>
    ),
    countsAs: 'Clear table',
  },
  {
    card: (
      <ColoredCard suit="diamonds">
        10{SUIT_SYMBOLS.diamonds}
      </ColoredCard>
    ),
    countsAs: '10 or 16',
    points: '2 points',
  },
  {
    card: (
      <ColoredCard suit="spades">
        2{SUIT_SYMBOLS.spades}
      </ColoredCard>
    ),
    countsAs: '1 or 15',
    points: '1 point',
  },
  { card: 'Aces', countsAs: '1 or 14', points: '1 point' },
  { card: 'Kings', countsAs: '13' },
  { card: 'Queens', countsAs: '12' },
  { card: 'Jacks', countsAs: '11' },
];

function CasinoRulesCheatSheet() {
  return (
    <div
      id="casino-rules-cheat-sheet"
      className="w-fit max-w-[min(calc(100vw-1.5rem),28rem)] sm:max-w-[min(calc(100vw-2rem),28rem)]"
    >
      <table className="table-auto text-sm text-white/90">
        <thead>
          <tr className="border-b border-white/15 text-left text-white/70">
            <th className="pb-2 pr-3 font-medium">Card</th>
            <th className="pb-2 pr-3 font-medium">Counts as</th>
            <th className="pb-2 font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {CHEAT_SHEET_ROWS.map((row, i) => (
            <tr key={i} className="border-b border-white/10 last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">{row.card}</td>
              <td className="py-2 pr-3">{row.countsAs}</td>
              <td className="py-2 whitespace-nowrap">{row.points ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CasinoToolbarExtra() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center w-9 h-9 text-white hover:text-white/80 transition-all duration-150 cursor-pointer group active:scale-90 ${open ? 'scale-90' : ''}`}
        title={open ? 'Hide rules cheat sheet' : 'Show rules cheat sheet'}
        aria-label="Casino rules cheat sheet"
        aria-pressed={open}
        aria-expanded={open}
        aria-controls="casino-rules-cheat-sheet"
      >
        <Info className="w-6 h-6 stroke-white" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed left-3 sm:left-4 bottom-3 sm:bottom-4 z-30 pointer-events-auto"
          >
            <CasinoRulesCheatSheet />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
