import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { TableEvent, TableEventInput } from '../../networking/types';
import type { Card, Suit, TwelvePlayer, TwelveState } from './types';
import { cardPointValue, getPilePlayableCard, isLegalPlay, rankDisplay, suitsWithRoyalPair } from './rules';
import { getTeamRoundCardPoints } from './logic';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import { useDealerDealAnimation, type DealSeat, type DealExtraTarget } from '../shared/useDealerDealAnimation';
import { DealAnimationLayer } from '../shared/DealAnimationLayer';
import { CardTossLayers } from '../shared/CardTossLayers';
import { useCardToss } from '../shared/useCardToss';
import { CardBack } from '../shared/ui/CardBack';
import { CardFace } from '../shared/ui/CardFace';
import { RadialSeatName } from '../shared/ui/RadialSeatName';
import { SUIT_COLORS, SUIT_SYMBOLS } from '../shared/ui/cardConstants';

interface TwelveBoardProps {
  state: TwelveState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
  sendTableEvent?: (event: TableEventInput) => void;
  lastTableEvent?: TableEvent | null;
}

interface SeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: TwelvePlayer;
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

const TRICK_SLOT_PLACEMENTS: Record<number, TrickSlotPlacement[]> = {
  2: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--radial-slot-h) * 0.2)' },
    { row: 1, col: 2, dx: '0px', dy: 'calc(var(--radial-slot-h) * -0.2)' },
  ],
  3: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--radial-slot-h) * 0.2)' },
    { row: 1, col: 1, dx: 'calc(var(--radial-slot-w) * 0.45)', dy: '0px' },
    { row: 1, col: 3, dx: 'calc(var(--radial-slot-w) * -0.45)', dy: '0px' },
  ],
  4: [
    { row: 2, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 1, dx: '0px', dy: 'calc(var(--radial-slot-h) * -0.5)' },
    { row: 1, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: 'calc(var(--radial-slot-h) * -0.5)' },
  ],
};

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount === 2) return { seatRadiusX: 30, seatRadiusY: 29 };
  if (playerCount === 4) return { seatRadiusX: 35, seatRadiusY: 27 };
  return { seatRadiusX: 34, seatRadiusY: 30 };
}

function getTrickSlotPlacement(playerCount: number, relativeIndex: number): TrickSlotPlacement {
  const layout = TRICK_SLOT_PLACEMENTS[playerCount]?.[relativeIndex];
  if (layout) return layout;
  return { row: 2, col: 2, dx: '0px', dy: '0px' };
}

const OPPONENT_HAND_CARD_WIDTH = 45;
const OPPONENT_HAND_CARD_HEIGHT = 68;
const OPPONENT_HAND_MAX_SPREAD = 160;

interface OpponentHandLayout {
  cardWidth: number;
  cardHeight: number;
  step: number;
  spreadWidth: number;
}

function getOpponentHandLayout(cardCount: number): OpponentHandLayout {
  const cardWidth = OPPONENT_HAND_CARD_WIDTH;
  const cardHeight = OPPONENT_HAND_CARD_HEIGHT;
  const defaultStep = Math.round(cardWidth * 0.58);
  const fitStep = cardCount > 1 ? (OPPONENT_HAND_MAX_SPREAD - cardWidth) / (cardCount - 1) : defaultStep;
  const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
  const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
  return { cardWidth, cardHeight, step, spreadWidth };
}

function getPileBottomKey(playerId: string, pileIndex: number): string {
  return `${playerId}-pile-${pileIndex}`;
}

const PILE_FLIP_DURATION_S = 0.45;

