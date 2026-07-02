import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Card, GolfPlayer, GolfState, Suit } from './types';
import {
  canDiscardDrawn,
  canDrawFromStock,
  canSwapWithSlot,
  canTakeDiscard,
  rankDisplay,
} from './rules';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX } from '../../networking/playerColors';
import { AutoFitSeatName } from '../shared/AutoFitSeatName';
import { useDealerDealAnimation, type DealExtraTarget, type DealSeat } from '../shared/useDealerDealAnimation';
import { DealAnimationLayer } from '../shared/DealAnimationLayer';

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

interface GolfBoardProps {
  state: GolfState;
  myId: string;
  onAction: (action: unknown) => void;
}

interface SeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: GolfPlayer;
  seatLeft: number;
  seatTop: number;
}

interface ElementSize {
  width: number;
  height: number;
}

const SEAT_EDGE_GAP_PX = 8;

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount === 2) return { seatRadiusX: 30, seatRadiusY: 29 };
  if (playerCount >= 5) return { seatRadiusX: 40, seatRadiusY: 34 };
  if (playerCount === 4) return { seatRadiusX: 35, seatRadiusY: 27 };
  return { seatRadiusX: 34, seatRadiusY: 30 };
}

function PokerFlipCard({ card, faceDown, disabled = false }: { card?: Card | null; faceDown: boolean; disabled?: boolean }) {
  if (faceDown || !card) {
    return <div className="poker-card poker-cardBack poker-cardFlip--sm" />;
  }

  return (
    <div className="poker-cardFlip poker-cardFlip--sm">
      <motion.div
        className="poker-cardFlipInner"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.42, ease: 'easeInOut' }}
      >
        <div className="poker-cardFlipBack" aria-hidden="true" />
        <div className={`poker-cardFlipFront ${disabled ? 'poker-cardFlipFront--disabled' : ''}`}>
          <div className="poker-cardCorner">
            <span className={`poker-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
            <span className={`poker-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function GolfBoard({ state, myId, onAction }: GolfBoardProps) {
  const myIndex = state.players.findIndex(player => player.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const isMyTurn = myIndex >= 0 && state.currentPlayerIndex === myIndex && state.phase === 'playing';
  const boardRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatStackElement, setSeatStackElement] = useState<HTMLDivElement | null>(null);
  const [seatStackSize, setSeatStackSize] = useState<ElementSize>({ width: 0, height: 0 });

  const seatLayouts = useMemo<SeatLayout[]>(() => {
    const playerCount = state.players.length;
    if (playerCount === 0) return [];
    const fallbackRadii = getLayoutRadii(playerCount);
    const canUseMeasuredRadii =
      tableSize.width > 0 &&
      tableSize.height > 0 &&
      seatStackSize.width > 0 &&
      seatStackSize.height > 0;
    const radii = canUseMeasuredRadii
      ? (() => {
          const usableHalfWidth = tableSize.width / 2 - seatStackSize.width / 2 - SEAT_EDGE_GAP_PX;
          const usableHalfHeight = tableSize.height / 2 - seatStackSize.height / 2 - SEAT_EDGE_GAP_PX;
          return {
            seatRadiusX: Math.max(0, Math.min(50, (usableHalfWidth / tableSize.width) * 100)),
            seatRadiusY: Math.max(0, Math.min(50, ((usableHalfHeight / tableSize.height) * 100) * 0.9)),
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
  }, [state.players, anchorIndex, tableSize.width, tableSize.height, seatStackSize.width, seatStackSize.height]);

  const dealExtras = useMemo<DealExtraTarget[]>(() => {
    const extras: DealExtraTarget[] = [];
    for (const layout of seatLayouts) {
      for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
        if (layout.player.table[slotIndex]) {
          extras.push({
            id: `${layout.player.id}-slot-${slotIndex}`,
            seatLeft: layout.seatLeft,
            seatTop: layout.seatTop,
            faceUp: false,
          });
        }
      }
    }
    return extras;
  }, [seatLayouts]);

  const dealSeats = useMemo<DealSeat[]>(
    () =>
      seatLayouts.map(layout => ({
        playerId: layout.player.id,
        isSelf: layout.relativeIndex === 0,
        seatLeft: layout.seatLeft,
        seatTop: layout.seatTop,
        count: 0,
      })),
    [seatLayouts],
  );

  const deal = useDealerDealAnimation({
    boardRef,
    tableRef,
    dealKey: String(state.holeNumber),
    seats: dealSeats,
    extraTargets: dealExtras,
  });

  useEffect(() => {
    const tableEl = tableRef.current;
    if (!tableEl) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      setTableSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stackEl = seatStackElement;
    if (!stackEl) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      setSeatStackSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stackEl);
    return () => observer.disconnect();
  }, [seatStackElement]);

  const canUseActions = isMyTurn && !deal.isDealing;
  const discardTop = state.discard[state.discard.length - 1] ?? null;
  const showDrawStock = canUseActions && !state.pendingDraw && canDrawFromStock(state, myId);
  const showTakeDiscard = canUseActions && !state.pendingDraw && canTakeDiscard(state, myId);
  const showDiscardDrawn = canUseActions && canDiscardDrawn(state, myId);

  const renderCardFace = (card: Card, disabled = false) => (
    <div className={`river-card river-card--compact ${disabled ? 'river-card--disabled' : ''}`}>
      <div className="river-cardCorner">
        <span className={`river-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
        <span className={`river-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  const headsUpContent = useMemo((): ReactNode => {
    if (state.phase === 'game-over') {
      return state.winners.length > 1
        ? `Game over — tie between ${state.winners.length} players`
        : 'Game over';
    }
    if (state.phase === 'hole-end') {
      return `Hole ${state.holeNumber} complete · ${state.holeSummary}`;
    }
    const current = state.players[state.currentPlayerIndex];
    if (!current) return null;
    if (state.pendingDraw && current.id === myId) {
      if (state.pendingDrawSource === 'stock') {
        return 'Swap the drawn card with a table card, or discard it';
      }
      return 'Swap the drawn card with one of your table cards';
    }
    if (current.id === myId) {
      return 'Draw from the stock or take the top discard';
    }
    return `${current.name} is playing`;
  }, [state, myId]);

  const renderSeatPill = (layout: SeatLayout) => {
    const player = layout.player;
    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === player.id && state.phase === 'playing';
    const isMe = player.id === myId;
    const seatPillStateClass = isCurrentTurn
      ? isMe
        ? 'river-seatPill--activeSelf'
        : 'river-seatPill--activeOther'
      : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';

    return (
      <div
        className={`river-seatPill golf-seatPill ${seatPillStateClass} ${isMe ? 'river-seatPill--me' : ''}`}
      >
        <div className="river-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <AutoFitSeatName
            name={`${isMe ? 'You' : player.name} (${player.totalScore})`}
            textColor={seatTextColor}
            nameClassName="river-seatName"
          />
        </div>
      </div>
    );
  };

  const renderTableSlot = (layout: SeatLayout, slotIndex: number) => {
    const slot = layout.player.table[slotIndex];
    const slotId = `${layout.player.id}-slot-${slotIndex}`;
    const revealed = slot ? deal.isExtraRevealed(slotId) : !deal.isDealing;
    const isMe = layout.player.id === myId;
    const showFace = slot?.faceUp ?? false;
    const canSwap =
      canUseActions &&
      isMe &&
      canSwapWithSlot(state, myId, slotIndex);

    if (!revealed || !slot) {
      return <div key={slotId} className="golf-tableSlot" aria-hidden="true" />;
    }

    return (
      <div key={slotId} className="golf-tableSlot">
        <button
          type="button"
          className="golf-slotButton"
          disabled={!canSwap}
          onClick={() => onAction({ type: 'swap-with-slot', slotIndex })}
          aria-label={`Table card ${slotIndex + 1}`}
        >
          {showFace ? (
            renderCardFace(slot.card, !canSwap)
          ) : (
            <PokerFlipCard card={slot.card} faceDown disabled={!canSwap} />
          )}
        </button>
      </div>
    );
  };

  return (
    <div ref={boardRef} className={`golf-board river-board river-board--players-${state.players.length} relative`}>
      <DealAnimationLayer flights={deal.flights} dealCenter={deal.dealCenter} remaining={deal.flights.length} />

      <div ref={tableRef} className={`river-table river-table--players-${state.players.length}`}>
        {seatLayouts.map(layout => (
          <div
            key={`seat-${layout.player.id}`}
            className={`river-seat ${layout.relativeIndex === 0 ? 'river-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            <div
              ref={layout.relativeIndex === 0 ? setSeatStackElement : undefined}
              className="golf-seatStack"
            >
              {renderSeatPill(layout)}
              <div className="golf-cardGrid">
                {Array.from({ length: 6 }, (_, slotIndex) => renderTableSlot(layout, slotIndex))}
              </div>
            </div>
          </div>
        ))}

        <div className="golf-stockArea">
          <button
            type="button"
            className="golf-stockPile"
            disabled={!showDrawStock}
            onClick={() => onAction({ type: 'draw-from-stock' })}
            aria-label={`Draw from stock, ${state.stock.length} cards remaining`}
          >
            <div className="golf-stockStack">
              <div className="twelve-cardBackFace" />
            </div>
            <span className="golf-stockCount">{state.stock.length}</span>
          </button>

          <button
            type="button"
            className="golf-discardPile"
            disabled={!showTakeDiscard}
            onClick={() => onAction({ type: 'take-discard' })}
            aria-label="Take top discard"
          >
            {discardTop ? renderCardFace(discardTop, !showTakeDiscard) : <div className="golf-tableSlot" aria-hidden="true" />}
          </button>

          {state.pendingDraw && isMyTurn && (
            <div className="golf-pendingDraw" aria-label="Drawn card">
              {renderCardFace(state.pendingDraw)}
            </div>
          )}
        </div>
      </div>

      <div className="golf-statusBlock">
        <div className="river-headsUp" aria-live="polite">
          <p
            className={`river-headsUpText ${state.phase === 'hole-end' || state.phase === 'game-over' ? 'river-headsUpText--roundEnd' : ''}`}
          >
            {headsUpContent ?? '\u00a0'}
          </p>
        </div>
        <div className="river-actionRow golf-actionRow">
          {showDrawStock && (
            <button type="button" className="golf-actionButton" onClick={() => onAction({ type: 'draw-from-stock' })}>
              Draw
            </button>
          )}
          {showTakeDiscard && (
            <button type="button" className="golf-actionButton" onClick={() => onAction({ type: 'take-discard' })}>
              Take discard
            </button>
          )}
          {showDiscardDrawn && (
            <button type="button" className="golf-actionButton" onClick={() => onAction({ type: 'discard-drawn' })}>
              Discard drawn
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
