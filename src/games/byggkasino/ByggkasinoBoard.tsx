import type { ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BYGG_TABLE_COLUMNS,
  type Card,
  type Suit,
  type ByggkasinoState,
  type TableItem,
  buildMultiplicityLabel,
  cardEquals,
  rankDisplay,
  canParticipateInBuildOrSum,
  countOccupiedTableSlots,
  isFiveOfSpadesSweepCard,
  occupiedTableSlotIndices,
} from './types';
import { countRemnantCardsOnTable, getCaptureOutcomeFromPreview } from './logic';
import {
  isValidCapture,
  resolveBuildDeclaredValue,
  resolveExtendBuildDeclaredValue,
  resolveHandAssistedGroupDeclaredValue,
  resolveTableGroupWithBuildsDeclaredValue,
} from './rules';
import {
  DARK_PLAYER_COLORS,
  DEFAULT_PLAYER_COLOR,
  PLAYER_COLOR_HEX,
  getPlayerHudTextColor,
} from '../../networking/playerColors';

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

interface ByggkasinoBoardProps {
  state: unknown;
  myId: string;
  onAction: (action: unknown) => void;
  isHost?: boolean;
  isHandZoomed?: boolean;
}

interface ByggSeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: ByggkasinoState['players'][number];
  seatLeft: number;
  seatTop: number;
}

interface ElementSize {
  width: number;
  height: number;
}

const BYGG_SEAT_EDGE_GAP_PX = 8;

function getByggLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount === 4) return { seatRadiusX: 39, seatRadiusY: 36 };
  if (playerCount === 3) return { seatRadiusX: 36, seatRadiusY: 34 };
  return { seatRadiusX: 32, seatRadiusY: 33 };
}

function headsUpCardSpan(card: Card): ReactNode {
  return (
    <span className={SUIT_COLORS[card.suit]}>
      {rankDisplay(card.rank)}
      {SUIT_SYMBOLS[card.suit]}
    </span>
  );
}

function headsUpCardList(cards: Card[]): ReactNode {
  return cards.map((card, i) => (
    <Fragment key={`${i}-${card.suit}-${card.rank}`}>
      {i > 0 ? ', ' : null}
      {headsUpCardSpan(card)}
    </Fragment>
  ));
}

function captureHudMessage(
  actor: ByggkasinoState['players'][number],
  myId: string,
  capturedCards: Card[],
  sweep: boolean
): ReactNode {
  const displayName = actor.id === myId ? 'You' : actor.name;
  const nameEl = <span style={{ color: getPlayerHudTextColor(actor.color) }}>{displayName}</span>;
  let suffix = '';
  if (sweep) suffix += ' (clean table)';
  const playedCard = capturedCards[0];
  const fromTable = capturedCards.slice(1);
  return (
    <>
      {nameEl}
      {fromTable.length === 0 ? (
        <> took {headsUpCardList(capturedCards)}</>
      ) : (
        <>
          : {headsUpCardSpan(playedCard)} took {headsUpCardList(fromTable)}
        </>
      )}
      {suffix}
    </>
  );
}

function CardFace({ card, small = false }: { card: Card; small?: boolean }) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const colorClass = SUIT_COLORS[card.suit];
  const label = rankDisplay(card.rank);
  return (
    <div className={`byggkasino-cardFace ${small ? 'byggkasino-cardFace--small' : ''}`}>
      <span className={`byggkasino-cardRank ${colorClass}`}>{label}</span>
      <span className={`byggkasino-cardSuit ${colorClass}`}>{symbol}</span>
    </div>
  );
}

function TableCard({
  card,
  selected,
  onClick,
  disabled,
  previewCard,
}: {
  card: Card;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
  previewCard: Card | null;
}) {
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      whileHover={!disabled ? { y: -4 } : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`byggkasino-tableCard ${selected ? 'byggkasino-tableCard--selected' : ''} ${disabled ? 'byggkasino-tableCard--disabled' : ''}`}
    >
      <div className="byggkasino-card">
        <CardFace card={card} />
      </div>
      {previewCard && (
        <div className="byggkasino-capturePreviewCard">
          <div className="byggkasino-card">
            <CardFace card={previewCard} />
          </div>
        </div>
      )}
    </motion.button>
  );
}