function TwelvePileBottomCard({
  card,
  faceUp,
  disabled = false,
  skipFlipAnim = false,
}: {
  card: Card;
  faceUp: boolean;
  disabled?: boolean;
  /** True for reduced motion or piles already face-up when the board mounted (reconnect). */
  skipFlipAnim?: boolean;
}) {
  const [revealed, setRevealed] = useState(skipFlipAnim);

  useEffect(() => {
    if (!faceUp) {
      setRevealed(false);
      return;
    }
    if (skipFlipAnim) setRevealed(true);
  }, [faceUp, skipFlipAnim]);

  if (!faceUp) {
    return <CardBack />;
  }

  if (skipFlipAnim) {
    return <CardFace card={card} disabled={disabled} compact />;
  }

  return (
    <div className={`twelve-pileReveal ${revealed ? 'twelve-pileReveal--revealed' : ''}`}>
      <motion.div
        className="twelve-pileRevealInner"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: PILE_FLIP_DURATION_S, ease: 'easeInOut' }}
        onAnimationComplete={() => setRevealed(true)}
      >
        <div className="twelve-pileRevealFace twelve-pileRevealFace--back">
          <CardBack />
        </div>
        <div className="twelve-pileRevealFace twelve-pileRevealFace--front">
          <CardFace card={card} disabled={disabled} compact />
        </div>
      </motion.div>
    </div>
  );
}

