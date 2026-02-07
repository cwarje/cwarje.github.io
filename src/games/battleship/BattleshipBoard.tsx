import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RotateCw, Check, Trophy, Crosshair } from 'lucide-react';
import type { BattleshipState, Ship, CellState } from './types';
import { SHIPS } from './types';

const BOARD_SIZE = 10;
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

function cellColor(cell: CellState, isOpponent: boolean): string {
  switch (cell) {
    case 'empty': return isOpponent ? 'bg-gray-800/50 hover:bg-primary-600/30' : 'bg-gray-800/50';
    case 'ship': return isOpponent ? 'bg-gray-800/50 hover:bg-primary-600/30' : 'bg-primary-600/30 border-primary-500/30';
    case 'hit': return 'bg-red-500/30 border-red-500/40';
    case 'miss': return 'bg-gray-600/20';
  }
}

function cellContent(cell: CellState): React.ReactNode {
  if (cell === 'hit') return <div className="w-2 h-2 rounded-full bg-red-400" />;
  if (cell === 'miss') return <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />;
  return null;
}

interface GridProps {
  board: CellState[][];
  isOpponent: boolean;
  onClick?: (row: number, col: number) => void;
  ships?: Ship[];
  label: string;
  highlight?: { row: number; col: number } | null;
  placementPreview?: [number, number][];
}

