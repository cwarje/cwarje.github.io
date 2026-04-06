import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import type { Card, Suit } from '../cross-crib/types';
import { cardEquals } from '../cross-crib/rules';
import {
  cribCardsToSelect,
  poneIndex,
  teamIndexForSeat,
  type CribbagePlayer,
  type CribbageState,
} from './types';
import { classifyCribbageSkunk, cribbageCribOwnerLabel } from './logic';
import { legalPeggingPlays, scoreCribShow, scoreShowHand } from './rules';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import { AutoFitSeatName } from '../shared/AutoFitSeatName';
import { CRIB_HUD_FLIP_DURATION_MS } from '../shared/CribHudFlipCard';
import CribbagePegBoard from './CribbagePegBoard';

const RIVER_SEAT_EDGE_GAP_PX = 8;

/** Show-phase hand strip: staggered exit up / enter from above between scoring steps. */
const CRIB_SHOW_HAND_STAGGER_IN_S = 0.038;
const CRIB_SHOW_HAND_STAGGER_OUT_S = 0.028;
const CRIB_SHOW_HAND_ENTER_DURATION_S = 0.22;
const CRIB_SHOW_HAND_EXIT_DURATION_S = 0.14;

const cribShowHandStripVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: CRIB_SHOW_HAND_STAGGER_IN_S },
  },
  exit: {
    transition: { staggerChildren: CRIB_SHOW_HAND_STAGGER_OUT_S },
  },
};

const cribShowHandCardVariants: Variants = {
  hidden: { opacity: 0, y: -22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: CRIB_SHOW_HAND_ENTER_DURATION_S, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -28,
    transition: { duration: CRIB_SHOW_HAND_EXIT_DURATION_S, ease: [0.42, 0, 1, 1] },
  },
};

interface ElementSize {
  width: number;
  height: number;
}

interface CribbageSeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: CribbagePlayer;
  seatLeft: number;
  seatTop: number;
}

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount >= 6) {
    return { seatRadiusX: 40, seatRadiusY: 34 };
  }
  if (playerCount === 5) {
    return { seatRadiusX: 37, seatRadiusY: 32 };
  }
  return { seatRadiusX: 35, seatRadiusY: 30 };
}

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

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function possessiveNameOrDealer(name: string | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return "Dealer's";
  return `${trimmed}'s`;
}

interface CribbageBoardProps {
  state: unknown;
  myId: string;
  onAction: (payload: unknown) => void;
  isHost?: boolean;
  isHandZoomed?: boolean;
}

function scoreForSeat(s: CribbageState, seat: number): number {
  if (s.teamScores) {
    return s.teamScores[teamIndexForSeat(seat)];
  }
  return s.playerScores[seat] ?? 0;
}

