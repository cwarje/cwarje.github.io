import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, CrossCribPlayer, CrossCribState, Suit } from './types';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX } from '../../networking/playerColors';

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

interface CrossCribBoardProps {
  state: unknown;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
}

interface SeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: CrossCribPlayer;
  seatLeft: number;
  seatTop: number;
}

interface ElementSize {
  width: number;
  height: number;
}

const RIVER_SEAT_EDGE_GAP_PX = 8;
const CARD_ENTRY_DISTANCE_PX = 80;

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount === 2) return { seatRadiusX: 30, seatRadiusY: 29 };
  if (playerCount === 4) return { seatRadiusX: 35, seatRadiusY: 27 };
  return { seatRadiusX: 34, seatRadiusY: 30 };
}

export default function CrossCribBoard({
  state,
  myId,
  onAction,
  isHandZoomed = false,
}: CrossCribBoardProps) {
  const s = state as CrossCribState;
  const myIndex = s.players.findIndex(p => p.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = myIndex >= 0 ? s.players[myIndex] : null;
  const isMyTurn = myIndex >= 0 && s.currentPlayerIndex === myIndex;

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLDivElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });

  const playerCount = s.players.length;
  const isTeam = playerCount === 4;
  const myTeamScoresColumns =
    playerCount === 2 ? myIndex === 1 : myIndex === 1 || myIndex === 3;

  const seatLayouts = useMemo<SeatLayout[]>(() => {
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
            seatRadiusY: Math.max(0, Math.min(50, ((usableHalfHeight / tableSize.height) * 100) * 0.9)),
          };
        })()
      : fallbackRadii;

    return Array.from({ length: playerCount }, (_, relativeIndex) => {
      const playerIndex = (anchorIndex + relativeIndex) % playerCount;
      const player = s.players[playerIndex];
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
  }, [s.players, anchorIndex, playerCount, tableSize.width, tableSize.height, seatPillSize.width, seatPillSize.height]);

  const playerIdToSeatLayout = useMemo(() => {
    const map = new Map<string, SeatLayout>();
    for (const layout of seatLayouts) {
      map.set(layout.player.id, layout);
    }
    return map;
  }, [seatLayouts]);

  const getEntryOffset = (playerId: string) => {
    const layout = playerIdToSeatLayout.get(playerId);
    if (!layout) return { x: 0, y: 12 };
    const deltaX = layout.seatLeft - 50;
    const deltaY = layout.seatTop - 50;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.001) return { x: 0, y: 12 };
    return {
      x: (deltaX / distance) * CARD_ENTRY_DISTANCE_PX,
      y: (deltaY / distance) * CARD_ENTRY_DISTANCE_PX,
    };
  };

  useEffect(() => {
    if (s.phase !== 'playing' || !isMyTurn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear selection when turn/phase changes
      setSelectedCard(null);
    }
  }, [s.phase, isMyTurn]);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const updateSize = () => setTableSize({ width: element.clientWidth, height: element.clientHeight });
    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(element);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!seatPillElement) return;
    const updateSize = () => {
      setSeatPillSize({ width: seatPillElement.clientWidth, height: seatPillElement.clientHeight });
    };
    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(seatPillElement);
    return () => ro.disconnect();
  }, [seatPillElement]);

  useEffect(() => {
    const element = handContainerRef.current;
    if (!element) return;
    const updateSize = () => setHandWidth(element.clientWidth);
    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(element);
    return () => ro.disconnect();
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

  const placeCard = (row: number, col: number) => {
    if (s.phase !== 'playing' || !isMyTurn || !selectedCard || myIndex < 0) return;
    if (row === 2 && col === 2) return;
    if (s.grid[row][col]) return;
    const hasCard = myPlayer?.hand.some(
      c => c.suit === selectedCard.suit && c.rank === selectedCard.rank
    );
    if (!hasCard) return;
    onAction({ type: 'place-card', card: selectedCard, row, col });
    setSelectedCard(null);
  };

  const renderSeatPill = (layout: SeatLayout, shouldMeasure = false) => {
    const player = layout.player;
    const isCurrentTurn = s.players[s.currentPlayerIndex]?.id === player.id;
    const isMe = player.id === myId;
    const seatPillStateClass = isCurrentTurn
      ? isMe
        ? 'river-seatPill--activeSelf'
        : 'river-seatPill--activeOther'
      : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const pillTopStyle = isTeam
      ? (() => {
          const teammateIndex = (layout.playerIndex + 2) % 4;
          const leftIndex = Math.min(layout.playerIndex, teammateIndex);
          const rightIndex = Math.max(layout.playerIndex, teammateIndex);
          const leftColor = PLAYER_COLOR_HEX[s.players[leftIndex]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
          const rightColor = PLAYER_COLOR_HEX[s.players[rightIndex]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
          return {
            background: `linear-gradient(to right, ${leftColor} 50%, ${rightColor} 50%)`,
            color: seatTextColor,
          };
        })()
      : { backgroundColor: seatColor, color: seatTextColor };

    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`river-seatPill ${seatPillStateClass} ${isMe ? 'river-seatPill--me' : ''}`}
      >
        <div className="river-seatPillTop" style={pillTopStyle}>
          <span className="river-seatName">
            {isMe ? 'You' : player.name} ({player.totalScore})
          </span>
        </div>
      </div>
    );
  };

  const headsUpContent = useMemo((): ReactNode => {
    if (s.phase === 'round-end') {
      return s.roundSummary;
    }
    if (s.phase === 'playing') {
      const current = s.players[s.currentPlayerIndex];
      if (!current) return '\u00a0';
      const isMe = current.id === myId;
      return isMe ? 'Your turn — select a card, then click an empty space' : `${current.name}'s turn`;
    }
    return '\u00a0';
  }, [s.phase, s.currentPlayerIndex, s.players, s.roundSummary, myId]);

  if (s.phase === 'game-over') {
    const ranked = [...s.players].sort((a, b) => b.totalScore - a.totalScore);
    if (isTeam) {
      const team0Score = s.players[0]?.totalScore ?? 0;
      const team1Score = s.players[1]?.totalScore ?? 0;
      const team0 = `${s.players[0]?.name ?? ''} & ${s.players[2]?.name ?? ''}`;
      const team1 = `${s.players[1]?.name ?? ''} & ${s.players[3]?.name ?? ''}`;
      const teamRows = team0Score >= team1Score
        ? [
            { name: team0, score: team0Score },
            { name: team1, score: team1Score },
          ]
        : [
            { name: team1, score: team1Score },
            { name: team0, score: team0Score },
          ];
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="river-board h-full flex flex-col items-center justify-center space-y-6 text-center"
        >
          <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
          <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
          <div className="space-y-3 w-full max-w-2xl">
            {teamRows.map((t, i) => (
              <div key={i} className="river-resultRow">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">#{i + 1}</span>
                  <span className="font-semibold">{t.name}</span>
                </div>
                <span className="text-xl font-bold">{t.score} pts</span>
              </div>
            ))}
          </div>
        </motion.div>
      );
    }
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="river-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <div className="space-y-3 w-full max-w-2xl">
          {ranked.map((player, i) => (
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

  const scoresAbove = myTeamScoresColumns ? s.columnScores : s.rowScores;
  const scoresRight = myTeamScoresColumns ? s.rowScores : s.columnScores;

  return (
    <div className={`river-board river-board--players-${playerCount} space-y-3 sm:space-y-4`}>
      <div ref={tableRef} className={`river-table river-table--players-${playerCount}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`river-seat ${layout.relativeIndex === 0 ? 'river-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            {renderSeatPill(layout, layout.relativeIndex === 0)}
          </div>
        ))}

        <div className={`crosscrib-center ${isHandZoomed ? 'river-center--zoom' : ''}`}>
          <div className="crosscrib-gridWrapper">
            <div className="crosscrib-colScores">
              {scoresAbove.map((score, i) => (
                <div key={i} className="crosscrib-scoreCell">{score}</div>
              ))}
            </div>
            <div className="crosscrib-gridRow">
              <div className="crosscrib-grid">
                {[0, 1, 2, 3, 4].map((row) =>
                  [0, 1, 2, 3, 4].map((col) => {
                    const cell = s.grid[row][col];
                    const isCenter = row === 2 && col === 2;
                    const isEmpty = !cell;
                    const canPlace =
                      s.phase === 'playing' &&
                      isMyTurn &&
                      selectedCard &&
                      !isCenter &&
                      isEmpty;

                    return (
                      <div
                        key={`${row}-${col}`}
                        className={`crosscrib-cell ${isEmpty && !isCenter ? 'crosscrib-cell--empty' : ''} ${canPlace ? 'crosscrib-cell--placeable' : ''}`}
                        onClick={() => canPlace && placeCard(row, col)}
                        role={canPlace ? 'button' : undefined}
                        aria-label={canPlace ? `Place card at row ${row + 1} column ${col + 1}` : undefined}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {isCenter && s.starterCard ? (
                            <div key="starter" className="crosscrib-cellCard crosscrib-cellCard--starter">
                              {renderCardFace(s.starterCard, false, true)}
                            </div>
                          ) : cell ? (
                            <motion.div
                              key={`${cell.playerId}-${cell.card.suit}-${cell.card.rank}`}
                              initial={{
                                scale: 0.8,
                                opacity: 0,
                                x: getEntryOffset(cell.playerId).x,
                                y: getEntryOffset(cell.playerId).y,
                              }}
                              animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="crosscrib-cellCard"
                            >
                              {renderCardFace(cell.card, false, true)}
                            </motion.div>
                          ) : (
                            <div key="empty" className="crosscrib-slotPlaceholder" />
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="crosscrib-rowScores">
                {scoresRight.map((score, i) => (
                  <div key={i} className="crosscrib-scoreCell">{score}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="river-headsUp" aria-live="polite">
        <p className={`river-headsUpText ${s.phase === 'round-end' ? 'river-headsUpText--roundEnd' : ''}`}>
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
                const isSelected =
                  selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;
                const canSelect =
                  s.phase === 'playing' && isMyTurn;
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
                      if (!canSelect) return;
                      setSelectedCard(isSelected ? null : card);
                    }}
                    disabled={!canSelect}
                    className="river-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                    aria-label={`Select ${rankDisplay(card.rank)} of ${card.suit}`}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={`river-handCardWrap ${canSelect ? 'river-handCardWrap--active' : ''} ${isSelected ? 'crosscrib-handCard--selected' : ''}`}
                      style={{
                        width: `${handLayout.cardWidth}px`,
                        height: `${handLayout.cardHeight}px`,
                      }}
                    >
                      {renderCardFace(card, !canSelect)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