function BuildPile({
  build,
  selected,
  onClick,
  disabled,
  previewCard,
}: {
  build: TableItem & { kind: 'build' };
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
  previewCard: Card | null;
}) {
  const topCards = build.build.cards.slice(-3);
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      whileHover={!disabled ? { y: -4 } : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`byggkasino-buildPile ${selected ? 'byggkasino-buildPile--selected' : ''} ${disabled ? 'byggkasino-buildPile--disabled' : ''}`}
    >
      <div className="byggkasino-buildPileStack">
        {topCards.map((card, i) => (
          <div
            key={`${card.suit}-${card.rank}-${i}`}
            className="byggkasino-buildPileLayer"
            style={{ transform: `translate(${i * 5}px, ${-i * 4}px)` }}
          >
            <div className="byggkasino-card">
              <CardFace card={card} />
            </div>
          </div>
        ))}
      </div>
      <span className="byggkasino-buildPileValueBadge">{buildMultiplicityLabel(build.build)}</span>
      {previewCard && (
        <div className="byggkasino-capturePreviewCard">
          <div className="byggkasino-card">
            <CardFace card={previewCard} />
          </div>
        </div>
      )}
    </motion.button>
  );
}

export default function ByggkasinoBoard({
  state,
  myId,
  onAction,
  isHost = false,
  isHandZoomed = false,
}: ByggkasinoBoardProps) {
  const s = state as ByggkasinoState;
  const myIndex = s.players.findIndex(p => p.id === myId);
  const myPlayer = myIndex >= 0 ? s.players[myIndex] : null;
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const isMyTurn = myIndex >= 0 && s.currentPlayerIndex === myIndex && s.phase === 'playing';
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLDivElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [handWidth, setHandWidth] = useState(360);

  const [selectedHandCard, setSelectedHandCard] = useState<Card | null>(null);
  const [selectedTableIndices, setSelectedTableIndices] = useState<number[]>([]);

  const resetSelection = useCallback(() => {
    setSelectedHandCard(null);
    setSelectedTableIndices([]);
  }, []);

  const handleHandCardClick = useCallback((card: Card) => {
    if (!isMyTurn) return;
    setSelectedHandCard(prev => {
      if (prev && cardEquals(prev, card)) {
        setSelectedTableIndices([]);
        return null;
      }
      setSelectedTableIndices([]);
      return card;
    });
  }, [isMyTurn]);

  const handleTableItemClick = useCallback(
    (index: number) => {
      if (!isMyTurn || s.pendingCapturePreview) return;
      const item = s.tableSlots[index];
      if (selectedHandCard) {
        setSelectedTableIndices(prev => {
          if (prev.includes(index)) return prev.filter(i => i !== index);
          return [...prev, index];
        });
        return;
      }
      if (!item) return;
      setSelectedTableIndices(prev => {
        if (prev.includes(index)) return prev.filter(i => i !== index);
        return [...prev, index];
      });
    },
    [isMyTurn, selectedHandCard, s.pendingCapturePreview, s.tableSlots]
  );

  const canCapture = useMemo(() => {
    if (!selectedHandCard) return false;
    if (isFiveOfSpadesSweepCard(selectedHandCard)) return true;
    if (selectedTableIndices.length === 0) return false;
    return isValidCapture(selectedHandCard, s.tableSlots, selectedTableIndices);
  }, [selectedHandCard, selectedTableIndices, s.tableSlots]);

  const computedTableGroupValue = useMemo(() => {
    if (selectedTableIndices.length < 2 || !myPlayer) return 0;
    return resolveTableGroupWithBuildsDeclaredValue(s.tableSlots, selectedTableIndices, myPlayer.hand);
  }, [selectedTableIndices, s.tableSlots, myPlayer]);

  const computedHandAssistedGroupValue = useMemo(() => {
    if (!selectedHandCard || selectedTableIndices.length !== 1 || !myPlayer) return 0;
    return resolveHandAssistedGroupDeclaredValue(
      selectedHandCard,
      s.tableSlots,
      selectedTableIndices,
      myPlayer.hand
    );
  }, [selectedHandCard, selectedTableIndices, s.tableSlots, myPlayer]);

  const computedGroupValue = selectedHandCard ? computedHandAssistedGroupValue : computedTableGroupValue;

  const canGroup =
    isMyTurn &&
    (selectedHandCard ? selectedTableIndices.length === 1 : selectedTableIndices.length >= 2) &&
    computedGroupValue > 0;

  const selectedTableCardsForBuild = useMemo((): Card[] => {
    if (selectedTableIndices.length === 0) return [];
    return selectedTableIndices
      .map(i => {
        const item = s.tableSlots[i];
        return item?.kind === 'card' ? item.card : null;
      })
      .filter((c): c is Card => c != null);
  }, [selectedTableIndices, s.tableSlots]);

  const canBuild = useMemo(() => {
    if (!selectedHandCard || !canParticipateInBuildOrSum(selectedHandCard)) return false;
    if (isFiveOfSpadesSweepCard(selectedHandCard) && countOccupiedTableSlots(s.tableSlots) > 0) return false;
    if (selectedTableIndices.length === 0) return false;
    if (selectedTableCardsForBuild.length === 0) return false;
    const d = resolveBuildDeclaredValue(
      selectedHandCard,
      selectedTableCardsForBuild,
      myPlayer?.hand ?? [],
      selectedHandCard
    );
    if (d <= 0) return false;
    const selectedBuilds = selectedTableIndices
      .map(i => s.tableSlots[i])
      .filter(item => item?.kind === 'build');
    if (selectedBuilds.some(item => item?.kind === 'build' && item.build.value !== d)) return false;
    return true;
  }, [selectedHandCard, selectedTableIndices, selectedTableCardsForBuild, s.tableSlots, myPlayer]);

  const computedBuildValue = useMemo(() => {
    if (!selectedHandCard || selectedTableIndices.length === 0 || selectedTableCardsForBuild.length === 0) return 0;
    const d = resolveBuildDeclaredValue(
      selectedHandCard,
      selectedTableCardsForBuild,
      myPlayer?.hand ?? [],
      selectedHandCard
    );
    if (d <= 0) return 0;
    const selectedBuilds = selectedTableIndices
      .map(i => s.tableSlots[i])
      .filter(item => item?.kind === 'build');
    if (selectedBuilds.some(item => item?.kind === 'build' && item.build.value !== d)) return 0;
    return d;
  }, [selectedHandCard, selectedTableIndices, selectedTableCardsForBuild, s.tableSlots, myPlayer]);

  const computedBuildLabel = useMemo(() => {
    if (computedBuildValue <= 0) return '0';
    const mergedGroupCount = selectedTableIndices.reduce((sum, i) => {
      const item = s.tableSlots[i];
      return sum + (item?.kind === 'build' ? item.build.groupCount : 0);
    }, 0);
    const totalGroupCount = mergedGroupCount + 1;
    if (totalGroupCount === 2) return `D${computedBuildValue}`;
    if (totalGroupCount === 3) return `T${computedBuildValue}`;
    if (totalGroupCount > 3) return `${totalGroupCount}x${computedBuildValue}`;
    return String(computedBuildValue);
  }, [computedBuildValue, selectedTableIndices, s.tableSlots]);

  const canExtendBuild = useMemo(() => {
    if (!selectedHandCard || !canParticipateInBuildOrSum(selectedHandCard)) return false;
    if (isFiveOfSpadesSweepCard(selectedHandCard) && countOccupiedTableSlots(s.tableSlots) > 0) return false;
    if (selectedTableIndices.length !== 1) return false;
    const item = s.tableSlots[selectedTableIndices[0]];
    if (!item || item.kind !== 'build') return false;
    const newVal = resolveExtendBuildDeclaredValue(
      selectedHandCard,
      item.build.value,
      myPlayer?.hand ?? [],
      selectedHandCard
    );
    return newVal > 0;
  }, [selectedHandCard, selectedTableIndices, s.tableSlots, myPlayer]);

  const canTrail = useMemo(() => {
    if (!selectedHandCard) return false;
    const hasOwnBuild = s.tableSlots.some(
      it => it?.kind === 'build' && it.build.ownerId === myId
    );
    if (hasOwnBuild) {
      return isFiveOfSpadesSweepCard(selectedHandCard) && countOccupiedTableSlots(s.tableSlots) > 0;
    }
    return true;
  }, [selectedHandCard, s.tableSlots, myId]);

  const handleCapture = useCallback(() => {
    if (!selectedHandCard) return;
    let capturedSlotIndices = selectedTableIndices;
    if (isFiveOfSpadesSweepCard(selectedHandCard) && countOccupiedTableSlots(s.tableSlots) > 0) {
      capturedSlotIndices = occupiedTableSlotIndices(s.tableSlots);
    }
    if (capturedSlotIndices.length === 0 && !isFiveOfSpadesSweepCard(selectedHandCard)) return;
    onAction({
      type: 'capture-preview',
      playedCard: selectedHandCard,
      capturedSlotIndices,
    });
    resetSelection();
  }, [selectedHandCard, selectedTableIndices, s.tableSlots, onAction, resetSelection]);

  const handleGroup = useCallback(() => {
    if (!canGroup || computedGroupValue <= 0) return;
    const isHandAssistedGroup =
      !!selectedHandCard && selectedTableIndices.length === 1 && computedHandAssistedGroupValue > 0;
    onAction({
      type: 'group-table',
      tableCardIndices: [...selectedTableIndices].sort((a, b) => a - b),
      declaredValue: computedGroupValue,
      ...(isHandAssistedGroup ? { playedCard: selectedHandCard } : {}),
    });
    if (isHandAssistedGroup) {
      resetSelection();
      return;
    }
    setSelectedTableIndices([]);
  }, [
    canGroup,
    computedGroupValue,
    selectedHandCard,
    selectedTableIndices,
    computedHandAssistedGroupValue,
    onAction,
    resetSelection,
  ]);

  const handleBuild = useCallback(() => {
    if (!selectedHandCard) return;
    onAction({
      type: 'build',
      playedCard: selectedHandCard,
      tableCardIndices: selectedTableIndices,
      declaredValue: computedBuildValue,
    });
    resetSelection();
  }, [selectedHandCard, selectedTableIndices, computedBuildValue, onAction, resetSelection]);

  const handleExtendBuild = useCallback(() => {
    if (!selectedHandCard || selectedTableIndices.length !== 1) return;
    const item = s.tableSlots[selectedTableIndices[0]];
    if (!item || item.kind !== 'build') return;
    const newVal = resolveExtendBuildDeclaredValue(
      selectedHandCard,
      item.build.value,
      myPlayer?.hand ?? [],
      selectedHandCard
    );
    if (newVal <= 0) return;
    onAction({
      type: 'extend-build',
      playedCard: selectedHandCard,
      buildIndex: selectedTableIndices[0],
      declaredValue: newVal,
    });
    resetSelection();
  }, [selectedHandCard, selectedTableIndices, s.tableSlots, myPlayer, onAction, resetSelection]);

  const handleTrailToSlot = useCallback((slotIndex: number) => {
    if (!selectedHandCard) return;
    onAction({ type: 'trail', playedCard: selectedHandCard, targetSlotIndex: slotIndex });
    resetSelection();
  }, [selectedHandCard, onAction, resetSelection]);

  const handleStartNextRound = useCallback(() => {
    onAction({ type: 'start-next-round' });
  }, [onAction]);

  useEffect(() => {
    if (!s.pendingCapturePreview) return;
    resetSelection();
  }, [s.pendingCapturePreview, resetSelection]);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const updateSize = () => setTableSize({ width: element.clientWidth, height: element.clientHeight });
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [s.phase]);

  useEffect(() => {
    if (!seatPillElement) return;
    const updateSize = () => setSeatPillSize({ width: seatPillElement.clientWidth, height: seatPillElement.clientHeight });
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(seatPillElement);
    return () => resizeObserver.disconnect();
  }, [seatPillElement]);

  useEffect(() => {
    const element = handContainerRef.current;
    if (!element) return;
    const updateSize = () => setHandWidth(element.clientWidth);
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [s.phase]);

  const seatLayouts = useMemo<ByggSeatLayout[]>(() => {
    const playerCount = s.players.length;
    if (playerCount === 0) return [];
    const fallbackRadii = getByggLayoutRadii(playerCount);
    const canUseMeasuredRadii =
      tableSize.width > 0 &&
      tableSize.height > 0 &&
      seatPillSize.width > 0 &&
      seatPillSize.height > 0;
    const radii = canUseMeasuredRadii
      ? (() => {
          const usableHalfWidth = tableSize.width / 2 - seatPillSize.width / 2 - BYGG_SEAT_EDGE_GAP_PX;
          const usableHalfHeight = tableSize.height / 2 - seatPillSize.height / 2 - BYGG_SEAT_EDGE_GAP_PX;
          return {
            seatRadiusX: Math.max(0, Math.min(50, (usableHalfWidth / tableSize.width) * 100)),
            seatRadiusY: Math.max(0, Math.min(50, (usableHalfHeight / tableSize.height) * 100)),
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
  }, [s.players, anchorIndex, tableSize.width, tableSize.height, seatPillSize.width, seatPillSize.height]);

  const handLayout = useMemo(() => {
    const cardCount = myPlayer?.hand.length ?? 0;
    const available = Math.max(handWidth - 8, 220);
    const maxCardWidth = 84;
    const cardWidth = Math.max(58, Math.min(available * 0.2, maxCardWidth));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.58);
    const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
    const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
    return {
      cardWidth,
      cardHeight,
      step,
      spreadWidth,
      selectedLift: 14,
    };
  }, [handWidth, myPlayer?.hand.length]);

  const currentPlayer = s.players[s.currentPlayerIndex];
  const hasEmptyTableSlot = s.tableSlots.some(slot => slot == null);
  const canTrailToPlaceholder =
    isMyTurn &&
    !!selectedHandCard &&
    canTrail &&
    selectedTableIndices.length === 0 &&
    !s.pendingCapturePreview;
  const shouldShowVirtualTrailRow = canTrailToPlaceholder && !hasEmptyTableSlot;
  const renderedTableRows = s.tableRows + (shouldShowVirtualTrailRow ? 1 : 0);
  const renderedTableSlotCount = renderedTableRows * BYGG_TABLE_COLUMNS;

  const headsUpContent = useMemo((): ReactNode => {
    if (s.phase === 'announcement' && s.actionAnnouncement) {
      const ann = s.actionAnnouncement;
      const actor = s.players.find(p => p.id === ann.playerId);
      if (!actor) return null;
      if (ann.kind === 'capture') {
        return captureHudMessage(actor, myId, ann.capturedCards, ann.sweep);
      }
      const displayName = actor.id === myId ? 'You' : actor.name;
      const nameEl = <span style={{ color: getPlayerHudTextColor(actor.color) }}>{displayName}</span>;
      if (ann.kind === 'build') {
        return (
          <>
            {nameEl}
            {` built ${ann.declaredValue} from `}
            {headsUpCardList(ann.buildCards)}
          </>
        );
      }
      if (ann.kind === 'extend-build') {
        return (
          <>
            {nameEl}
            {` extended a build to ${ann.declaredValue}`}
          </>
        );
      }
      if (ann.kind === 'trail') {
        return (
          <>
            {nameEl}
            {' played '}
            {headsUpCardSpan(ann.playedCard)}
          </>
        );
      }
      return null;
    }

    if (s.phase === 'table-remnant') {
      const remnantCount = countRemnantCardsOnTable(s.tableSlots);
      if (s.lastCapturerIndex >= 0) {
        const actor = s.players[s.lastCapturerIndex];
        if (!actor) return null;
        const displayName = actor.id === myId ? 'You' : actor.name;
        const nameEl = <span style={{ color: getPlayerHudTextColor(actor.color) }}>{displayName}</span>;
        const cardWord = remnantCount === 1 ? 'card' : 'cards';
        return (
          <>
            {nameEl}
            {remnantCount > 0
              ? ` made the last capture and takes the ${remnantCount} remaining ${cardWord} on the table`
              : ' made the last capture. The table is empty'}
          </>
        );
      }
      if (remnantCount > 0) {
        return 'No player took this round. Remaining table cards are not awarded.';
      }
      return 'No player took this round. The table is empty.';
    }

    if (s.pendingCapturePreview) {
      const previewOutcome = getCaptureOutcomeFromPreview(s, s.pendingCapturePreview);
      if (previewOutcome) {
        const actor = s.players.find(p => p.id === s.pendingCapturePreview!.playerId);
        if (actor) {
          return captureHudMessage(actor, myId, previewOutcome.capturedCards, previewOutcome.sweep);
        }
      }
    }

    if (!currentPlayer) return null;
    if (isMyTurn) {
      if (selectedHandCard) {
        return (
          <>
            Your turn · {headsUpCardSpan(selectedHandCard)} selected
          </>
        );
      }
      return 'Your turn · You must play a card';
    }
    return (
      <>
        <span style={{ color: getPlayerHudTextColor(currentPlayer.color) }}>{currentPlayer.name}</span>
        {"'s turn"}
      </>
    );
  }, [
    s.phase,
    s.actionAnnouncement,
    s.players,
    s.pendingCapturePreview,
    s.tableSlots,
    myId,
    currentPlayer,
    isMyTurn,
    selectedHandCard,
  ]);

  const renderSeatPill = (layout: ByggSeatLayout, shouldMeasure = false) => {
    const player = layout.player;
    const isCurrentTurn = s.phase === 'playing' && s.players[s.currentPlayerIndex]?.id === player.id;
    const isMe = player.id === myId;
    const activeClass = isCurrentTurn
      ? isMe
        ? 'byggkasino-seatPill--activeSelf'
        : 'byggkasino-seatPill--activeOther'
      : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`byggkasino-seatPill ${activeClass} ${isMe ? 'byggkasino-seatPill--me' : ''}`}
      >
        <div className="byggkasino-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <span className="byggkasino-seatPillName">{isMe ? 'You' : player.name}</span>
        </div>
        <div className="river-seatPillLabels">
          <span className="river-seatCell river-seatCell--bid" title="Clean tables">CT</span>
          <span className="river-seatCell river-seatCell--tricks" title="Cards">Crds</span>
          <span className="river-seatCell river-seatCell--total">Tot</span>
        </div>
        <div className="river-seatPillValues">
          <span className="river-seatCell river-seatCell--bid">{player.sweepCount}</span>
          <span className="river-seatCell river-seatCell--tricks">{player.capturedCards.length}</span>
          <span className="river-seatCell river-seatCell--total">{s.scores[player.id] ?? 0}</span>
        </div>
      </div>
    );
  };

  if (s.phase === 'game-over') {
    const winnerNames = s.winners
      .map(id => s.players.find(p => p.id === id)?.name ?? id)
      .join(', ');
    return (
      <div className="byggkasino-board">
        <div className="flex flex-1 flex-col items-center justify-center min-h-0 gap-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold text-yellow-400 mb-2">Game Over!</h2>
            <p className="text-xl text-white/90 mb-4">
              {s.winners.includes(myId) ? 'You win!' : `${winnerNames} wins!`}
            </p>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-2 mb-4">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-2">Final Scores</h3>
              {s.players.map(p => {
                const isSelf = p.id === myId;
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <span className="text-sm font-medium" style={{ color: getPlayerHudTextColor(p.color) }}>
                      {p.name}{isSelf ? ' (You)' : ''}
                    </span>
                    <span className="font-bold text-white tabular-nums">{s.scores[p.id] ?? 0}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (s.phase === 'round-end') {
    return (
      <div className="byggkasino-board">
        <div className="flex flex-1 flex-col items-center justify-center min-h-0 gap-6">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center max-w-sm w-full"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Round {s.roundNumber}</h2>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3 mb-4">
              {s.players.map(p => {
                const roundScore = s.lastRoundScores[p.id];
                return (
                  <div key={p.id} className="text-left">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="font-medium text-sm"
                        style={{ color: getPlayerHudTextColor(p.color) }}
                      >
                        {p.name}{p.id === myId ? ' (You)' : ''}
                      </span>
                      <span className="font-bold text-white tabular-nums">{s.scores[p.id] ?? 0}</span>
                    </div>
                    {roundScore && (
                      <div className="text-xs text-white flex flex-wrap gap-x-3">
                        {roundScore.mostCards > 0 && <span>Cards +{roundScore.mostCards}</span>}
                        {roundScore.mostSpades > 0 && <span>Spades +{roundScore.mostSpades}</span>}
                        {roundScore.bigCasino > 0 && <span>10{SUIT_SYMBOLS.diamonds} +{roundScore.bigCasino}</span>}
                        {roundScore.littleCasino > 0 && <span>2{SUIT_SYMBOLS.spades} +{roundScore.littleCasino}</span>}
                        {roundScore.aces > 0 && <span>Aces +{roundScore.aces}</span>}
                        {roundScore.sweeps > 0 && <span>Clean tables +{roundScore.sweeps}</span>}
                        {roundScore.lastCapture > 0 && (
                          <span title="Last capture this round">Last capture +{roundScore.lastCapture}</span>
                        )}
                        {roundScore.total === 0 && <span>No points</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isHost ? (
              <button
                type="button"
                onClick={handleStartNextRound}
                className="px-6 py-2 bg-lime-600 hover:bg-lime-500 text-white rounded-lg font-medium transition-colors"
              >
                Next Round
              </button>
            ) : (
              <p className="text-sm text-white">Waiting for the host to continue…</p>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className={`byggkasino-board byggkasino-board--players-${s.players.length} space-y-3 sm:space-y-4`}>
      <div ref={tableRef} className={`byggkasino-table byggkasino-table--players-${s.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`byggkasino-seat ${layout.relativeIndex === 0 ? 'byggkasino-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            {renderSeatPill(layout, layout.relativeIndex === 0)}
          </div>
        ))}

        <div className={`byggkasino-center ${isHandZoomed ? 'byggkasino-center--zoom' : ''}`}>
          <div className="byggkasino-tableItems">
            <AnimatePresence mode="sync">
              {Array.from({ length: renderedTableSlotCount }, (_, slotIndex) => {
                const slotKey = `table-slot-${slotIndex}`;
                const item = s.tableSlots[slotIndex] ?? null;
                const isSelected = selectedTableIndices.includes(slotIndex);
                const isPreviewTarget =
                  !!s.pendingCapturePreview && s.pendingCapturePreview.capturedSlotIndices.includes(slotIndex);
                const previewCard = isPreviewTarget ? (s.pendingCapturePreview?.playedCard ?? null) : null;
                if (item?.kind === 'card') {
                  return (
                    <TableCard
                      key={slotKey}
                      card={item.card}
                      selected={isSelected}
                      onClick={() => handleTableItemClick(slotIndex)}
                      disabled={!isMyTurn || !!s.pendingCapturePreview}
                      previewCard={previewCard}
                    />
                  );
                }
                if (item?.kind === 'build') {
                  return (
                    <BuildPile
                      key={slotKey}
                      build={item}
                      selected={isSelected}
                      onClick={() => handleTableItemClick(slotIndex)}
                      disabled={!isMyTurn || !!s.pendingCapturePreview}
                      previewCard={previewCard}
                    />
                  );
                }
                const canTrailHere = canTrailToPlaceholder;
                return (
                  <motion.button
                    key={slotKey}
                    type="button"
                    onClick={() => {
                      if (!canTrailHere) return;
                      handleTrailToSlot(slotIndex);
                    }}
                    disabled={!canTrailHere}
                    className={`byggkasino-tableSlot ${canTrailHere ? 'byggkasino-tableSlot--trailTarget' : ''}`}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="byggkasino-headsUp" aria-live="polite">
        <p className="byggkasino-headsUpText">{headsUpContent ?? '\u00a0'}</p>
      </div>

      {myPlayer && (
        <div>
          <div ref={handContainerRef} className={`byggkasino-hand ${isHandZoomed ? 'byggkasino-hand--zoom' : ''}`}>
            <div
              className="byggkasino-handSpread"
              style={{
                width: `${handLayout.spreadWidth}px`,
                height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                transition: 'width 0.16s ease',
              }}
            >
              {myPlayer.hand.map((card, i) => {
                const isSelected = selectedHandCard !== null && cardEquals(selectedHandCard, card);
                const isLast = i === myPlayer.hand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;
                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}`}
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => handleHandCardClick(card)}
                    disabled={!isMyTurn}
                    className="byggkasino-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                  >
                    <span
                      className={`byggkasino-handCardWrap ${isMyTurn ? 'byggkasino-handCardWrap--active' : ''}`}
                      style={{
                        width: `${handLayout.cardWidth}px`,
                        height: `${handLayout.cardHeight}px`,
                        transform: isSelected ? `translateY(-${handLayout.selectedLift}px)` : 'translateY(0px)',
                      }}
                    >
                      <div className={`byggkasino-card ${!isMyTurn ? 'byggkasino-card--disabled' : ''} ${isSelected ? 'byggkasino-card--selected' : ''}`}>
                        <CardFace card={card} />
                      </div>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="byggkasino-actionRow">
            {isMyTurn && selectedHandCard && (
              <>
                {canCapture && (
                  <button
                    type="button"
                    onClick={handleCapture}
                    className="byggkasino-actionButton byggkasino-actionButton--capture"
                  >
                    Take
                  </button>
                )}
                {canBuild && (
                  <button type="button" onClick={handleBuild} className="byggkasino-actionButton byggkasino-actionButton--build">
                    Build ({computedBuildLabel})
                  </button>
                )}
                {canExtendBuild && (
                  <button
                    type="button"
                    onClick={handleExtendBuild}
                    className="byggkasino-actionButton byggkasino-actionButton--extend"
                  >
                    Extend Build
                  </button>
                )}
              </>
            )}
            {isMyTurn && canGroup && (
              <button
                type="button"
                onClick={handleGroup}
                className="byggkasino-actionButton byggkasino-actionButton--build"
              >
                Group ({computedGroupValue})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