function Grid({ board, isOpponent, onClick, ships, label, highlight, placementPreview }: GridProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-400 text-center">{label}</h3>
      <div className="inline-block">
        {/* Column labels */}
        <div className="flex ml-7">
          {COL_LABELS.map(l => (
            <div key={l} className="w-7 h-5 sm:w-8 sm:h-5 flex items-center justify-center text-[10px] text-gray-600 font-mono">{l}</div>
          ))}
        </div>
        {board.map((row, r) => (
          <div key={r} className="flex items-center">
            <div className="w-7 sm:w-7 flex items-center justify-center text-[10px] text-gray-600 font-mono">{r + 1}</div>
            {row.map((cell, c) => {
              const isPreview = placementPreview?.some(([pr, pc]) => pr === r && pc === c);
              const isHighlight = highlight?.row === r && highlight?.col === c;

              return (
                <button
                  key={c}
                  onClick={() => onClick?.(r, c)}
                  disabled={!onClick}
                  className={`grid-cell w-7 h-7 sm:w-8 sm:h-8 border border-white/5 rounded-sm flex items-center justify-center text-xs transition-all ${
                    isPreview
                      ? 'bg-primary-600/40 border-primary-400/30'
                      : isHighlight
                      ? 'ring-2 ring-amber-400/50'
                      : cellColor(cell, isOpponent)
                  } ${onClick ? 'cursor-pointer' : ''}`}
                >
                  {cellContent(cell)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {/* Ship status */}
      {ships && (
        <div className="flex flex-wrap gap-1 justify-center mt-2">
          {ships.map((ship) => (
            <div
              key={ship.name}
              className={`text-[10px] px-2 py-0.5 rounded-md ${
                ship.sunk
                  ? 'bg-red-500/10 text-red-400 line-through'
                  : 'bg-white/5 text-gray-400'
              }`}
            >
              {ship.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Placement component
function ShipPlacement({ onPlace }: { onPlace: (ships: Ship[]) => void }) {
  const [placedShips, setPlacedShips] = useState<Ship[]>([]);
  const [currentShipIndex, setCurrentShipIndex] = useState(0);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);

  const board: CellState[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill('empty'));
  for (const ship of placedShips) {
    for (const [r, c] of ship.cells) {
      board[r][c] = 'ship';
    }
  }

  const currentShipDef = SHIPS[currentShipIndex];
  const previewCells = useCallback((): [number, number][] => {
    if (!hoverCell || !currentShipDef) return [];
    const [row, col] = hoverCell;
    const cells: [number, number][] = [];
    for (let i = 0; i < currentShipDef.size; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      if (r >= BOARD_SIZE || c >= BOARD_SIZE) return [];
      if (board[r][c] !== 'empty') return [];
      cells.push([r, c]);
    }
    return cells;
  }, [hoverCell, currentShipDef, horizontal, board]);

  const preview = previewCells();

  const handleClick = (row: number, col: number) => {
    if (!currentShipDef) return;
    const cells: [number, number][] = [];
    for (let i = 0; i < currentShipDef.size; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      if (r >= BOARD_SIZE || c >= BOARD_SIZE) return;
      if (board[r][c] !== 'empty') return;
      cells.push([r, c]);
    }
    const ship: Ship = { name: currentShipDef.name, size: currentShipDef.size, cells, sunk: false };
    const newPlaced = [...placedShips, ship];
    setPlacedShips(newPlaced);

    if (currentShipIndex + 1 >= SHIPS.length) {
      // All placed
    } else {
      setCurrentShipIndex(currentShipIndex + 1);
    }
  };

  const allPlaced = placedShips.length === SHIPS.length;

  return (
    <div className="space-y-6 text-center">
      <h2 className="text-xl font-bold text-white">Place Your Ships</h2>

      {!allPlaced && (
        <div className="flex items-center justify-center gap-3">
          <p className="text-sm text-gray-400">
            Placing: <span className="text-white font-medium">{currentShipDef?.name}</span> ({currentShipDef?.size} cells)
          </p>
          <button
            onClick={() => setHorizontal(!horizontal)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            {horizontal ? 'Horizontal' : 'Vertical'}
          </button>
        </div>
      )}

      <div className="flex justify-center"
        onMouseLeave={() => setHoverCell(null)}
      >
        <div className="inline-block">
          <div className="flex ml-7">
            {COL_LABELS.map(l => (
              <div key={l} className="w-7 h-5 sm:w-8 sm:h-5 flex items-center justify-center text-[10px] text-gray-600 font-mono">{l}</div>
            ))}
          </div>
          {board.map((row, r) => (
            <div key={r} className="flex items-center">
              <div className="w-7 sm:w-7 flex items-center justify-center text-[10px] text-gray-600 font-mono">{r + 1}</div>
              {row.map((cell, c) => {
                const isPreview = preview.some(([pr, pc]) => pr === r && pc === c);
                return (
                  <button
                    key={c}
                    onClick={() => handleClick(r, c)}
                    onMouseEnter={() => setHoverCell([r, c])}
                    disabled={allPlaced}
                    className={`grid-cell w-7 h-7 sm:w-8 sm:h-8 border border-white/5 rounded-sm flex items-center justify-center cursor-pointer transition-all ${
                      isPreview
                        ? 'bg-primary-600/40 border-primary-400/30'
                        : cell === 'ship'
                        ? 'bg-primary-600/30 border-primary-500/30'
                        : 'bg-gray-800/50 hover:bg-gray-700/50'
                    }`}
                  >
                    {cellContent(cell)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Ship list */}
      <div className="flex flex-wrap gap-2 justify-center">
        {SHIPS.map((s, i) => (
          <div
            key={s.name}
            className={`text-xs px-2.5 py-1 rounded-md ${
              i < placedShips.length
                ? 'bg-primary-600/20 text-primary-400'
                : i === currentShipIndex && !allPlaced
                ? 'bg-white/10 text-white ring-1 ring-primary-500/30'
                : 'bg-white/5 text-gray-500'
            }`}
          >
            {s.name} ({s.size})
          </div>
        ))}
      </div>

      {allPlaced && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onPlace(placedShips)}
          className="flex items-center gap-2 mx-auto px-6 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors cursor-pointer"
        >
          <Check className="w-4 h-4" />
          Confirm Placement
        </motion.button>
      )}
    </div>
  );
}

interface BattleshipBoardProps {
  state: BattleshipState;
  myId: string;
  onAction: (action: unknown) => void;
}

export default function BattleshipBoard({ state, myId, onAction }: BattleshipBoardProps) {
  const myIndex = state.players.findIndex(p => p.id === myId);
  const myPlayer = state.players[myIndex];
  const opponentIndex = (myIndex + 1) % 2;
  const opponent = state.players[opponentIndex];
  const isMyTurn = state.currentPlayerIndex === myIndex;

  // Placement phase
  if (state.phase === 'placement' && myPlayer && !myPlayer.ready) {
    return (
      <ShipPlacement
        onPlace={(ships) => onAction({ type: 'place-ships', ships })}
      />
    );
  }

  if (state.phase === 'placement') {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Waiting for opponent to place ships...</p>
      </div>
    );
  }

  // Game over
  if (state.phase === 'finished') {
    const isWinner = state.winner === myId;
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-6 text-center">
        <Trophy className={`w-16 h-16 mx-auto ${isWinner ? 'text-amber-400' : 'text-gray-500'}`} />
        <h2 className="text-3xl font-extrabold text-white">{isWinner ? 'Victory!' : 'Defeat'}</h2>
        <p className="text-gray-400">
          {isWinner ? 'You sank all enemy ships!' : `${state.players.find(p => p.id === state.winner)?.name} sank your fleet.`}
        </p>
      </motion.div>
    );
  }

  // Playing phase
  const handleFire = (row: number, col: number) => {
    if (!isMyTurn) return;
    if (myPlayer.shots[row][col] !== 'empty') return;
    onAction({ type: 'fire', row, col });
  };

  return (
    <div className="space-y-6">
      {/* Turn indicator */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5">
          <Crosshair className={`w-4 h-4 ${isMyTurn ? 'text-primary-400' : 'text-gray-500'}`} />
          <p className="text-sm">
            {isMyTurn ? (
              <span className="text-primary-400 font-medium">Your turn - fire!</span>
            ) : (
              <span className="text-gray-400">{opponent?.name} is aiming...</span>
            )}
          </p>
        </div>
        {state.lastShot && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-sm mt-2 font-medium ${
              state.lastShot.result === 'miss' ? 'text-gray-400' : 'text-red-400'
            }`}
          >
            Last shot: {state.lastShot.result === 'sunk' ? 'Sunk!' : state.lastShot.result === 'hit' ? 'Hit!' : 'Miss'}
          </motion.p>
        )}
      </div>

      {/* Grids */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
        {/* Opponent's waters (my shots) */}
        <Grid
          board={myPlayer.shots}
          isOpponent={true}
          onClick={isMyTurn ? handleFire : undefined}
          ships={opponent?.ships.map(s => ({ ...s, cells: s.sunk ? s.cells : [] }))}
          label={`${opponent?.name}'s Waters`}
          highlight={state.lastShot && state.currentPlayerIndex !== myIndex ? state.lastShot : null}
        />

        {/* My waters */}
        <Grid
          board={myPlayer.board}
          isOpponent={false}
          ships={myPlayer.ships}
          label="Your Fleet"
          highlight={state.lastShot && state.currentPlayerIndex === myIndex ? state.lastShot : null}
        />
      </div>
    </div>
  );
}
