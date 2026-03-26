import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, MobilizationPlayer, MobilizationState, Suit } from './types';
import {
  canPlayOnSolitaireBottom,
  canPlayOnSolitaireTop,
  canPlaySevenOnColumn,
  cardEquals,
  getLegalSolitairePlays,
  isValidMobilizationTrickPlay,
} from './rules';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<Suit, string> = {
  hearts: 'text-red-400',
  diamonds: 'text-red-400',
  clubs: 'text-gray-800',
  spades: 'text-gray-800',
};

interface MobilizationBoardProps {
  state: MobilizationState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
  isHost?: boolean;
}

interface SeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: MobilizationPlayer;
  seatLeft: number;
  seatTop: number;
}

interface TrickSlotPlacement {
  row: 1 | 2;
  col: 1 | 2 | 3;
  dx: string;
  dy: string;
}

interface ElementSize {
  width: number;
  height: number;
}

const RIVER_SEAT_EDGE_GAP_PX = 8;
const TRICK_EXIT_DISTANCE_PX = 72;

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount >= 6) return { seatRadiusX: 40, seatRadiusY: 34 };
  if (playerCount === 5) return { seatRadiusX: 37, seatRadiusY: 32 };
  return { seatRadiusX: 35, seatRadiusY: 30 };
}

const TRICK_SLOT_PLACEMENTS: Record<number, TrickSlotPlacement[]> = {
  4: [
    { row: 2, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 1, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.5)' },
    { row: 1, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.5)' },
  ],
  5: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * 0.25)' },
    { row: 2, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: 'calc(var(--river-slot-w) * 0.5)', dy: '0px' },
    { row: 1, col: 3, dx: 'calc(var(--river-slot-w) * -0.5)', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: '0px' },
  ],
  6: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * 0.25)' },
    { row: 2, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.25)' },
    { row: 1, col: 3, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: '0px' },
  ],
};

function getTrickSlotPlacement(playerCount: number, relativeIndex: number): TrickSlotPlacement {
  return TRICK_SLOT_PLACEMENTS[playerCount]?.[relativeIndex] ?? { row: 2, col: 2, dx: '0px', dy: '0px' };
}

function canPlaceSolitaireAt(
  state: MobilizationState,
  card: Card,
  columnIndex: number,
  rowIndex: number,
): boolean {
  const col = state.solitaireColumns[columnIndex];
  if (!col) return false;
  if (rowIndex === 1) return canPlaySevenOnColumn(col, card);
  if (rowIndex === 0) return canPlayOnSolitaireBottom(col, card);
  if (rowIndex === 2) return canPlayOnSolitaireTop(col, card);
  return false;
}

function legalRowToGridRow(row: 'top' | 'mid' | 'bottom'): 0 | 1 | 2 {
  if (row === 'top') return 2;
  if (row === 'mid') return 1;
  return 0;
}