export default function TwelveBoard({
  state,
  myId,
  onAction,
  isHandZoomed = false,
  sendTableEvent,
  lastTableEvent,
}: TwelveBoardProps) {
  const myIndex = state.players.findIndex(player => player.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = myIndex >= 0 && state.currentPlayerIndex === myIndex;
  const boardRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLButtonElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [pileSkipFlipAnim, setPileSkipFlipAnim] = useState<Set<string>>(() => new Set());
  const reduceMotion = useReducedMotion();

  const {
    cardTossBursts,
    seatCardSplats,
    cardSplats,
    isThrowingCards,
    getSeatPillTossProps,
  } = useCardToss({
    boardRef,
    tableRef,
    handContainerRef,
    myId,
    handCount: myPlayer?.hand.length ?? 0,
    gameType: 'twelve',
    sendTableEvent,
    lastTableEvent,
  });

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
  }, [state.players, anchorIndex, tableSize.width, tableSize.height, seatPillSize.width, seatPillSize.height]);

  const dealSeats = useMemo<DealSeat[]>(
    () =>
      seatLayouts.map(layout => ({
        playerId: layout.player.id,
        isSelf: layout.relativeIndex === 0,
        seatLeft: layout.seatLeft,
        seatTop: layout.seatTop,
        count: layout.player.hand.length,
      })),
    [seatLayouts],
  );

  const dealExtras = useMemo<DealExtraTarget[]>(() => {
    const extras: DealExtraTarget[] = [];
    for (const layout of seatLayouts) {
      layout.player.frontPiles.forEach((pile, pileIndex) => {
        if (pile.bottomCard) {
          extras.push({
            id: `${layout.player.id}-pile-${pileIndex}-bottom`,
            seatLeft: layout.seatLeft,
            seatTop: layout.seatTop,
            faceUp: false,
          });
        }
        if (pile.topCard) {
          extras.push({
            id: `${layout.player.id}-pile-${pileIndex}-top`,
            seatLeft: layout.seatLeft,
            seatTop: layout.seatTop,
            faceUp: false,
          });
        }
      });
    }
    return extras;
  }, [seatLayouts]);

  const deal = useDealerDealAnimation({
    boardRef,
    tableRef,
    dealKey: String(state.roundNumber),
    seats: dealSeats,
    extraTargets: dealExtras,
  });

  const myRevealCount = deal.revealedFor(myId, myPlayer?.hand.length ?? 0);
  const visibleHand = myPlayer ? myPlayer.hand.slice(0, myRevealCount) : [];

  const trickByRelativeSeat = useMemo(() => {
    const mapped: Partial<Record<number, { playerId: string; card: Card }>> = {};
    const playerCount = state.players.length;
    state.currentTrick.forEach((entry) => {
      const index = state.players.findIndex(player => player.id === entry.playerId);
      if (index === -1) return;
      const relative = (index - anchorIndex + playerCount) % playerCount;
      mapped[relative] = { playerId: entry.playerId, card: entry.card };
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

  const headsUpContent = useMemo((): ReactNode => {
    if (state.phase === 'round-end') {
      const roundCardPoints = state.roundCardPoints;
      const isTeam = state.players.length === 4;

      if (state.roundBonusesSkipped) {
        if (isTeam) {
          const teamPoints = getTeamRoundCardPoints(state.players, roundCardPoints);
          const renderTeam = (teamIdx: 0 | 1) => {
            const p1 = state.players[teamIdx === 0 ? 0 : 1];
            const p2 = state.players[teamIdx === 0 ? 2 : 3];
            return (
              <>
                <span style={{ color: getPlayerHudTextColor(p1.color) }}>{p1.name}</span>
                {' & '}
                <span style={{ color: getPlayerHudTextColor(p2.color) }}>{p2.name}</span>
              </>
            );
          };
          const pointsChunks = [
            <span key="team0">{renderTeam(0)}{`: ${teamPoints[0]}`}</span>,
            <span key="team1">{renderTeam(1)}{`: ${teamPoints[1]}`}</span>,
          ];
          const pointsLine = pointsChunks.reduce<ReactNode[]>((acc, node, i) => (i === 0 ? [node] : [...acc, ' · ', node]), []);
          return (
            <>
              {'Half man ended the round — only bid points counted · '}
              {pointsLine}
              {' (card points not scored)'}
            </>
          );
        }

        const pointsChunks = state.players.map((player) => (
          <span key={player.id} style={{ color: getPlayerHudTextColor(player.color) }}>
            {player.name}: {roundCardPoints[player.id] ?? 0}
          </span>
        ));
        const pointsLine = pointsChunks.reduce<ReactNode[]>((acc, node, i) => (i === 0 ? [node] : [...acc, ' · ', node]), []);
        return (
          <>
            {'Half man ended the round — only bid points counted · '}
            {pointsLine}
            {' (card points not scored)'}
          </>
        );
      }

      if (isTeam) {
        const teamPoints = getTeamRoundCardPoints(state.players, roundCardPoints);
        const renderTeam = (teamIdx: 0 | 1) => {
          const p1 = state.players[teamIdx === 0 ? 0 : 1];
          const p2 = state.players[teamIdx === 0 ? 2 : 3];
          return (
            <>
              <span style={{ color: getPlayerHudTextColor(p1.color) }}>{p1.name}</span>
              {' & '}
              <span style={{ color: getPlayerHudTextColor(p2.color) }}>{p2.name}</span>
            </>
          );
        };
        const pointsChunks = [
          <span key="team0">{renderTeam(0)}{`: ${teamPoints[0]}`}</span>,
          <span key="team1">{renderTeam(1)}{`: ${teamPoints[1]}`}</span>,
        ];
        const pointsLine = pointsChunks.reduce<ReactNode[]>((acc, node, i) => (i === 0 ? [node] : [...acc, ' · ', node]), []);
        const winningTeam: 0 | 1 | null = teamPoints[0] > teamPoints[1] ? 0 : teamPoints[1] > teamPoints[0] ? 1 : null;
        const mostPointsLine = winningTeam === null ? (
          'Most +1: tie'
        ) : (
          <>Most +1: {renderTeam(winningTeam)}</>
        );
        const lastTrickLine = state.lastTrickWinnerId === null ? (
          'Last +1: none'
        ) : (() => {
          const winner = state.players.find(p => p.id === state.lastTrickWinnerId)!;
          const winnerIdx = state.players.findIndex(p => p.id === state.lastTrickWinnerId);
          const team = (winnerIdx % 2) as 0 | 1;
          return (
            <>
              {'Last +1: '}
              <span style={{ color: getPlayerHudTextColor(winner.color) }}>{winner.name}</span>
              {' ('}
              {renderTeam(team)}
              {')'}
            </>
          );
        })();
        return (
          <>
            {pointsLine} {' · '} {mostPointsLine} {' · '} {lastTrickLine}
          </>
        );
      }

      const roundValues = Object.values(roundCardPoints);
      const maxPoints = roundValues.length > 0 ? Math.max(...roundValues) : 0;
      const mostPointIds = state.players.filter(p => (roundCardPoints[p.id] ?? 0) === maxPoints).map(p => p.id);
      const gotMostPoint = mostPointIds.length === 1 ? mostPointIds[0] : null;
      const pointsChunks = state.players.map((player) => (
        <span key={player.id} style={{ color: getPlayerHudTextColor(player.color) }}>
          {player.name}: {roundCardPoints[player.id] ?? 0}
        </span>
      ));
      const pointsLine = pointsChunks.reduce<ReactNode[]>((acc, node, i) => (i === 0 ? [node] : [...acc, ' · ', node]), []);
      const mostPointsLine = gotMostPoint === null ? (
        'Most +1: tie'
      ) : (
        <>
          {'Most +1: '}
          <span style={{ color: getPlayerHudTextColor(state.players.find(p => p.id === gotMostPoint)!.color) }}>
            {state.players.find(p => p.id === gotMostPoint)?.name ?? 'Player'}
          </span>
        </>
      );
      const lastTrickLine = state.lastTrickWinnerId === null ? (
        'Last +1: none'
      ) : (
        <>
          {'Last +1: '}
          <span style={{ color: getPlayerHudTextColor(state.players.find(p => p.id === state.lastTrickWinnerId)!.color) }}>
            {state.players.find(p => p.id === state.lastTrickWinnerId)?.name ?? 'Player'}
          </span>
        </>
      );
      return (
        <>
          {pointsLine} {' · '} {mostPointsLine} {' · '} {lastTrickLine}
        </>
      );
    }
    if (state.phase === 'announcement' && state.announcement) {
      const player = state.players.find(p => p.id === state.announcement?.playerId);
      if (!player) return null;
      if (state.announcement.kind === 'set-trump') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {` set trump to ${state.announcement.suit} +2`}
          </>
        );
      }
      if (state.announcement.kind === 'call-tjog') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {` called tjog in ${state.announcement.suit} +1`}
          </>
        );
      }
      if (state.announcement.kind === 'call-half-man') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {' called Half man'}
          </>
        );
      }
      if (state.announcement.kind === 'call-full-man') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {' called Full man'}
          </>
        );
      }
      if (state.announcement.kind !== 'man-outcome') return null;
      const declarerIndex = state.players.findIndex(p => p.id === player.id);
      const declarerPoints = player.capturedCards.reduce((sum, card) => sum + cardPointValue(card), 0);
      const awardedGroupText = (bonus: 3 | 6): string => {
        if (declarerIndex < 0) return `Opponents +${bonus}`;
        if (state.players.length === 4) {
          const opponents = state.players.filter((_, idx) => idx % 2 !== declarerIndex % 2);
          if (opponents.length >= 2) return `${opponents[0].name} & ${opponents[1].name} team +${bonus}`;
          return `Opposing team +${bonus}`;
        }
        const opponents = state.players.filter((_, idx) => idx !== declarerIndex);
        if (opponents.length === 0) return `Opponents +${bonus}`;
        if (opponents.length === 1) return `${opponents[0].name} +${bonus}`;
        const names = opponents.map(p => p.name).join(', ');
        return `${names} +${bonus} each`;
      };
      if (state.announcement.outcome === 'half-success') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {` got 6 points for Half man (${declarerPoints} pts)`}
          </>
        );
      }
      if (state.announcement.outcome === 'half-fail-streak') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {` failed Half man (${declarerPoints} pts). ${awardedGroupText(3)}.`}
          </>
        );
      }
      if (state.announcement.outcome === 'half-fail-points') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {` failed Half man (${declarerPoints} pts). ${awardedGroupText(3)}.`}
          </>
        );
      }
      if (state.announcement.outcome === 'full-success') {
        return (
          <>
            <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
            {` got 12 points for Full man (${declarerPoints} pts)`}
          </>
        );
      }
      return (
        <>
          <span style={{ color: getPlayerHudTextColor(player.color) }}>{player.name}</span>
          {` failed Full man (${declarerPoints} pts). ${awardedGroupText(6)}.`}
        </>
      );
    }
    if (state.phase === 'flipping') return null;
    if (state.trickWinner) {
      const winner = state.players.find(p => p.id === state.trickWinner);
      if (!winner) return null;
      return (
        <>
          <span style={{ color: getPlayerHudTextColor(winner.color) }}>{winner.name}</span>
          {' won the trick'}
        </>
      );
    }
    if (isMyTurn) return 'Your turn';
    const waitingPlayer = state.players[state.currentPlayerIndex];
    if (!waitingPlayer) return null;
    return (
      <>
        {'Waiting for '}
        <span style={{ color: getPlayerHudTextColor(waitingPlayer.color) }}>{waitingPlayer.name}</span>
      </>
    );
  }, [state.phase, state.roundCardPoints, state.lastTrickWinnerId, state.announcement, state.trickWinner, state.players, state.currentPlayerIndex, isMyTurn]);

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
    const updateSize = () => setSeatPillSize({ width: seatPillElement.clientWidth, height: seatPillElement.clientHeight });
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

  useEffect(() => {
    const skip = new Set<string>();
    state.players.forEach(player => {
      player.frontPiles.forEach((pile, pileIndex) => {
        if (pile.bottomFaceUp) {
          skip.add(getPileBottomKey(player.id, pileIndex));
        }
      });
    });
    setPileSkipFlipAnim(skip);
  }, [state.roundNumber]);

  const handLayout = useMemo(() => {
    const cardCount = visibleHand.length;
    const available = Math.max(handWidth - 8, 220);
    const cardWidth = Math.max(58, Math.min(available * 0.2, available < 420 ? 72 : 84));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.58);
    const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
    const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [handWidth, visibleHand.length]);

  const myRoyalSuits = myPlayer ? suitsWithRoyalPair(myPlayer) : [];
  const myTjogSuits = myPlayer
    ? myRoyalSuits.filter((suit) => {
        if (myPlayer.tjogSuitsCalled.includes(suit)) return false;
        if (state.trumpSetterId === myPlayer.id && suit === state.trumpSuit) return false;
        return true;
      })
    : [];
  const canUseActionButtons = state.phase === 'playing' && isMyTurn && !state.trickWinner;
  const canAnnounceTrumpOrTjog =
    !!myPlayer
    && canUseActionButtons
    && state.currentTrick.length === 0
    && state.lastTrickWinnerId === myPlayer.id;
  const canSetTrump = canAnnounceTrumpOrTjog && state.trumpSuit === null && !!myPlayer && myPlayer.totalScore < 10;
  const canCallTjog = canAnnounceTrumpOrTjog && state.trumpSuit !== null && !!myPlayer && myPlayer.totalScore < 11;
  const showSetTrumpActions = canSetTrump && myRoyalSuits.length > 0;
  const showCallTjogActions = canCallTjog && myTjogSuits.length > 0;
  const totalTricksInRound = useMemo(() => {
    const playerCount = state.players.length;
    if (playerCount <= 0) return 0;
    const cardsForPiles = playerCount * state.pileCount * 2;
    const cardsForHands = 36 - cardsForPiles;
    const handCardsEach = Math.floor(cardsForHands / playerCount);
    return handCardsEach + state.pileCount * 2;
  }, [state.players.length, state.pileCount]);
  const canDeclareMan =
    !!myPlayer
    && canUseActionButtons
    && state.currentTrick.length === 0
    && state.lastTrickWinnerId === myPlayer.id
    && state.trickNumber === 2
    && state.manBid === null;
  const canCallHalfMan = canDeclareMan && totalTricksInRound >= 6;
  const canCallFullMan = canDeclareMan;
  const hasActionButtons =
    showSetTrumpActions || showCallTjogActions || canCallHalfMan || canCallFullMan;
  const showDevBestCardsButton =
    import.meta.env.DEV
    && myIndex >= 0
    && state.phase === 'playing'
    && state.trickNumber === 1
    && state.currentTrick.length === 0
    && state.trickWinner === null
    && !state.gameOver;

  const playHandCard = (card: Card) => {
    if (!canUseActionButtons || myIndex < 0) return;
    if (!isLegalPlay(state, myIndex, card, 'hand')) return;
    onAction({ type: 'play-hand-card', card });
  };

  const playPileCard = (pileIndex: number) => {
    if (!canUseActionButtons || myIndex < 0) return;
    const pile = myPlayer?.frontPiles[pileIndex];
    if (!pile) return;
    const playable = getPilePlayableCard(pile);
    if (!playable) return;
    if (!isLegalPlay(state, myIndex, playable.card, 'pile', pileIndex)) return;
    onAction({ type: 'play-pile-card', pileIndex });
  };

  const setTrump = (suit: Suit) => {
    if (!canSetTrump) return;
    onAction({ type: 'set-trump', suit });
  };

  const callTjog = (suit: Suit) => {
    if (!canCallTjog) return;
    onAction({ type: 'call-tjog', suit });
  };

  const callHalfMan = () => {
    if (myIndex < 0 || !myPlayer) return;
    if (!canCallHalfMan) return;
    onAction({ type: 'call-half-man' });
  };

  const callFullMan = () => {
    if (myIndex < 0 || !myPlayer) return;
    if (!canCallFullMan) return;
    onAction({ type: 'call-full-man' });
  };

  const devGiveBestCards = () => {
    if (!showDevBestCardsButton) return;
    onAction({ type: 'dev-give-best-cards' });
  };

  if (state.phase === 'game-over') {
    const isTeam = state.players.length === 4;

    if (isTeam) {
      const teams = [
        { players: [state.players[0], state.players[2]], score: state.players[0].totalScore },
        { players: [state.players[1], state.players[3]], score: state.players[1].totalScore },
      ].sort((a, b) => b.score - a.score);

      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="radial-board h-full flex flex-col items-center justify-center space-y-6 text-center"
        >
          <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
          <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
          <div className="space-y-3 w-full max-w-2xl">
            {teams.map((team, i) => (
              <div key={team.players[0].id} className="radial-resultRow">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">#{i + 1}</span>
                  <span className="font-semibold">{team.players[0].name} & {team.players[1].name}</span>
                </div>
                <span className="text-xl font-bold">{team.score} pts</span>
              </div>
            ))}
          </div>
        </motion.div>
      );
    }

    const rankedPlayers = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="radial-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <div className="space-y-3 w-full max-w-2xl">
          {rankedPlayers.map((player, i) => (
            <div key={player.id} className="radial-resultRow">
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

  const renderOpponentHandFan = (player: TwelvePlayer) => {
    const fullCount = player.hand.length;
    const cardCount = deal.revealedFor(player.id, fullCount);
    if (cardCount === 0) return null;

    const layout = getOpponentHandLayout(cardCount);

    return (
      <div
        className="twelve-opponentHandSpread"
        aria-label={`${player.name}, ${fullCount} cards in hand`}
        style={{
          width: `${layout.spreadWidth}px`,
          height: `${layout.cardHeight}px`,
          transition: 'width 0.16s ease',
        }}
      >
        <AnimatePresence initial={false}>
          {Array.from({ length: cardCount }, (_, i) => {
            const isLast = i === cardCount - 1;
            const hitboxWidth = isLast ? layout.cardWidth : layout.step;
            return (
              <motion.div
                key={`${player.id}-hand-slot-${i}`}
                className="twelve-opponentHandHitbox"
                style={{
                  left: `${i * layout.step}px`,
                  width: `${hitboxWidth}px`,
                  height: `${layout.cardHeight}px`,
                  zIndex: i + 1,
                }}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 12, scale: 0.85 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                <span
                  className="twelve-opponentHandCardWrap"
                  style={{ width: `${layout.cardWidth}px`, height: `${layout.cardHeight}px` }}
                >
                  <div className="card-back" />
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  };

  const renderSeatPill = (seatLayout: SeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === player.id && !state.trickWinner;
    const isMe = player.id === myId;
    const seatPillStateClass = isCurrentTurn
      ? isMe
        ? 'radial-seatPill--activeSelf'
        : 'radial-seatPill--activeOther'
      : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const isTeam = state.players.length === 4;
    const pillTopStyle = isTeam
      ? (() => {
          const teammateIndex = (seatLayout.playerIndex + 2) % 4;
          const leftIndex = Math.min(seatLayout.playerIndex, teammateIndex);
          const rightIndex = Math.max(seatLayout.playerIndex, teammateIndex);
          const leftColor =
            PLAYER_COLOR_HEX[state.players[leftIndex]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
          const rightColor =
            PLAYER_COLOR_HEX[state.players[rightIndex]?.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
          return {
            background: `linear-gradient(to right, ${leftColor} 50%, ${rightColor} 50%)`,
            color: seatTextColor,
          };
        })()
      : { backgroundColor: seatColor, color: seatTextColor };
    const canTossCards = !!sendTableEvent && !!myPlayer && myPlayer.hand.length > 0 && !isMe;
    const tossProps = getSeatPillTossProps({
      playerId: player.id,
      playerName: player.name,
      isMe,
      selfAriaLabel: `Your seat, ${player.totalScore} points`,
      seatLeft: seatLayout.seatLeft,
      seatTop: seatLayout.seatTop,
    });
    return (
      <button
        type="button"
        ref={shouldMeasure ? setSeatPillElement : undefined}
        onClick={tossProps.onClick}
        disabled={!canTossCards}
        className={`radial-seatPill card-toss-seatPillButton ${seatPillStateClass} ${isMe ? 'radial-seatPill--me' : ''}`}
        aria-label={tossProps['aria-label']}
      >
        <div className="radial-seatPillTop" style={pillTopStyle}>
          <RadialSeatName
            name={`${isMe ? 'You' : player.name} (${player.totalScore})`}
            textColor={seatTextColor}
          />
        </div>
      </button>
    );
  };

  return (
    <div ref={boardRef} className={`twelve-board radial-board radial-board--players-${state.players.length} relative space-y-3 sm:space-y-4`}>
      <DealAnimationLayer flights={deal.flights} dealCenter={deal.dealCenter} remaining={deal.flights.length} />
      {showDevBestCardsButton && (
        <button
          type="button"
          onClick={devGiveBestCards}
          className="absolute right-3 top-3 z-20 rounded-md border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/30 cursor-pointer"
        >
          Dev: best cards
        </button>
      )}
      <CardTossLayers
        cardTossBursts={cardTossBursts}
        seatCardSplats={seatCardSplats}
        cardSplats={cardSplats}
      />
      <div ref={tableRef} className={`radial-table radial-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`radial-seat ${layout.relativeIndex === 0 ? 'radial-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            <div className={`twelve-seatStack ${isHandZoomed ? 'twelve-seatStack--zoom' : ''}`}>
              <div className="twelve-seatPillCluster">
                {layout.player.id !== myId && renderOpponentHandFan(layout.player)}
                {renderSeatPill(layout, layout.relativeIndex === 0)}
              </div>
              <div className="twelve-pileRow">
                {layout.player.frontPiles.map((pile, pileIndex) => {
                  const playable = getPilePlayableCard(pile);
                  const canPlayPile =
                    layout.player.id === myId &&
                    canUseActionButtons &&
                    !!playable &&
                    myIndex >= 0 &&
                    isLegalPlay(state, myIndex, playable.card, 'pile', pileIndex);
                  const bottomShown =
                    !!pile.bottomCard && deal.isExtraRevealed(`${layout.player.id}-pile-${pileIndex}-bottom`);
                  const topShown =
                    !!pile.topCard && deal.isExtraRevealed(`${layout.player.id}-pile-${pileIndex}-top`);
                  const pileBottomKey = getPileBottomKey(layout.player.id, pileIndex);
                  const skipPileFlipAnim =
                    reduceMotion === true || pileSkipFlipAnim.has(pileBottomKey);
                  return (
                    <button
                      key={`${layout.player.id}-pile-${pileIndex}`}
                      type="button"
                      onClick={() => playPileCard(pileIndex)}
                      disabled={!canPlayPile}
                      className="twelve-pileButton"
                      aria-label={`Pile ${pileIndex + 1}`}
                    >
                      <div className="twelve-pileBottom">
                        {bottomShown ? (
                          <TwelvePileBottomCard
                            key={`${pileBottomKey}-${pile.bottomCard!.suit}-${pile.bottomCard!.rank}`}
                            card={pile.bottomCard!}
                            faceUp={pile.bottomFaceUp}
                            disabled={!canPlayPile}
                            skipFlipAnim={skipPileFlipAnim}
                          />
                        ) : (
                          <div className="twelve-pilePlaceholder" />
                        )}
                      </div>
                      {topShown && (
                        <div className={`twelve-pileTop ${bottomShown ? 'twelve-pileTop--stacked' : ''}`}>
                          <CardFace card={pile.topCard!} disabled={!canPlayPile} compact />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div className={`radial-center ${isHandZoomed ? 'radial-center--zoom' : ''}`}>
          <div className="radial-centerGrid">
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
                  className={`radial-slot ${trickEntry ? 'radial-slot--filled' : 'radial-slot--empty'}`}
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
                        exit={{ x: trickExitOffset.x, y: trickExitOffset.y, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className={`radial-slotCard ${isWinningCard ? 'radial-slotCard--winner' : ''}`}
                      >
                        <div className="radial-slotCardInner">
                          <CardFace card={trickEntry.card} compact />
                        </div>
                      </motion.div>
                    ) : (
                      <div key={`placeholder-${layout.relativeIndex}`} className="radial-slotPlaceholder" />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="twelve-statusBlock">
        <div className="radial-headsUp" aria-live="polite">
          <p
            className={`radial-headsUpText ${state.phase === 'round-end' ? 'radial-headsUpText--roundEnd' : ''} ${hasActionButtons ? 'twelve-headsUpText--withAction' : ''}`}
            aria-label={state.phase === 'round-end' ? state.roundSummary : undefined}
          >
            {headsUpContent ?? '\u00a0'}
          </p>
        </div>
        <div className="radial-actionRow twelve-actionRow" aria-hidden={!hasActionButtons}>
          {hasActionButtons && (
            <div className="twelve-actionPanel">
              {showSetTrumpActions && (
                <div className="twelve-actionGroup">
                  <span className="twelve-actionLabel">Set Trump</span>
                  <div className="twelve-actionButtons">
                    {myRoyalSuits.map((suit) => (
                      <button
                        key={`set-${suit}`}
                        type="button"
                        disabled={!canSetTrump}
                        onClick={() => setTrump(suit)}
                        className="twelve-actionButton"
                      >
                        <span className={SUIT_COLORS[suit]}>{SUIT_SYMBOLS[suit]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showCallTjogActions && (
                <div className="twelve-actionGroup">
                  <span className="twelve-actionLabel">Call Tjog</span>
                  <div className="twelve-actionButtons">
                    {myTjogSuits.map((suit) => (
                      <button
                        key={`tjog-${suit}`}
                        type="button"
                        disabled={!canCallTjog}
                        onClick={() => callTjog(suit)}
                        className="twelve-actionButton"
                      >
                        <span className={SUIT_COLORS[suit]}>{SUIT_SYMBOLS[suit]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(canCallHalfMan || canCallFullMan) && (
                <div className="twelve-actionGroup">
                  <span className="twelve-actionLabel">Man</span>
                  <div className="twelve-actionButtons">
                    {canCallHalfMan && (
                      <button
                        type="button"
                        disabled={!canCallHalfMan}
                        onClick={callHalfMan}
                        className="twelve-actionButton"
                      >
                        6
                      </button>
                    )}
                    {canCallFullMan && (
                      <button
                        type="button"
                        disabled={!canCallFullMan}
                        onClick={callFullMan}
                        className="twelve-actionButton"
                      >
                        12
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {myPlayer && (
        <div className="space-y-3">
          <div ref={handContainerRef} className={`radial-hand ${isHandZoomed ? 'radial-hand--zoom' : ''}`}>
            <div
              className={`radial-handSpread ${isThrowingCards ? 'card-toss-handSpread--hidden' : ''}`}
              style={{
                width: `${handLayout.spreadWidth}px`,
                height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                transition: 'width 0.16s ease',
              }}
            >
              {visibleHand.map((card, i) => {
                const canPlay =
                  canUseActionButtons &&
                  myIndex >= 0 &&
                  isLegalPlay(state, myIndex, card, 'hand');
                const isDisabled = !canPlay;
                const isLast = i === visibleHand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;
                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}`}
                    type="button"
                    initial={deal.isDealing ? { scale: 0.6, opacity: 0 } : { y: 50, opacity: 0 }}
                    animate={deal.isDealing ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }}
                    transition={deal.isDealing ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : { delay: i * 0.02 }}
                    onClick={() => playHandCard(card)}
                    disabled={isDisabled}
                    className="radial-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                    aria-label={`Play ${rankDisplay(card.rank)} of ${card.suit}`}
                  >
                    <span
                      className={`radial-handCardWrap ${canPlay ? 'radial-handCardWrap--active' : ''}`}
                      style={{ width: `${handLayout.cardWidth}px`, height: `${handLayout.cardHeight}px` }}
                    >
                      <CardFace card={card} disabled={state.phase === 'playing' && isDisabled} />
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