export default function CribbageBoard({ state, myId, onAction, isHost = false, isHandZoomed = false }: CribbageBoardProps) {
  const s = state as CribbageState;
  const myIndex = s.players.findIndex(p => p.id === myId);
  const myPlayer = myIndex >= 0 ? s.players[myIndex] : null;
  const showDevScoreShortcut = import.meta.env.DEV && myIndex >= 0;
  const n = s.players.length;
  const isTeam = n === 4;
  const cribNeed = cribCardsToSelect(n);
  const pone = poneIndex(s.dealerIndex, n);
  const isPone = myIndex === pone;

  const selectedCrib = useMemo(
    () => (myIndex >= 0 ? (s.cribSelections[myId] ?? []) : []),
    [myIndex, myId, s.cribSelections]
  );
  const myCribConfirmed = myIndex >= 0 && !!s.cribConfirmed[myId];

  const handContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLDivElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [cribShowScoreVisible, setCribShowScoreVisible] = useState(false);

  const anchorIndex = myIndex >= 0 ? myIndex : 0;

  const isCribShowStep =
    s.phase === 'show' && s.showAppliedSteps === n + 1 && !!s.starterCard && !!s.holeCards;

  useEffect(() => {
    if (!isCribShowStep) {
      setCribShowScoreVisible(false);
      return;
    }
    setCribShowScoreVisible(false);
    const t = window.setTimeout(() => setCribShowScoreVisible(true), CRIB_HUD_FLIP_DURATION_MS);
    return () => clearTimeout(t);
  }, [isCribShowStep]);

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

  const isShowHandStrip = useMemo(
    () =>
      s.phase === 'show' &&
      !!s.starterCard &&
      !!s.holeCards &&
      s.showAppliedSteps >= 1 &&
      s.showAppliedSteps <= n,
    [s.phase, s.starterCard, s.holeCards, s.showAppliedSteps, n]
  );

  const stripCards = useMemo(() => {
    if (isShowHandStrip && s.holeCards) {
      const seat = (pone + s.showAppliedSteps - 1) % n;
      return s.holeCards[seat] ?? [];
    }
    return myPlayer?.hand ?? [];
  }, [isShowHandStrip, s.holeCards, s.showAppliedSteps, n, pone, myPlayer?.hand]);

  const stripCardsLen = stripCards.length;

  const showHandStripAriaLabel = useMemo((): string | null => {
    if (!isShowHandStrip || !s.holeCards) return null;
    const seat = (pone + s.showAppliedSteps - 1) % n;
    const sp = s.players[seat];
    if (isTeam && s.teamScores) {
      const ti = teamIndexForSeat(seat);
      const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
      return `Team ${ti + 1} · ${label}'s hand`;
    }
    const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
    return `${label}'s hand`;
  }, [isShowHandStrip, s.holeCards, s.players, s.showAppliedSteps, s.teamScores, myId, isTeam, n, pone]);

  const handLayout = useMemo(() => {
    const cardCount = stripCardsLen;
    const available = Math.max(handWidth - 8, 220);
    const cardWidth = Math.max(58, Math.min(available * 0.2, available < 420 ? 72 : 84));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.58);
    const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
    const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [handWidth, stripCardsLen]);

  useEffect(() => {
    const el = handContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHandWidth(el.clientWidth));
    ro.observe(el);
    setHandWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [myPlayer, stripCardsLen]);

  const peggingFanLayout = useMemo(() => {
    const cardCount = s.peggingSequence.length;
    const layoutCount = Math.max(cardCount, 1);
    const fromTable =
      tableSize.width > 0 ? Math.max(tableSize.width * 0.72 - 48, 220) : Math.max(handWidth - 8, 220);
    const available = Math.min(fromTable, 520);
    const cardWidth = Math.max(58, Math.min(available * 0.2, available < 420 ? 72 : 84));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.58);
    const fitStep = layoutCount > 1 ? (available - cardWidth) / (layoutCount - 1) : defaultStep;
    const step = layoutCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = layoutCount > 1 ? cardWidth + step * (layoutCount - 1) : cardWidth;
    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [s.peggingSequence.length, tableSize.width, handWidth]);

  const stockCutFanLayout = useMemo(() => {
    const cardCount = s.stock.length;
    const layoutCount = Math.max(cardCount, 1);
    const fromTable =
      tableSize.width > 0 ? Math.max(tableSize.width * 0.72 - 48, 220) : Math.max(handWidth - 8, 220);
    const available = Math.min(fromTable, 520);
    const cardWidth = Math.max(58, Math.min(available * 0.2, available < 420 ? 72 : 84));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.58);
    const fitStep = layoutCount > 1 ? (available - cardWidth) / (layoutCount - 1) : defaultStep;
    const step = layoutCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = layoutCount > 1 ? cardWidth + step * (layoutCount - 1) : cardWidth;
    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [s.stock.length, tableSize.width, handWidth]);

  const centerFanSlotHeight = useMemo(
    () =>
      Math.max(
        stockCutFanLayout.cardHeight + stockCutFanLayout.selectedLift,
        peggingFanLayout.cardHeight + peggingFanLayout.selectedLift
      ),
    [
      stockCutFanLayout.cardHeight,
      stockCutFanLayout.selectedLift,
      peggingFanLayout.cardHeight,
      peggingFanLayout.selectedLift,
    ]
  );

  const renderHandCardFace = (card: Card, disabled = false, selected = false) => (
    <div
      className={`hearts-card ${disabled ? 'hearts-card--disabled' : ''} ${selected ? 'hearts-card--selected' : ''}`}
    >
      <div className="hearts-cardCorner">
        <span className={`hearts-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
        <span className={`hearts-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  const toggleCribCard = (card: Card) => {
    if (s.phase !== 'crib-discard' || myCribConfirmed || myIndex < 0) return;
    const isSel = selectedCrib.some(c => cardEquals(c, card));
    let next: Card[];
    if (isSel) next = selectedCrib.filter(c => !cardEquals(c, card));
    else {
      if (selectedCrib.length >= cribNeed) return;
      next = [...selectedCrib, card];
    }
    onAction({ type: 'select-crib-discard', cards: next });
  };

  const confirmCrib = useCallback(() => {
    if (selectedCrib.length === cribNeed && !myCribConfirmed && myIndex >= 0) {
      onAction({ type: 'confirm-crib-discard' });
    }
  }, [selectedCrib, cribNeed, myCribConfirmed, myIndex, onAction]);

  const peggingInputBlocked =
    !!s.peggingGoReveal || !!s.peggingPointsReveal || !!s.peggingHandEndReveal;

  const peggingLegal =
    s.phase === 'pegging' &&
    !peggingInputBlocked &&
    myIndex === s.peggingCurrentIndex &&
    myPlayer
      ? legalPeggingPlays(myPlayer.hand, s.peggingSequence, s.peggingRunningTotal)
      : [];

  const playPegging = (card: Card) => {
    if (s.phase !== 'pegging' || peggingInputBlocked || myIndex !== s.peggingCurrentIndex) return;
    if (!peggingLegal.some(c => cardEquals(c, card))) return;
    onAction({ type: 'play-pegging-card', card });
  };

  const passPegging = () => {
    if (s.phase !== 'pegging' || peggingInputBlocked || myIndex !== s.peggingCurrentIndex) return;
    if (peggingLegal.length > 0) return;
    onAction({ type: 'pegging-pass' });
  };

  const headsUpContent = useMemo((): ReactNode => {
    if (s.phase === 'game-over') return 'Game over';
    if (s.phase === 'crib-discard') {
      if (myCribConfirmed) {
        const waiting = s.players.filter(p => !p.isBot && !s.cribConfirmed[p.id]);
        if (waiting.length > 0) {
          return (
            <>
              Waiting on{' '}
              {waiting.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <span style={{ color: getPlayerHudTextColor(p.color) }}>{p.name}</span>
                </span>
              ))}
              …
            </>
          );
        }
        return 'Cut coming up…';
      }
      const dealer = s.players[s.dealerIndex];
      const cribTargetPhrase =
        myIndex >= 0 && myIndex === s.dealerIndex ? 'your crib' : `${possessiveNameOrDealer(dealer?.name)} crib`;
      const line = `Pick ${cribNeed} for ${cribTargetPhrase} · ${selectedCrib.length}/${cribNeed}`;
      if (myIndex >= 0) {
        return (
          <span className="inline-flex items-center justify-center gap-1.5 flex-nowrap max-w-full">
            <span className="min-w-0 truncate">{line}</span>
            <button
              type="button"
              onClick={confirmCrib}
              disabled={selectedCrib.length !== cribNeed}
              className="shrink-0 py-1 px-2.5 rounded-md text-sm font-semibold leading-tight text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50"
            >
              Confirm
            </button>
          </span>
        );
      }
      return line;
    }
    if (s.phase === 'cut-starter') {
      const p = s.players[pone];
      return isPone ? 'Tap a card in the deck to cut' : `Waiting on ${p?.name ?? 'pone'} to cut`;
    }
    if (s.phase === 'pegging') {
      const goReveal = s.peggingGoReveal;
      if (goReveal?.stage === 'announce') {
        const p = s.players[goReveal.passerIndex];
        const label = p?.id === myId ? 'You' : p?.name ?? 'Player';
        const goVerb = label === 'You' ? 'say' : 'says';
        return (
          <span className="min-w-0 truncate">
            <span style={{ color: p ? getPlayerHudTextColor(p.color) : undefined }}>{label}</span> {goVerb} go
          </span>
        );
      }
      if (goReveal?.stage === 'score') {
        if (goReveal.lastCardPoints === 0 || goReveal.lastCardScorerIndex === null) {
          return 'Count reset';
        }
        if (isTeam && s.teamScores) {
          const ti = teamIndexForSeat(goReveal.lastCardScorerIndex);
          return `Team ${ti + 1} +${goReveal.lastCardPoints} (last card)`;
        }
        const sp = s.players[goReveal.lastCardScorerIndex];
        const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
        return (
          <span className="min-w-0 truncate">
            <span style={{ color: sp ? getPlayerHudTextColor(sp.color) : undefined }}>{label}</span>
            {` +${goReveal.lastCardPoints} (last card)`}
          </span>
        );
      }
      const pointsReveal = s.peggingPointsReveal;
      if (pointsReveal) {
        const summary = pointsReveal.summaryParts.join(', ');
        if (isTeam && s.teamScores) {
          const ti = teamIndexForSeat(pointsReveal.scorerIndex);
          const sp = s.players[pointsReveal.scorerIndex];
          const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
          return (
            <span className="min-w-0 truncate">
              {`Team ${ti + 1} +${pointsReveal.points} (`}
              <span style={{ color: sp ? getPlayerHudTextColor(sp.color) : undefined }}>{label}</span>
              {`) · ${summary}`}
            </span>
          );
        }
        const sp = s.players[pointsReveal.scorerIndex];
        const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
        return (
          <span className="min-w-0 truncate">
            <span style={{ color: sp ? getPlayerHudTextColor(sp.color) : undefined }}>{label}</span>
            {` +${pointsReveal.points} (${summary})`}
          </span>
        );
      }
      const handEndReveal = s.peggingHandEndReveal;
      if (handEndReveal) {
        if (isTeam && s.teamScores) {
          const ti = teamIndexForSeat(handEndReveal.scorerIndex);
          return `Team ${ti + 1} +1 (last card)`;
        }
        const sp = s.players[handEndReveal.scorerIndex];
        const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
        return (
          <span className="min-w-0 truncate">
            <span style={{ color: sp ? getPlayerHudTextColor(sp.color) : undefined }}>{label}</span>
            {' +1 (last card)'}
          </span>
        );
      }
      const cur = s.players[s.peggingCurrentIndex];
      if (!cur) return '\u00a0';
      const me = cur.id === myId;
      if (me && peggingLegal.length === 0) {
        return (
          <span className="inline-flex items-center justify-center gap-1.5 flex-nowrap max-w-full">
            <span className="min-w-0 truncate">Say go — you cannot play</span>
            <button
              type="button"
              onClick={passPegging}
              className="shrink-0 py-1 px-2.5 rounded-md text-sm font-semibold leading-tight bg-zinc-600 hover:bg-zinc-500 text-white"
            >
              Go
            </button>
          </span>
        );
      }
      return me ? 'Your turn' : `${cur.name}'s turn · ${s.peggingRunningTotal}`;
    }
    if (s.phase === 'show') {
      const starter = s.starterCard;
      const holes = s.holeCards;
      const totalScoringSteps = n + 1;

      const wrapShowConfirm = (body: ReactNode) => {
        if (!isHost) return body;
        return (
          <span className="inline-flex items-center justify-center gap-1.5 flex-nowrap max-w-full">
            <span className="min-w-0 truncate">{body}</span>
            <button
              type="button"
              onClick={() => onAction({ type: 'advance-show' })}
              className="shrink-0 py-1 px-2.5 rounded-md text-sm font-semibold leading-tight text-white bg-amber-600 hover:bg-amber-500"
            >
              Confirm
            </button>
          </span>
        );
      };

      if (!starter || !holes) {
        return wrapShowConfirm('Counting');
      }

      const step = s.showAppliedSteps;
      if (step >= 1 && step <= n) {
        const seat = (pone + step - 1) % n;
        const pts = scoreShowHand(holes[seat], starter);
        const sp = s.players[seat];
        if (isTeam) {
          const ti = teamIndexForSeat(seat);
          const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
          return wrapShowConfirm(
            <span className="min-w-0 truncate">
              {`Hand ${step}/${totalScoringSteps} · Team ${ti + 1} +${pts} (`}
              <span style={{ color: sp ? getPlayerHudTextColor(sp.color) : undefined }}>{label}</span>
              {`'s hand)`}
            </span>
          );
        }
        const label = sp?.id === myId ? 'You' : sp?.name ?? 'Player';
        return wrapShowConfirm(
          <span className="min-w-0 truncate">
            {`Hand ${step}/${totalScoringSteps} · `}
            <span style={{ color: sp ? getPlayerHudTextColor(sp.color) : undefined }}>{label}</span>
            {` +${pts}`}
          </span>
        );
      }
      if (step === n + 1) {
        const pts = scoreCribShow(s.cribCards, starter);
        const owner = cribbageCribOwnerLabel(s);
        const scoreSuffix = cribShowScoreVisible ? ` +${pts}` : '';
        return wrapShowConfirm(`Crib ${totalScoringSteps}/${totalScoringSteps} · ${owner}${scoreSuffix}`);
      }
      return wrapShowConfirm('Counting');
    }
    return '\u00a0';
  }, [
    s,
    myCribConfirmed,
    myIndex,
    myId,
    cribNeed,
    selectedCrib.length,
    confirmCrib,
    isPone,
    pone,
    peggingLegal.length,
    passPegging,
    n,
    isHost,
    isTeam,
    onAction,
    cribShowScoreVisible,
  ]);

  const seatLayouts = useMemo<CribbageSeatLayout[]>(() => {
    const playerCount = s.players.length;
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

  const showActiveSeatPill = n > 1;

  const pegBoardSides = useMemo(() => {
    if (n === 4 && s.teamScores) {
      const c0 = PLAYER_COLOR_HEX[s.players[0]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
      const c1 = PLAYER_COLOR_HEX[s.players[1]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
      const c2 = PLAYER_COLOR_HEX[s.players[2]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
      const c3 = PLAYER_COLOR_HEX[s.players[3]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
      return [
        { label: 'Team 1', score: s.teamScores[0], color: c0, splitColors: [c0, c2] as [string, string] },
        { label: 'Team 2', score: s.teamScores[1], color: c1, splitColors: [c1, c3] as [string, string] },
      ];
    }
    return s.players.map((p, i) => ({
      label: p.name,
      score: s.playerScores[i] ?? 0,
      color: PLAYER_COLOR_HEX[p.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR],
    }));
  }, [n, s.players, s.teamScores, s.playerScores]);

  const renderSeatPill = (layout: CribbageSeatLayout, shouldMeasure: boolean) => {
    const { player, playerIndex } = layout;
    const isCurrentTurn =
      (s.phase === 'pegging' && !peggingInputBlocked && s.peggingCurrentIndex === playerIndex) ||
      (s.phase === 'cut-starter' && pone === playerIndex);
    const activeSeatPillClass =
      isCurrentTurn && showActiveSeatPill
        ? player.id === myId
          ? 'cribbage-seatPill--activeSelf'
          : 'cribbage-seatPill--activeOther'
        : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const sc = scoreForSeat(s, playerIndex);
    const pillTopStyle = isTeam
      ? (() => {
          const teammateIndex = (playerIndex + 2) % 4;
          const leftIndex = Math.min(playerIndex, teammateIndex);
          const rightIndex = Math.max(playerIndex, teammateIndex);
          const leftColor =
            PLAYER_COLOR_HEX[s.players[leftIndex]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
          const rightColor =
            PLAYER_COLOR_HEX[s.players[rightIndex]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
          return {
            background: `linear-gradient(to right, ${leftColor} 50%, ${rightColor} 50%)`,
            color: seatTextColor,
          };
        })()
      : { backgroundColor: seatColor, color: seatTextColor };

    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`cribbage-seatPill ${activeSeatPillClass} ${player.id === myId ? 'cribbage-seatPill--me' : ''}`}
      >
        <div className="cribbage-seatPillTop" style={pillTopStyle}>
          <AutoFitSeatName
            name={player.id === myId ? 'You' : player.name}
            textColor={seatTextColor}
            nameClassName="cribbage-seatPillName"
          />
        </div>
        <div className="cribbage-seatPillBottom">
          <span className="cribbage-seatPillScore">{sc}</span>
        </div>
      </div>
    );
  };

  if (s.phase === 'game-over') {
    const winnerSet = new Set(s.winners);
    const teamHasWinner = (team: 0 | 1): boolean =>
      s.players.some((p, seat) => winnerSet.has(p.id) && teamIndexForSeat(seat) === team);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="river-board cribbage-board h-full flex flex-col items-center justify-center space-y-6 text-center px-4"
      >
        <span className="text-7xl" aria-hidden>
          🏆
        </span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <ul className="space-y-2 text-left max-w-md w-full">
          {s.players.map((p, i) => {
            const sc = scoreForSeat(s, i);
            const won = winnerSet.has(p.id);
            const skunkStatus = (() => {
              if (won) return 'none' as const;
              if (s.teamScores) {
                const team = teamIndexForSeat(i);
                if (teamHasWinner(team)) return 'none' as const;
                return classifyCribbageSkunk(s.teamScores[team], s.targetScore);
              }
              return classifyCribbageSkunk(sc, s.targetScore);
            })();
            const skunkLabel =
              skunkStatus === 'double-skunk'
                ? 'Double Skunk'
                : skunkStatus === 'skunk'
                  ? 'Skunk'
                  : null;
            return (
              <li
                key={p.id}
                className={`flex justify-between rounded-xl px-4 py-2 ${won ? 'bg-amber-500/20 text-amber-100' : 'bg-white/5 text-white/80'}`}
              >
                <span>{p.name}</span>
                <span className="font-bold inline-flex items-center gap-2">
                  <span>{sc}</span>
                  {skunkLabel && (
                    <span className="rounded-md border border-rose-300/60 bg-rose-500/20 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
                      {skunkLabel}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </motion.div>
    );
  }

  return (
    <div className="river-board cribbage-board relative flex flex-col h-full min-h-0 text-white">
      {showDevScoreShortcut && (
        <button
          type="button"
          onClick={() => onAction({ type: 'dev-set-near-win' })}
          className="absolute right-3 top-3 z-20 rounded-md border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/30 cursor-pointer"
        >
          Dev: near win
        </button>
      )}
      <div className="flex-1 min-h-0 flex flex-col min-w-0 gap-2 px-2 pt-2 pb-1">
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          <div ref={tableRef} className={`river-table river-table--players-${n} flex-1 min-h-0`}>
            {seatLayouts.map(layout => (
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
              <div className="absolute inset-0 z-[2] flex items-center justify-center p-2 overflow-y-auto pointer-events-none">
                <div className="cribbage-center pointer-events-auto flex max-h-full w-full max-w-xl min-h-[120px] flex-col items-center justify-start gap-2 rounded-2xl bg-transparent p-3">
                  <CribbagePegBoard targetScore={s.targetScore} sides={pegBoardSides} />
                  <div
                    className="w-full shrink-0 flex flex-col items-center justify-center overflow-visible"
                    style={{ minHeight: centerFanSlotHeight }}
                  >
                    {s.phase === 'cut-starter' && s.stock.length > 0 && (
                      <div className="w-full">
                        <div className="cribbage-stockFanScroll w-full flex justify-center">
                          <div
                            className={`hearts-hand cribbage-stockFanHost ${isHandZoomed ? 'hearts-hand--zoom' : ''}`}
                            style={{ minHeight: 0 }}
                          >
                            <div
                              className="hearts-handSpread"
                              role="group"
                              aria-label={
                                isPone
                                  ? `Deck of ${s.stock.length} cards — tap a card to cut`
                                  : `Deck of ${s.stock.length} cards`
                              }
                              style={{
                                width: `${stockCutFanLayout.spreadWidth}px`,
                                height: `${stockCutFanLayout.cardHeight + stockCutFanLayout.selectedLift}px`,
                                transition: 'width 0.16s ease',
                              }}
                            >
                              {Array.from({ length: s.stock.length }, (_, i) => {
                                const isLast = i === s.stock.length - 1;
                                const hitboxWidth = isLast ? stockCutFanLayout.cardWidth : stockCutFanLayout.step;
                                const cardWrap = (
                                  <span
                                    className={`hearts-handCardWrap ${isPone ? 'hearts-handCardWrap--active' : ''}`}
                                    style={{
                                      width: `${stockCutFanLayout.cardWidth}px`,
                                      height: `${stockCutFanLayout.cardHeight}px`,
                                      transform: 'translateY(0px)',
                                    }}
                                  >
                                    <div className="hearts-card cribbage-stockCardBack" aria-hidden />
                                  </span>
                                );

                                if (isPone) {
                                  return (
                                    <motion.button
                                      key={`cut-stock-${i}`}
                                      type="button"
                                      initial={{ y: 12, opacity: 0 }}
                                      animate={{ y: 0, opacity: 1 }}
                                      transition={{ delay: Math.min(i * 0.008, 0.28) }}
                                      onClick={() => {
                                        if (s.phase !== 'cut-starter' || s.stock.length === 0) return;
                                        onAction({ type: 'perform-cut', cutIndex: i });
                                      }}
                                      className="hearts-handHitbox"
                                      style={{
                                        left: `${i * stockCutFanLayout.step}px`,
                                        width: `${hitboxWidth}px`,
                                        height: `${stockCutFanLayout.cardHeight + stockCutFanLayout.selectedLift}px`,
                                        zIndex: i + 1,
                                      }}
                                      aria-label={`Cut at position ${i + 1} of ${s.stock.length} from the top`}
                                    >
                                      {cardWrap}
                                    </motion.button>
                                  );
                                }

                                return (
                                  <div
                                    key={`cut-stock-${i}`}
                                    className="hearts-handHitbox pointer-events-none !cursor-default"
                                    style={{
                                      left: `${i * stockCutFanLayout.step}px`,
                                      width: `${hitboxWidth}px`,
                                      height: `${stockCutFanLayout.cardHeight + stockCutFanLayout.selectedLift}px`,
                                      zIndex: i + 1,
                                    }}
                                    aria-hidden
                                  >
                                    {cardWrap}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {s.phase === 'pegging' && (
                      <div className="w-full">
                        <div className="flex justify-center min-h-0 w-full">
                          <div
                            className={`hearts-hand cribbage-peggingFanHost ${isHandZoomed ? 'hearts-hand--zoom' : ''}`}
                            style={{ minHeight: 0 }}
                          >
                            <div
                              className="hearts-handSpread"
                              role="list"
                              aria-label={`Cards played this count · running total ${s.peggingRunningTotal}`}
                              style={{
                                width: `${peggingFanLayout.spreadWidth}px`,
                                height: `${peggingFanLayout.cardHeight + peggingFanLayout.selectedLift}px`,
                                transition: 'width 0.16s ease',
                              }}
                            >
                              {s.peggingSequence.map((pl, i) => {
                                const isLast = i === s.peggingSequence.length - 1;
                                const hitboxWidth = isLast ? peggingFanLayout.cardWidth : peggingFanLayout.step;
                                return (
                                  <div
                                    key={`${i}-${pl.card.suit}-${pl.card.rank}`}
                                    role="listitem"
                                    className="hearts-handHitbox pointer-events-none !cursor-default"
                                    style={{
                                      left: `${i * peggingFanLayout.step}px`,
                                      width: `${hitboxWidth}px`,
                                      height: `${peggingFanLayout.cardHeight + peggingFanLayout.selectedLift}px`,
                                      zIndex: i + 1,
                                    }}
                                    aria-label={`${rankDisplay(pl.card.rank)} of ${pl.card.suit}, play ${i + 1} of ${s.peggingSequence.length}`}
                                  >
                                    <div
                                      className="hearts-handCardWrap"
                                      style={{
                                        width: `${peggingFanLayout.cardWidth}px`,
                                        height: `${peggingFanLayout.cardHeight}px`,
                                        transform: 'translateY(0px)',
                                      }}
                                    >
                                      {renderHandCardFace(pl.card, false, false)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="river-headsUp shrink-0 px-2 sm:px-4 pb-1" aria-live="polite">
        <p
          className={`river-headsUpText ${
            (s.phase === 'crib-discard' && !myCribConfirmed && myIndex >= 0) ||
            (s.phase === 'pegging' &&
              !peggingInputBlocked &&
              myIndex === s.peggingCurrentIndex &&
              peggingLegal.length === 0) ||
            (s.phase === 'show' && isHost)
              ? 'crosscrib-headsUpText--withAction'
              : ''
          }`}
        >
          {headsUpContent}
        </p>
      </div>

      {myPlayer && (
        <div ref={handContainerRef} className={`hearts-hand shrink-0 ${isHandZoomed ? 'hearts-hand--zoom' : ''}`}>
          <div
            className="hearts-handSpread"
            role={isShowHandStrip && stripCardsLen > 0 ? 'list' : undefined}
            aria-label={showHandStripAriaLabel ?? undefined}
            style={{
              width: `${handLayout.spreadWidth}px`,
              height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
              transition: 'width 0.16s ease',
            }}
          >
            {isShowHandStrip ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.showAppliedSteps}
                  className="contents"
                  style={{ display: 'contents' }}
                  variants={cribShowHandStripVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {stripCards.map((card, i) => {
                    const isLast = i === stripCards.length - 1;
                    const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;
                    return (
                      <motion.div
                        key={`${i}-${card.suit}-${card.rank}`}
                        role="listitem"
                        variants={cribShowHandCardVariants}
                        className="hearts-handHitbox pointer-events-none !cursor-default"
                        style={{
                          left: `${i * handLayout.step}px`,
                          width: `${hitboxWidth}px`,
                          height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                          zIndex: i + 1,
                        }}
                        aria-label={`${rankDisplay(card.rank)} of ${card.suit}`}
                      >
                        <span
                          className="hearts-handCardWrap"
                          style={{
                            width: `${handLayout.cardWidth}px`,
                            height: `${handLayout.cardHeight}px`,
                            transform: 'translateY(0px)',
                          }}
                        >
                          {renderHandCardFace(card, false, false)}
                        </span>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            ) : (
              stripCards.map((card, i) => {
                  const isSelectedForCrib = selectedCrib.some(c => cardEquals(c, card));
                  const isCribSelecting = s.phase === 'crib-discard' && !myCribConfirmed;
                  const canPegThisCard =
                    s.phase === 'pegging' &&
                    !peggingInputBlocked &&
                    myIndex === s.peggingCurrentIndex &&
                    peggingLegal.some(c => cardEquals(c, card));
                  const isDisabled = !isCribSelecting && !canPegThisCard;
                  const isLast = i === stripCards.length - 1;
                  const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

                  return (
                    <motion.button
                      key={`${card.suit}-${card.rank}`}
                      initial={{ y: 50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => {
                        if (isCribSelecting) toggleCribCard(card);
                        else if (canPegThisCard) playPegging(card);
                      }}
                      disabled={isDisabled}
                      className="hearts-handHitbox"
                      style={{
                        left: `${i * handLayout.step}px`,
                        width: `${hitboxWidth}px`,
                        height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                        zIndex: i + 1,
                      }}
                      aria-label={`Play ${rankDisplay(card.rank)} of ${card.suit}`}
                    >
                      <span
                        className={`hearts-handCardWrap ${(isCribSelecting && !isSelectedForCrib) || canPegThisCard ? 'hearts-handCardWrap--active' : ''}`}
                        style={{
                          width: `${handLayout.cardWidth}px`,
                          height: `${handLayout.cardHeight}px`,
                          transform: isSelectedForCrib ? `translateY(-${handLayout.selectedLift}px)` : 'translateY(0px)',
                        }}
                      >
                        {renderHandCardFace(card, isDisabled, isSelectedForCrib)}
                      </span>
                    </motion.button>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