export default function MobilizationBoard({ state, myId, onAction, isHandZoomed = false, isHost = false }: MobilizationBoardProps) {
  const myIndex = state.players.findIndex(player => player.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = myIndex >= 0 && state.currentPlayerIndex === myIndex;
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLDivElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [selectedSolitaireCard, setSelectedSolitaireCard] = useState<Card | null>(null);
  const [solitaireHandHoverCard, setSolitaireHandHoverCard] = useState<Card | null>(null);

  useEffect(() => {
    if (state.phase !== 'solitaire') {
      setSelectedSolitaireCard(null);
      setSolitaireHandHoverCard(null);
    }
  }, [state.phase, state.roundIndex]);

  useEffect(() => {
    if (state.phase === 'solitaire' && !isMyTurn) setSolitaireHandHoverCard(null);
  }, [state.phase, isMyTurn]);

  const seatLayouts = useMemo<SeatLayout[]>(() => {
    const playerCount = state.players.length;
    if (playerCount === 0) return [];
    const fallbackRadii = getLayoutRadii(playerCount);
    const canUseMeasuredRadii =
      tableSize.width > 0 &&
      tableSize.height > 0 &&
      seatPillSize.width > 0 &&
      seatPillSize.height > 0;
    const radii = canUseMeasuredRadii
      ? (() => {
          const usableHalfWidth = tableSize.width / 2 - seatPillSize.width / 2 - RIVER_SEAT_EDGE_GAP_PX;
          const usableHalfHeight = tableSize.height / 2 - seatPillSize.height / 2 - RIVER_SEAT_EDGE_GAP_PX;
          return {
            seatRadiusX: Math.max(0, Math.min(50, (usableHalfWidth / tableSize.width) * 100)),
            seatRadiusY: Math.max(0, Math.min(50, (usableHalfHeight / tableSize.height) * 100)),
          };
        })()
      : fallbackRadii;

    return Array.from({ length: playerCount }, (_, relativeIndex) => {
      const playerIndex = (anchorIndex + relativeIndex) % playerCount;
      const player = state.players[playerIndex];
      const angle = 90 + (360 * relativeIndex) / playerCount;
      const angleInRadians = (angle * Math.PI) / 180;
      return {
        relativeIndex,
        playerIndex,
        player,
        seatLeft: 50 + radii.seatRadiusX * Math.cos(angleInRadians),
        seatTop: 50 + radii.seatRadiusY * Math.sin(angleInRadians),
      };
    }).filter(layout => !!layout.player);
  }, [state.players, anchorIndex, tableSize.width, tableSize.height, seatPillSize.width, seatPillSize.height]);

  const trickByRelativeSeat = useMemo(() => {
    const mapped: Partial<Record<number, { playerId: string; card: Card }>> = {};
    const playerCount = state.players.length;
    state.currentTrick.forEach((entry) => {
      const index = state.players.findIndex(p => p.id === entry.playerId);
      if (index === -1) return;
      const relative = (index - anchorIndex + playerCount) % playerCount;
      mapped[relative] = entry;
    });
    return mapped;
  }, [state.currentTrick, state.players, anchorIndex]);

  const trickWinnerRelativeSeat = useMemo(() => {
    if (!state.trickWinner) return null;
    const winnerIndex = state.players.findIndex(player => player.id === state.trickWinner);
    if (winnerIndex === -1) return null;
    return (winnerIndex - anchorIndex + state.players.length) % state.players.length;
  }, [state.players, state.trickWinner, anchorIndex]);

  const trickExitOffset = useMemo(() => {
    if (trickWinnerRelativeSeat === null) return { x: 0, y: 20 };
    const winnerLayout = seatLayouts.find(layout => layout.relativeIndex === trickWinnerRelativeSeat);
    if (!winnerLayout) return { x: 0, y: 20 };
    const deltaX = winnerLayout.seatLeft - 50;
    const deltaY = winnerLayout.seatTop - 50;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.001) return { x: 0, y: 20 };
    return {
      x: (deltaX / distance) * TRICK_EXIT_DISTANCE_PX,
      y: (deltaY / distance) * TRICK_EXIT_DISTANCE_PX,
    };
  }, [trickWinnerRelativeSeat, seatLayouts]);

  const myLegalSolitaire = useMemo(() => {
    if (!myPlayer || state.phase !== 'solitaire') return [];
    return getLegalSolitairePlays(state.solitaireColumns, myPlayer.hand);
  }, [state.phase, state.solitaireColumns, myPlayer]);

  const solitaireHandHoverCellKeys = useMemo(() => {
    if (!solitaireHandHoverCard) return new Set<string>();
    const keys = new Set<string>();
    for (const lp of myLegalSolitaire) {
      if (cardEquals(lp.card, solitaireHandHoverCard)) {
        keys.add(`${lp.columnIndex}-${legalRowToGridRow(lp.row)}`);
      }
    }
    return keys;
  }, [myLegalSolitaire, solitaireHandHoverCard]);

  const headsUpContent = useMemo((): ReactNode => {
    if (state.phase === 'round-depleted') {
      const noun = state.trickRoundDepletedKind === 'clubs' ? 'clubs' : 'queens';
      return `Round over, no more ${noun} to take`;
    }

    if (state.phase === 'round-end') {
      return (
        <>
          {'Round scores: '}
          {state.players.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ' · '}
              {p.id === myId ? 'You' : <span style={{ color: getPlayerHudTextColor(p.color) }}>{p.name}</span>}
              {' '}
              <span className="text-cyan-50">({p.roundScore >= 0 ? '+' : ''}{p.roundScore})</span>
            </span>
          ))}
        </>
      );
    }

    if (state.phase === 'solitaire-reveal' && state.solitaireReveal) {
      const rev = state.solitaireReveal;
      if (rev.kind === 'pass') {
        if (rev.actorId === myId) return 'You took the pig';
        const actor = state.players.find(p => p.id === rev.actorId);
        return (
          <>
            {actor ? (
              <span style={{ color: getPlayerHudTextColor(actor.color) }}>{actor.name}</span>
            ) : (
              'Player'
            )}
            {' took the pig'}
          </>
        );
      }
      const actor = state.players.find(p => p.id === rev.actorId);
      const c = rev.card;
      return (
        <>
          {rev.actorId === myId ? (
            'You'
          ) : actor ? (
            <span style={{ color: getPlayerHudTextColor(actor.color) }}>{actor.name}</span>
          ) : (
            'Player'
          )}
          {' played '}
          <span className={SUIT_COLORS[c.suit]}>
            {rankDisplay(c.rank)}
            {SUIT_SYMBOLS[c.suit]}
          </span>
        </>
      );
    }

    if (state.phase === 'solitaire') {
      if (isMyTurn && myLegalSolitaire.length === 0) return 'You must pass (no legal play)';
      if (isMyTurn) return 'Your turn';
      const w = state.players[state.currentPlayerIndex];
      if (!w) return null;
      return (
        <>
          {'Waiting for '}
          <span style={{ color: getPlayerHudTextColor(w.color) }}>{w.name}</span>
        </>
      );
    }

    if (state.phase === 'playing' && state.trickWinner) {
      const winner = state.players.find(player => player.id === state.trickWinner);
      if (!winner) return null;
      return (
        <>
          <span style={{ color: getPlayerHudTextColor(winner.color) }}>{winner.name}</span>
          {' won the trick'}
        </>
      );
    }
    if (state.phase === 'playing' && isMyTurn) return 'Your turn';
    if (state.phase === 'playing') {
      const w = state.players[state.currentPlayerIndex];
      if (!w) return null;
      return (
        <>
          {'Waiting for '}
          <span style={{ color: getPlayerHudTextColor(w.color) }}>{w.name}</span>
        </>
      );
    }
    return null;
  }, [
    state.phase,
    state.players,
    state.trickWinner,
    state.currentPlayerIndex,
    state.trickRoundDepletedKind,
    state.solitaireReveal,
    isMyTurn,
    myId,
    myLegalSolitaire.length,
  ]);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const updateSize = () => setTableSize({ width: element.clientWidth, height: element.clientHeight });
    updateSize();
    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!seatPillElement) return;
    const updateSize = () => {
      setSeatPillSize({ width: seatPillElement.clientWidth, height: seatPillElement.clientHeight });
    };
    updateSize();
    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(seatPillElement);
    return () => resizeObserver.disconnect();
  }, [seatPillElement]);

  useEffect(() => {
    const element = handContainerRef.current;
    if (!element) return;
    const updateSize = () => setHandWidth(element.clientWidth);
    updateSize();
    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const handLayout = useMemo(() => {
    const cardCount = myPlayer?.hand.length ?? 0;
    const available = Math.max(handWidth - 8, 220);
    const cardWidth = Math.max(58, Math.min(available * 0.2, available < 420 ? 72 : 84));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.58);
    const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
    const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [handWidth, myPlayer?.hand.length]);

  const renderCardFace = (card: Card, disabled = false, compact = false) => (
    <div className={`river-card ${disabled ? 'river-card--disabled' : ''} ${compact ? 'river-card--compact' : ''}`}>
      <div className="river-cardCorner">
        <span className={`river-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
        <span className={`river-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  const renderSeatPill = (seatLayout: SeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn =
      state.players[state.currentPlayerIndex]?.id === player.id
      && (state.phase === 'solitaire' || (state.phase === 'playing' && !state.trickWinner));
    const isMe = player.id === myId;
    const hasPig =
      (state.phase === 'solitaire' || state.phase === 'solitaire-reveal') && state.pigHolderId === player.id;
    const seatPillStateClass =
      state.phase === 'round-end'
        ? player.roundScore >= 0
          ? 'river-seatPill--roundSuccess'
          : 'river-seatPill--roundFail'
        : isCurrentTurn
          ? isMe
            ? 'river-seatPill--activeSelf'
            : 'river-seatPill--activeOther'
          : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';

    const isSolitaire = state.phase === 'solitaire' || state.phase === 'solitaire-reveal';

    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`river-seatPill river-seatPill--mobilization2col ${seatPillStateClass} ${isMe ? 'river-seatPill--me' : ''}`}
      >
        <div
          className="river-seatPillTop river-seatPillTop--mobilization"
          style={{ backgroundColor: seatColor, color: seatTextColor }}
        >
          <span className="river-seatName river-seatName--mobilization">{isMe ? 'You' : player.name}</span>
          {hasPig ? (
            <span className="mobilization-seatPig" aria-label="Has the pig">
              {'\u{1F437}'}
            </span>
          ) : null}
        </div>
        <div className="river-seatPillLabels">
          <span className="river-seatCell river-seatCell--bid">{isSolitaire ? 'Hand' : 'Trx'}</span>
          <span className="river-seatCell river-seatCell--total">Tot</span>
        </div>
        <div className="river-seatPillValues">
          <span className="river-seatCell river-seatCell--bid">{isSolitaire ? player.hand.length : player.tricksThisRound}</span>
          <span className="river-seatCell river-seatCell--total">{player.totalScore}</span>
        </div>
      </div>
    );
  };

  const playTrickCard = (card: Card) => {
    if (state.phase !== 'playing' || !isMyTurn || state.trickWinner || myIndex < 0) return;
    if (!isValidMobilizationTrickPlay(state, myIndex, card)) return;
    onAction({ type: 'play-card', card });
  };

  const solitaireSelectOrPlay = (card: Card) => {
    if (state.phase !== 'solitaire' || !isMyTurn || myIndex < 0) return;
    if (!myPlayer?.hand.some(c => cardEquals(c, card))) return;

    if (selectedSolitaireCard && cardEquals(selectedSolitaireCard, card)) {
      setSelectedSolitaireCard(null);
      return;
    }

    const singles = myLegalSolitaire.filter(
      lp => lp.card.suit === card.suit && lp.card.rank === card.rank,
    );
    if (singles.length === 1) {
      const only = singles[0]!;
      onAction({ type: 'solitaire-play', card: only.card, columnIndex: only.columnIndex });
      setSelectedSolitaireCard(null);
      return;
    }

    setSelectedSolitaireCard(card);
  };

  const solitaireCellClick = (columnIndex: number, rowIndex: number) => {
    if (state.phase !== 'solitaire' || !isMyTurn || !selectedSolitaireCard) return;
    if (!canPlaceSolitaireAt(state, selectedSolitaireCard, columnIndex, rowIndex)) return;
    onAction({ type: 'solitaire-play', card: selectedSolitaireCard, columnIndex });
    setSelectedSolitaireCard(null);
  };

  const solitairePass = () => {
    if (state.phase !== 'solitaire' || !isMyTurn || myLegalSolitaire.length > 0) return;
    onAction({ type: 'solitaire-pass' });
  };

  const devJumpToolbar =
    import.meta.env.DEV && isHost ? (
      <div
        className="pointer-events-auto fixed top-24 right-3 z-[35] flex max-w-[11rem] flex-col gap-1 rounded-lg border border-amber-500/40 bg-black/70 px-2 py-1.5 text-left shadow-lg backdrop-blur-sm"
        role="region"
        aria-label="Development: jump to round"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">Dev rounds</span>
        <div className="flex flex-wrap gap-1">
          {([0, 1, 2, 3, 4, 5] as const).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => onAction({ type: 'dev-jump-round', roundIndex: r })}
              className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-white/15"
            >
              R{r}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  if (state.gameOver) {
    const rankedPlayers = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="river-board relative h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        {devJumpToolbar}
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <div className="space-y-3 w-full max-w-2xl">
          {rankedPlayers.map((player, i) => (
            <div key={player.id} className="river-resultRow">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">#{i + 1}</span>
                <span className="font-semibold">{player.name}</span>
              </div>
              <span className="text-xl font-bold">{player.totalScore} pts</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  const renderSolitaireCenter = () => {
    const playReveal =
      state.phase === 'solitaire-reveal' && state.solitaireReveal?.kind === 'play' ? state.solitaireReveal : null;

    return (
    <div className="mobilization-solitaireWrap">
      <div className="mobilization-solitaireGrid">
        {[0, 1, 2].flatMap((rowIdx) =>
          [0, 1, 2, 3].map((colIdx) => {
            const col = state.solitaireColumns[colIdx];
            let card: Card | null = null;
            if (rowIdx === 0) card = col?.bottomCard ?? null;
            else if (rowIdx === 1) card = col?.seven ?? null;
            else card = col?.topCard ?? null;

            const canDrop =
              state.phase === 'solitaire'
              && !!selectedSolitaireCard
              && isMyTurn
              && canPlaceSolitaireAt(state, selectedSolitaireCard, colIdx, rowIdx);

            const isHandHoverTarget = solitaireHandHoverCellKeys.has(`${colIdx}-${rowIdx}`);
            const isRevealHighlight =
              !!playReveal && playReveal.columnIndex === colIdx && playReveal.rowIndex === rowIdx;

            return (
              <button
                key={`${colIdx}-${rowIdx}`}
                type="button"
                disabled={!canDrop}
                onClick={() => solitaireCellClick(colIdx, rowIdx)}
                className={`mobilization-solitaireCell ${card ? 'mobilization-solitaireCell--filled' : 'mobilization-solitaireCell--empty'} ${canDrop ? 'mobilization-solitaireCell--dropTarget' : ''} ${isHandHoverTarget ? 'mobilization-solitaireCell--handHover' : ''} ${isRevealHighlight ? 'mobilization-solitaireCell--revealHighlight' : ''}`}
              >
                {card ? (
                  <div className="mobilization-solitaireCardInner">{renderCardFace(card, false, true)}</div>
                ) : (
                  <span className="mobilization-solitairePlaceholder">
                    {rowIdx === 1 ? '7' : rowIdx === 0 ? '↑' : '↓'}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
    );
  };

  return (
    <div className={`river-board river-board--players-${state.players.length} relative space-y-3 sm:space-y-4`}>
      {devJumpToolbar}
      <div ref={tableRef} className={`river-table river-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`river-seat ${layout.relativeIndex === 0 ? 'river-seat--self' : ''}`}
            style={{
              left: `${layout.seatLeft}%`,
              top: `${layout.seatTop}%`,
            }}
          >
            {renderSeatPill(layout, layout.relativeIndex === 0)}
          </div>
        ))}

        <div className={`river-center ${isHandZoomed ? 'river-center--zoom' : ''}`}>
          {state.phase === 'solitaire' || state.phase === 'solitaire-reveal' ? (
            renderSolitaireCenter()
          ) : (
            <div className="river-centerGrid">
              {seatLayouts.map((layout) => {
                const trickEntry = trickByRelativeSeat[layout.relativeIndex];
                const isWinningCard = trickWinnerRelativeSeat === layout.relativeIndex && !!state.trickWinner;
                const placement = getTrickSlotPlacement(state.players.length, layout.relativeIndex);
                const trickEntryOffset = (() => {
                  const deltaX = layout.seatLeft - 50;
                  const deltaY = layout.seatTop - 50;
                  const distance = Math.hypot(deltaX, deltaY);
                  if (distance < 0.001) return { x: 0, y: 12 };
                  return {
                    x: (deltaX / distance) * TRICK_EXIT_DISTANCE_PX,
                    y: (deltaY / distance) * TRICK_EXIT_DISTANCE_PX,
                  };
                })();
                return (
                  <div
                    key={`slot-${layout.player.id}`}
                    className={`river-slot ${trickEntry ? 'river-slot--filled' : 'river-slot--empty'}`}
                    style={{
                      gridColumn: placement.col,
                      gridRow: placement.row,
                      transform: `translate(${placement.dx}, ${placement.dy})`,
                    }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {trickEntry ? (
                        <motion.div
                          key={`${state.trickNumber}-${trickEntry.playerId}-${trickEntry.card.suit}-${trickEntry.card.rank}`}
                          initial={{ scale: 0.8, opacity: 0, x: trickEntryOffset.x, y: trickEntryOffset.y }}
                          animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
                          exit={{
                            x: trickExitOffset.x,
                            y: trickExitOffset.y,
                            opacity: 0,
                          }}
                          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                          className={`river-slotCard ${isWinningCard ? 'river-slotCard--winner' : ''}`}
                        >
                          <div className="river-slotCardInner">
                            {renderCardFace(trickEntry.card, false, true)}
                          </div>
                        </motion.div>
                      ) : (
                        <div key={`placeholder-${layout.relativeIndex}`} className="river-slotPlaceholder" />
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="river-headsUp" aria-live="polite">
        <p
          className={`river-headsUpText ${state.phase === 'round-end' || state.phase === 'round-depleted' ? 'river-headsUpText--roundEnd' : ''}`}
        >
          {headsUpContent ?? '\u00a0'}
        </p>
      </div>

      {myPlayer && (
        <div className="space-y-3">
          <div ref={handContainerRef} className={`river-hand ${isHandZoomed ? 'river-hand--zoom' : ''}`}>
            <div
              className="river-handSpread"
              style={{
                width: `${handLayout.spreadWidth}px`,
                height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                transition: 'width 0.16s ease',
              }}
            >
              {myPlayer.hand.map((card, i) => {
                const isTrick =
                  state.phase === 'playing'
                  && isMyTurn
                  && !state.trickWinner
                  && isValidMobilizationTrickPlay(state, myIndex, card);
                const isSol = state.phase === 'solitaire' && isMyTurn;
                const legalSol = isSol && myLegalSolitaire.some(lp => cardEquals(lp.card, card));
                const selected = selectedSolitaireCard && cardEquals(selectedSolitaireCard, card);
                const canPlay =
                  state.phase === 'playing' ? isTrick : state.phase === 'solitaire' ? legalSol : false;
                const isDisabled =
                  state.phase === 'playing'
                    ? !isTrick
                    : state.phase === 'solitaire'
                      ? !legalSol
                      : true;
                const isLast = i === myPlayer.hand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}`}
                    type="button"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => {
                      if (state.phase === 'playing') playTrickCard(card);
                      else if (state.phase === 'solitaire') solitaireSelectOrPlay(card);
                    }}
                    onMouseEnter={
                      state.phase === 'solitaire' && isMyTurn && legalSol
                        ? () => setSolitaireHandHoverCard(card)
                        : undefined
                    }
                    onMouseLeave={
                      state.phase === 'solitaire' && isMyTurn && legalSol
                        ? () => setSolitaireHandHoverCard(null)
                        : undefined
                    }
                    disabled={isDisabled}
                    className="river-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                    aria-label={`${state.phase === 'solitaire' ? 'Select or play' : 'Play'} ${rankDisplay(card.rank)} of ${card.suit}`}
                  >
                    <span
                      className={`river-handCardWrap ${canPlay ? 'river-handCardWrap--active' : ''} ${selected ? 'mobilization-handCard--selected' : ''}`}
                      style={{
                        width: `${handLayout.cardWidth}px`,
                        height: `${handLayout.cardHeight}px`,
                      }}
                    >
                      {renderCardFace(
                        card,
                        (state.phase === 'playing' || state.phase === 'solitaire' || state.phase === 'round-depleted')
                          && isDisabled,
                      )}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div className="river-actionRow river-actionRow--mobilization">
            {state.phase === 'solitaire' && isMyTurn ? (
              myLegalSolitaire.length === 0 ? (
                <div className="mobilization-solitaireActions">
                  <button type="button" onClick={solitairePass} className="mobilization-passBtn">
                    Pass (take the pig)
                  </button>
                </div>
              ) : (
                <div className="river-actionSpacer" aria-hidden="true">
                  &nbsp;
                </div>
              )
            ) : (
              <div className="river-actionSpacer" aria-hidden="true">
                &nbsp;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
