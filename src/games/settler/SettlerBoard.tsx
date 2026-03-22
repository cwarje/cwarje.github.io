import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  DEFAULT_BOARD_GRAPH,
  boardViewBox,
  defaultPortDockGap,
  flatTopHexPath,
  portDockAnchor,
  type EdgeLayout,
} from './layout';
import { portDockVertexIdSet as computePortDockVertexSet, portsFromState } from './ports';
import type { DevCard, SettlerState, Resource, Terrain } from './types';
import {
  COSTS,
  DEV_CARD_COST,
  emptyHand,
  MAX_CITIES_PER_PLAYER,
  RESOURCE_EMOJI,
  RESOURCE_LIST,
  TERRAIN_EMOJI,
  totalDevCardCount,
  VP_TO_WIN,
  type ResourceHand,
} from './types';
import {
  countPlayerCities,
  getLegalRoadEdgesForPlayer,
  getLegalSettlementVertices,
  legalMaritimeRatiosForGive,
  victoryPoints,
  visibleVictoryPoints,
} from './logic';
import {
  Dice,
  faceOrientations,
  getForwardRotationDelta,
  positiveModulo,
  type CubeOrientation,
  type DiceValue,
} from '../../components/Dice';
import { PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import type { PlayerColor } from '../../networking/types';

/**
 * Settlers board UI: renders `SettlerState`, sends `SettlerAction` through `onAction`, and drives
 * highlights/overlays from `phase` and turn order. Board geometry is in layout.ts; legality and
 * scoring live in logic.ts.
 */
const graph = DEFAULT_BOARD_GRAPH;

function resourceHandToTradePartial(h: ResourceHand): Partial<Record<Resource, number>> {
  const o: Partial<Record<Resource, number>> = {};
  for (const r of RESOURCE_LIST) {
    if (h[r] > 0) o[r] = h[r];
  }
  return o;
}

function sumResourceHand(h: ResourceHand): number {
  let n = 0;
  for (const r of RESOURCE_LIST) n += h[r];
  return n;
}

/** Sidebar dev-card chips: stable label order for skimming hands at a glance. */
const DEV_CARD_TAG_ORDER: { key: DevCard; label: string }[] = [
  { key: 'knight', label: 'Knight' },
  { key: 'victory-point', label: 'VP' },
  { key: 'road-building', label: 'Road' },
  { key: 'year-of-plenty', label: 'Plenty' },
  { key: 'monopoly', label: 'Monopoly' },
];

/** Unicode die faces U+2680–U+2685 (same glyphs as action log rolls in logic). */
const ACTION_LOG_DIE_FACE = /[\u2680-\u2685]/;

/** Max lines appended in one roll (roll + one `got …` per player); avoids hiding on large log snapshots. */
const MAX_ROLL_LOG_APPEND = 24;

/** Enlarge die characters inside plain-text log lines for readability. */
function renderActionLogText(text: string): ReactNode {
  const segments = text.split(/([\u2680-\u2685])/g);
  return segments.map((seg, i) => {
    if (seg.length === 1 && ACTION_LOG_DIE_FACE.test(seg)) {
      return (
        <span
          key={i}
          className="inline-block text-[2rem] leading-none align-[-0.12em] mx-0.5"
        >
          {seg}
        </span>
      );
    }
    return <span key={i}>{seg}</span>;
  });
}

/** SVG fill/stroke per terrain; fills reference gradients defined under `<defs>`. */
const TERRAIN_STYLE: Record<Terrain, { fill: string; stroke: string }> = {
  wood: { fill: 'url(#settlerWood)', stroke: '#14532d' },
  brick: { fill: 'url(#settlerBrick)', stroke: '#7f1d1d' },
  sheep: { fill: 'url(#settlerSheep)', stroke: '#166534' },
  wheat: { fill: 'url(#settlerWheat)', stroke: '#a16207' },
  ore: { fill: 'url(#settlerOre)', stroke: '#334155' },
  desert: { fill: 'url(#settlerDesert)', stroke: '#92400e' },
};

interface SettlerBoardProps {
  state: unknown;
  myId: string;
  onAction: (payload: unknown) => void;
}

/** After toggling a build button, the next legal board click completes that build (main phase). */
type BuildTapMode = 'none' | 'road' | 'settlement' | 'city';
const RESOURCE_HAND_GAP = 3;
/** Drawable hand width inside padded column (`min(100%, 22rem)` − horizontal `px-3`). */
const SETTLER_HAND_LAYOUT_WIDTH = 328;
const RESOURCE_CARD_WIDTH = 52;
const RESOURCE_CARD_HEIGHT = 76;

interface ResourceHandGroup {
  resource: Resource;
  count: number;
  cards: Resource[];
}

interface ResourceHandLayout {
  cardWidth: number;
  cardHeight: number;
  step: number;
  spreadWidth: number;
  selectedLift: number;
}

/** Fan overlapping resource cards to fit the hand column; step shrinks when many cards share a column. */
function getResourceHandLayout(cardCount: number, slotWidth: number): ResourceHandLayout {
  const available = Math.max(slotWidth - 6, 40);
  const cardWidth = RESOURCE_CARD_WIDTH;
  const cardHeight = RESOURCE_CARD_HEIGHT;
  const defaultStep = Math.round(cardWidth * 0.58);
  const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
  const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
  const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
  return {
    cardWidth,
    cardHeight,
    step,
    spreadWidth,
    selectedLift: 8,
  };
}

function resourceLabel(r: Resource): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function expandBuildCost(cost: Partial<Record<Resource, number>>): Resource[] {
  const out: Resource[] = [];
  for (const r of RESOURCE_LIST) {
    const n = cost[r] ?? 0;
    for (let i = 0; i < n; i++) out.push(r);
  }
  return out;
}

/**
 * Ordered “payment” preview for the build-cost tooltip: each card in `cards` consumes one matching
 * resource from `hand` in RESOURCE_LIST order, so multi-resource costs show which slice is short.
 */
function costPreviewAffordableFlags(cards: Resource[], hand: ResourceHand): boolean[] {
  const remaining: ResourceHand = { ...hand };
  return cards.map((r) => {
    if (remaining[r] > 0) {
      remaining[r] -= 1;
      return true;
    }
    return false;
  });
}

const ROAD_COST_CARDS = expandBuildCost(COSTS.road);
const SETTLEMENT_COST_CARDS = expandBuildCost(COSTS.settlement);
const CITY_COST_CARDS = expandBuildCost(COSTS.city);
const DEV_CARD_COST_CARDS = expandBuildCost(DEV_CARD_COST);

/** Pips under the number token (standard Catan-style pip count for 2–12). */
function tokenPipCount(token: number): number {
  return Math.max(1, 6 - Math.abs(7 - token));
}

function canAfford(h: SettlerState['players'][0]['hand'], cost: Partial<Record<Resource, number>>): boolean {
  for (const r of RESOURCE_LIST) {
    if (h[r] < (cost[r] ?? 0)) return false;
  }
  return true;
}

/** Initial dice pose before any roll (face 1) — avoids a spin on first mount. */
function createNeutralOrientations(): [CubeOrientation, CubeOrientation] {
  const o = faceOrientations[1];
  return [{ ...o }, { ...o }];
}

/** Add full spins plus shortest twist toward `target` so dice animate when values change. */
function spinTowardFace(previous: CubeOrientation, target: CubeOrientation): CubeOrientation {
  const xSpins = (Math.floor(Math.random() * 2) + 2) * 360;
  const ySpins = (Math.floor(Math.random() * 2) + 3) * 360;
  return {
    x:
      previous.x +
      xSpins +
      getForwardRotationDelta(positiveModulo(previous.x, 360), positiveModulo(target.x, 360)),
    y:
      previous.y +
      ySpins +
      getForwardRotationDelta(positiveModulo(previous.y, 360), positiveModulo(target.y, 360)),
  };
}

/**
 * Shown only on the **current turn** player row in the sidebar. Before rolling: “Roll dice” for the
 * local player in `pre-roll`. After `roll`: two 3D dice; first paint snaps to faces, later changes
 * run a short spin (`isFirstDiceEffect` / `prevDiceRef`).
 */
function SettlerTurnDiceSlot({
  dice,
  showRollButton,
  onRoll,
  onRollAnimationSettled,
}: {
  dice: { d1: number; d2: number } | null;
  showRollButton: boolean;
  onRoll: () => void;
  /** Fires after the spin finishes, or immediately when faces snap without a CSS transition. */
  onRollAnimationSettled?: () => void;
}) {
  const [isRolling, setIsRolling] = useState(false);
  const [orientations, setOrientations] = useState<[CubeOrientation, CubeOrientation]>(() =>
    createNeutralOrientations(),
  );
  const prevDiceRef = useRef<{ d1: number; d2: number } | null>(null);
  const isFirstDiceEffect = useRef(true);

  useEffect(() => {
    if (!dice) {
      prevDiceRef.current = null;
      setIsRolling(false);
      setOrientations(createNeutralOrientations());
      if (isFirstDiceEffect.current) isFirstDiceEffect.current = false;
      return;
    }

    const d1 = dice.d1 as DiceValue;
    const d2 = dice.d2 as DiceValue;
    const prev = prevDiceRef.current;

    if (isFirstDiceEffect.current) {
      isFirstDiceEffect.current = false;
      setIsRolling(false);
      setOrientations([{ ...faceOrientations[d1] }, { ...faceOrientations[d2] }]);
      prevDiceRef.current = { d1, d2 };
      queueMicrotask(() => {
        onRollAnimationSettled?.();
      });
      return;
    }

    if (prev === null) {
      setIsRolling(true);
      setOrientations((prevO) => [
        spinTowardFace(prevO[0], faceOrientations[d1]),
        spinTowardFace(prevO[1], faceOrientations[d2]),
      ]);
      return;
    }

    if (prev.d1 !== d1 || prev.d2 !== d2) {
      setIsRolling(true);
      setOrientations((prevO) => [
        spinTowardFace(prevO[0], faceOrientations[d1]),
        spinTowardFace(prevO[1], faceOrientations[d2]),
      ]);
      return;
    }
  }, [dice, onRollAnimationSettled]);

  const handleRollEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'transform' || !isRolling || !dice) return;
    prevDiceRef.current = { d1: dice.d1, d2: dice.d2 };
    setIsRolling(false);
    onRollAnimationSettled?.();
  };

  const diceSize = '1.9rem';

  return (
    <div className="flex h-full min-h-0 shrink-0 items-center justify-end">
      {showRollButton && !dice && (
        <button
          type="button"
          onClick={onRoll}
          className="rounded-lg bg-amber-600 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-amber-500"
        >
          Roll dice
        </button>
      )}
      {dice && (
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-slate-900/80 px-1 py-0.5">
          <Dice
            orientation={orientations[0]}
            rolling={isRolling}
            disabled
            size={diceSize}
            onTransitionEnd={handleRollEnd}
          />
          <Dice orientation={orientations[1]} rolling={isRolling} disabled size={diceSize} />
        </div>
      )}
    </div>
  );
}

export default function SettlerBoard({ state, myId, onAction }: SettlerBoardProps) {
  const s = state as SettlerState;
  const myIndex = s.players.findIndex((p) => p.id === myId);
  const myPlayer = myIndex >= 0 ? s.players[myIndex] : null;

  /** Local-only UI: placement mode, discard card picks, maritime trade popup, build-button tooltip anchor + position. */
  const [buildTap, setBuildTap] = useState<BuildTapMode>('none');
  const [discardSlotSelection, setDiscardSlotSelection] = useState<
    Partial<Record<Resource, Set<number>>>
  >({});
  const [tradeGive, setTradeGive] = useState<Resource>('wood');
  const [tradeReceive, setTradeReceive] = useState<Resource>('brick');
  const [tradeRatio, setTradeRatio] = useState<2 | 3 | 4>(4);
  const [tradePopupOpen, setTradePopupOpen] = useState(false);
  const [domesticOpen, setDomesticOpen] = useState(false);
  const [domesticTargetId, setDomesticTargetId] = useState<string>('');
  const [domesticGive, setDomesticGive] = useState<ResourceHand>(() => emptyHand());
  const [domesticWant, setDomesticWant] = useState<ResourceHand>(() => emptyHand());
  const actionLogRef = useRef<HTMLDivElement>(null);
  /** Hide action-log lines from this index until the dice spin ends (full `actionLog` stays in state). */
  const [rollLogHiddenFromIndex, setRollLogHiddenFromIndex] = useState<number | null>(null);
  const prevActionLogLenRef = useRef(s.actionLog?.length ?? 0);
  const roadBtnRef = useRef<HTMLButtonElement>(null);
  const settlementBtnRef = useRef<HTMLButtonElement>(null);
  const cityBtnRef = useRef<HTMLButtonElement>(null);
  const devCardBtnRef = useRef<HTMLButtonElement>(null);
  const [buildCostTip, setBuildCostTip] = useState<{
    x: number;
    y: number;
    cards: Resource[];
  } | null>(null);
  /** Two-step placement: select vertex/edge, then confirm with the check control. */
  const [pendingVertexId, setPendingVertexId] = useState<number | null>(null);
  const [pendingEdgeId, setPendingEdgeId] = useState<string | null>(null);
  /** Bumps on an interval while `turnDeadlineAt` is active so the countdown repaints. */
  const [, setTurnTimerTick] = useState(0);

  const viewBox = useMemo(() => boardViewBox(graph, 72), []);

  const ports = useMemo(() => portsFromState(s), [s]);
  const portCoastalEdgeIds = useMemo(() => Object.keys(ports), [ports]);
  const portDockVertexIdSet = useMemo(() => computePortDockVertexSet(graph, ports), [ports]);

  useEffect(() => {
    if (s.phase !== 'main-build') {
      setTradePopupOpen(false);
      setDomesticOpen(false);
    }
  }, [s.phase]);

  const legalMaritimeRatios = useMemo((): (2 | 3 | 4)[] => {
    if (!myPlayer) return [4];
    return legalMaritimeRatiosForGive(s, myId, tradeGive);
  }, [s, myId, myPlayer, tradeGive]);

  useEffect(() => {
    setTradeRatio((r) => (legalMaritimeRatios.includes(r) ? r : legalMaritimeRatios[0] ?? 4));
  }, [legalMaritimeRatios]);

  /**
   * Whether this client may act now: setup/pre-roll/main follow `currentPlayerIndex`; discard uses
   * `discardQueue[0]`; robber steal uses the roller (`currentPlayerIndex`), not the victim.
   */
  const isMyTurn = useMemo(() => {
    if (s.phase === 'discard') return s.discardQueue[0] === myId;
    if (s.phase === 'robber-steal') return s.players[s.currentPlayerIndex]?.id === myId;
    if (s.phase === 'setup-settlement' || s.phase === 'setup-road') {
      return s.players[s.currentPlayerIndex]?.id === myId;
    }
    return myIndex >= 0 && s.currentPlayerIndex === myIndex;
  }, [s, myId, myIndex]);

  useEffect(() => {
    if (s.phase !== 'main-build' || !isMyTurn) {
      setBuildCostTip(null);
    }
  }, [s.phase, isMyTurn]);

  useEffect(() => {
    if (!isMyTurn) {
      setPendingVertexId(null);
      setPendingEdgeId(null);
    }
  }, [isMyTurn]);

  useEffect(() => {
    const vertexPlacementActive =
      s.phase === 'setup-settlement' ||
      (s.phase === 'main-build' && (buildTap === 'settlement' || buildTap === 'city'));
    const edgePlacementActive =
      s.phase === 'setup-road' ||
      (s.phase === 'main-build' && (buildTap === 'road' || s.roadBuildingRemaining > 0));
    if (!vertexPlacementActive) setPendingVertexId(null);
    if (!edgePlacementActive) setPendingEdgeId(null);
  }, [s.phase, buildTap, s.roadBuildingRemaining]);

  /** Vertex ids the board may highlight for settlement placement (setup vs main + buildTap). */
  const legalSettlements = useMemo(() => {
    if (!myPlayer || !isMyTurn) return [];
    if (s.phase === 'setup-settlement') {
      return getLegalSettlementVertices(s, myId, true);
    }
    if (s.phase === 'main-build' && buildTap === 'settlement') {
      return getLegalSettlementVertices(s, myId, false);
    }
    return [];
  }, [s, myId, myPlayer, isMyTurn, buildTap]);

  /** Edge ids for road placement: setup road from `pendingRoadFromVertex`, or main paid/free roads. */
  const legalRoads = useMemo(() => {
    if (!myPlayer || !isMyTurn) return [];
    if (s.phase === 'setup-road') {
      return getLegalRoadEdgesForPlayer(s, myId, true, s.pendingRoadFromVertex);
    }
    if (
      s.phase === 'main-build' &&
      (buildTap === 'road' || s.roadBuildingRemaining > 0)
    ) {
      return getLegalRoadEdgesForPlayer(s, myId, false, null);
    }
    return [];
  }, [s, myId, myPlayer, isMyTurn, buildTap]);

  /** Own settlements eligible to upgrade when city build mode is active. */
  const legalCityVertices = useMemo(() => {
    if (!myPlayer || !isMyTurn || s.phase !== 'main-build' || buildTap !== 'city') return [];
    if (countPlayerCities(s, myId) >= MAX_CITIES_PER_PLAYER) return [];
    return Object.entries(s.settlements)
      .filter(([, piece]) => piece.playerId === myId && piece.kind === 'settlement')
      .map(([vid]) => Number(vid));
  }, [s, myId, myPlayer, isMyTurn, buildTap]);

  useEffect(() => {
    setPendingVertexId((pv) => {
      if (pv === null) return null;
      if (s.phase === 'setup-settlement' && legalSettlements.includes(pv)) return pv;
      if (s.phase === 'main-build' && buildTap === 'settlement' && legalSettlements.includes(pv)) {
        return pv;
      }
      if (s.phase === 'main-build' && buildTap === 'city' && legalCityVertices.includes(pv)) {
        return pv;
      }
      return null;
    });
  }, [s.phase, buildTap, legalSettlements, legalCityVertices]);

  useEffect(() => {
    setPendingEdgeId((pe) => (pe !== null && legalRoads.includes(pe) ? pe : null));
  }, [legalRoads]);

  /** Toolbar + trade affordances (also used to dim highlights when nothing is legal). */
  const canBuyRoad = Boolean(
    myPlayer &&
      canAfford(myPlayer.hand, COSTS.road) &&
      getLegalRoadEdgesForPlayer(s, myId, false, null).length > 0
  );
  const canBuySettlement = Boolean(
    myPlayer &&
      canAfford(myPlayer.hand, COSTS.settlement) &&
      getLegalSettlementVertices(s, myId, false).length > 0
  );
  const canBuyCity = Boolean(
    myPlayer &&
      countPlayerCities(s, myId) < MAX_CITIES_PER_PLAYER &&
      canAfford(myPlayer.hand, COSTS.city) &&
      Object.values(s.settlements).some((piece) => piece.playerId === myId && piece.kind === 'settlement')
  );
  const canMaritimeTrade = Boolean(
    myPlayer &&
      s.phase === 'main-build' &&
      s.roadBuildingRemaining === 0 &&
      RESOURCE_LIST.some((give) => {
        const legal = legalMaritimeRatiosForGive(s, myId, give);
        const minR = legal[0];
        if (minR === undefined || myPlayer.hand[give] < minR) return false;
        return RESOURCE_LIST.some((recv) => recv !== give && s.bank[recv] > 0);
      })
  );
  const canBuyDev = Boolean(
    myPlayer && s.devDeck.length > 0 && canAfford(myPlayer.hand, DEV_CARD_COST)
  );
  /**
   * Maritime panel claims the bottom-left stack so it is not covered by other phase panels; other
   * overlays use `!stackOverlayOpen` so only one stacked panel is interactive at a time.
   */
  const maritimeTradeOverlayOpen =
    tradePopupOpen && s.phase === 'main-build' && isMyTurn && Boolean(myPlayer);
  const domesticTradeOverlayOpen =
    domesticOpen && s.phase === 'main-build' && isMyTurn && Boolean(myPlayer);
  const pendingInboundTrade =
    Boolean(myPlayer) &&
    s.phase === 'main-build' &&
    s.pendingDomesticTrade !== null &&
    s.pendingDomesticTrade.targetId === myId;
  const stackOverlayOpen =
    maritimeTradeOverlayOpen || domesticTradeOverlayOpen || pendingInboundTrade;

  /**
   * Board vertex clicks → pending selection only; confirm dispatches place/build actions.
   */
  const onVertexClick = useCallback(
    (vid: number) => {
      if (!isMyTurn) return;
      if (s.phase === 'setup-settlement' && legalSettlements.includes(vid)) {
        setPendingEdgeId(null);
        setPendingVertexId(vid);
        return;
      }
      if (s.phase === 'main-build' && buildTap === 'settlement' && legalSettlements.includes(vid)) {
        setPendingEdgeId(null);
        setPendingVertexId(vid);
        return;
      }
      if (s.phase === 'main-build' && buildTap === 'city' && legalCityVertices.includes(vid)) {
        setPendingEdgeId(null);
        setPendingVertexId(vid);
      }
    },
    [isMyTurn, s.phase, legalSettlements, legalCityVertices, buildTap]
  );

  const confirmPendingVertex = useCallback(() => {
    if (pendingVertexId === null) return;
    const vid = pendingVertexId;
    if (s.phase === 'setup-settlement' && legalSettlements.includes(vid)) {
      onAction({ type: 'place-settlement', vertexId: vid });
      setPendingVertexId(null);
      return;
    }
    if (s.phase === 'main-build' && buildTap === 'settlement' && legalSettlements.includes(vid)) {
      onAction({ type: 'build-settlement', vertexId: vid });
      setBuildTap('none');
      setPendingVertexId(null);
      return;
    }
    if (s.phase === 'main-build' && buildTap === 'city' && legalCityVertices.includes(vid)) {
      onAction({ type: 'build-city', vertexId: vid });
      setBuildTap('none');
      setPendingVertexId(null);
    }
  }, [
    pendingVertexId,
    s.phase,
    buildTap,
    legalSettlements,
    legalCityVertices,
    onAction,
  ]);

  /**
   * Board edge clicks → pending selection only; confirm dispatches place/build actions.
   */
  const onEdgeClick = useCallback(
    (eid: string) => {
      if (!isMyTurn) return;
      if (s.phase === 'setup-road' && legalRoads.includes(eid)) {
        setPendingVertexId(null);
        setPendingEdgeId(eid);
        return;
      }
      if (s.phase === 'main-build' && buildTap === 'road' && legalRoads.includes(eid)) {
        setPendingVertexId(null);
        setPendingEdgeId(eid);
        return;
      }
      if (s.phase === 'main-build' && s.roadBuildingRemaining > 0 && legalRoads.includes(eid)) {
        setPendingVertexId(null);
        setPendingEdgeId(eid);
      }
    },
    [isMyTurn, s.phase, s.roadBuildingRemaining, legalRoads, buildTap]
  );

  const confirmPendingEdge = useCallback(() => {
    if (pendingEdgeId === null) return;
    const eid = pendingEdgeId;
    if (s.phase === 'setup-road' && legalRoads.includes(eid)) {
      onAction({ type: 'place-road', edgeId: eid });
      setPendingEdgeId(null);
      return;
    }
    if (s.phase === 'main-build' && buildTap === 'road' && legalRoads.includes(eid)) {
      onAction({ type: 'build-road', edgeId: eid });
      setBuildTap('none');
      setPendingEdgeId(null);
      return;
    }
    if (s.phase === 'main-build' && s.roadBuildingRemaining > 0 && legalRoads.includes(eid)) {
      onAction({ type: 'place-free-road', edgeId: eid });
      setPendingEdgeId(null);
    }
  }, [pendingEdgeId, s.phase, s.roadBuildingRemaining, buildTap, legalRoads, onAction]);

  const showVertexConfirm = useMemo(() => {
    if (pendingVertexId === null) return false;
    const vid = pendingVertexId;
    if (s.phase === 'setup-settlement' && legalSettlements.includes(vid)) return true;
    if (s.phase === 'main-build' && buildTap === 'settlement' && legalSettlements.includes(vid)) {
      return true;
    }
    if (s.phase === 'main-build' && buildTap === 'city' && legalCityVertices.includes(vid)) {
      return true;
    }
    return false;
  }, [pendingVertexId, s.phase, buildTap, legalSettlements, legalCityVertices]);

  const showEdgeConfirm = useMemo(
    () => pendingEdgeId !== null && legalRoads.includes(pendingEdgeId),
    [pendingEdgeId, legalRoads]
  );

  const pendingVertexLayout = useMemo(() => {
    if (!showVertexConfirm || pendingVertexId === null) return null;
    return graph.vertices[pendingVertexId] ?? null;
  }, [showVertexConfirm, pendingVertexId]);

  const pendingEdgeMidpoint = useMemo(() => {
    if (!showEdgeConfirm || pendingEdgeId === null) return null;
    const e = graph.edgeById.get(pendingEdgeId);
    if (!e) return null;
    const va = graph.vertices[e.a];
    const vb = graph.vertices[e.b];
    if (!va || !vb) return null;
    return { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 };
  }, [showEdgeConfirm, pendingEdgeId]);

  /** Land hex click in robber-move → move-robber (desert allowed; current hex ignored). */
  const onHexClick = useCallback(
    (hi: number) => {
      if (s.phase !== 'robber-move' || !isMyTurn) return;
      if (hi === s.robberHexIndex) return;
      onAction({ type: 'move-robber', hexIndex: hi });
    },
    [s.phase, s.robberHexIndex, isMyTurn, onAction]
  );

  /** Fixed tooltip above build buttons; uses viewport coords → rendered via portal to document.body. */
  const showBuildCostTip = useCallback(
    (ref: RefObject<HTMLButtonElement | null>, cards: Resource[]) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBuildCostTip({ x: r.left + r.width / 2, y: r.top, cards });
    },
    []
  );

  const hideBuildCostTip = useCallback(() => {
    setBuildCostTip(null);
  }, []);

  const buildCostTipAffordableFlags = useMemo(() => {
    if (!buildCostTip) return null;
    const hand = myPlayer?.hand ?? emptyHand();
    return costPreviewAffordableFlags(buildCostTip.cards, hand);
  }, [buildCostTip, myPlayer]);

  /** Discard flow: per-slot indices (resource + card index) so selection stays stable if counts change. */
  const discardNeed = s.phase === 'discard' && s.discardQueue[0] === myId ? s.discardRequired[myId] ?? 0 : 0;
  const discardTotal = useMemo(
    () => RESOURCE_LIST.reduce((acc, r) => acc + (discardSlotSelection[r]?.size ?? 0), 0),
    [discardSlotSelection],
  );
  const discardCardsPayload = useMemo(() => {
    const cards: Partial<Record<Resource, number>> = {};
    for (const r of RESOURCE_LIST) {
      const n = discardSlotSelection[r]?.size ?? 0;
      if (n > 0) cards[r] = n;
    }
    return cards;
  }, [discardSlotSelection]);

  const isDiscardSelectingHand = s.phase === 'discard' && s.discardQueue[0] === myId;

  /** String signature of hand counts so discard selection prunes invalid indices without listing myPlayer in deps. */
  const myHandSig = useMemo(
    () => (myPlayer ? RESOURCE_LIST.map((r) => myPlayer.hand[r]).join(',') : ''),
    [myPlayer],
  );

  useEffect(() => {
    if (!isDiscardSelectingHand) {
      setDiscardSlotSelection({});
    }
  }, [isDiscardSelectingHand]);

  useEffect(() => {
    if (!isDiscardSelectingHand || !myPlayer) return;
    setDiscardSlotSelection((prev) => {
      let changed = false;
      const next: Partial<Record<Resource, Set<number>>> = {};
      for (const r of RESOURCE_LIST) {
        const max = myPlayer.hand[r];
        const old = prev[r];
        if (!old || old.size === 0) continue;
        const filtered = new Set<number>();
        for (const i of old) {
          if (i < max) filtered.add(i);
          else changed = true;
        }
        if (filtered.size > 0) next[r] = filtered;
        else if (old.size > 0) changed = true;
      }
      return changed ? next : prev;
    });
    // myHandSig tracks hand counts; myPlayer is read from the latest render when this runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- myPlayer omitted; stable hand counts are in myHandSig
  }, [isDiscardSelectingHand, myHandSig]);

  /** Toggle one physical card slot for discard; caps selection at discardNeed. */
  const toggleDiscardSlot = useCallback((resource: Resource, index: number) => {
    setDiscardSlotSelection((prev) => {
      const cur = prev[resource] ?? new Set<number>();
      const nextCur = new Set(cur);
      if (nextCur.has(index)) {
        nextCur.delete(index);
      } else {
        const total = RESOURCE_LIST.reduce((acc, r) => acc + (prev[r]?.size ?? 0), 0);
        if (total >= discardNeed) return prev;
        nextCur.add(index);
      }
      if (nextCur.size === 0) {
        const rest = { ...prev };
        delete rest[resource];
        return rest;
      }
      return { ...prev, [resource]: nextCur };
    });
  }, [discardNeed]);

  /** Whose turn the caption should describe: discard actor may differ from currentPlayerIndex. */
  const actorIdForHud = s.phase === 'discard' ? s.discardQueue[0] : s.players[s.currentPlayerIndex]?.id;
  const actorForHud = actorIdForHud ? s.players.find((p) => p.id === actorIdForHud) : null;
  /** Bottom-right status line (aria-live); mirrors phase and whether the local player is the actor. */
  const boardPhaseCaption = useMemo(() => {
    const name = actorForHud?.name ?? 'Player';
    switch (s.phase) {
      case 'setup-settlement':
        return isMyTurn ? `Place a settlement (round ${s.setupRound})` : `${name} is placing a settlement`;
      case 'setup-road':
        return isMyTurn ? 'Place a road' : `${name} is placing a road`;
      case 'pre-roll':
        return isMyTurn ? 'Roll the dice' : `${name} is rolling the dice`;
      case 'discard':
        return isMyTurn ? 'Discard half your hand (7 rolled)' : `${name} must discard`;
      case 'robber-move':
        return isMyTurn ? 'Move the robber' : `${name} is moving the robber`;
      case 'robber-steal':
        return isMyTurn ? 'Steal one resource' : `${name} can steal a resource`;
      case 'main-build':
        return isMyTurn ? 'Your turn' : `${name}'s turn`;
      case 'finished':
        return 'Game over';
      default:
        return '';
    }
  }, [actorForHud, isMyTurn, s.phase, s.setupRound]);

  useEffect(() => {
    if (s.phase === 'finished' || s.turnDeadlineAt == null) return;
    const id = window.setInterval(() => setTurnTimerTick((n) => n + 1), 300);
    return () => clearInterval(id);
  }, [s.phase, s.turnDeadlineAt]);

  const turnDeadlineAt = s.turnDeadlineAt ?? null;
  const showTurnTimer = s.phase !== 'finished' && turnDeadlineAt != null;
  const turnTimerRemainingMs = showTurnTimer ? Math.max(0, turnDeadlineAt - Date.now()) : 0;
  const turnTimerTotalSec = Math.floor(turnTimerRemainingMs / 1000);
  const turnTimerLabel = `${Math.floor(turnTimerTotalSec / 60)}:${(turnTimerTotalSec % 60).toString().padStart(2, '0')}`;
  const turnTimerAriaLabel =
    s.phase === 'pre-roll'
      ? `Time to roll ${turnTimerLabel}`
      : `Turn time remaining ${turnTimerLabel}`;

  const actionLog = s.actionLog ?? [];
  const visibleActionLog =
    rollLogHiddenFromIndex === null ? actionLog : actionLog.slice(0, rollLogHiddenFromIndex);

  const handleRollAnimationSettled = useCallback(() => {
    setRollLogHiddenFromIndex(null);
  }, []);

  useLayoutEffect(() => {
    const log = s.actionLog ?? [];
    const prevLen = prevActionLogLenRef.current;
    if (log.length < prevLen) {
      setRollLogHiddenFromIndex(null);
      prevActionLogLenRef.current = log.length;
      return;
    }
    const delta = log.length - prevLen;
    if (
      delta > 0 &&
      delta <= MAX_ROLL_LOG_APPEND &&
      log[prevLen]?.text.startsWith('rolled ')
    ) {
      setRollLogHiddenFromIndex(prevLen);
    }
    prevActionLogLenRef.current = log.length;
  }, [s.actionLog]);

  useEffect(() => {
    if (s.dice === null) {
      setRollLogHiddenFromIndex(null);
    }
  }, [s.dice]);

  /** Keep action log pinned to newest entry as rows append or deferred roll lines are revealed. */
  useEffect(() => {
    const element = actionLogRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [actionLog.length, rollLogHiddenFromIndex]);
  /** One group per resource type for the hand strip (count duplicates as separate slots for discard UI). */
  const resourceHands = useMemo(() => {
    return RESOURCE_LIST.map((resource) => {
      const count = myPlayer?.hand[resource] ?? 0;
      return {
        resource,
        count,
        cards: Array.from({ length: count }, () => resource),
      } satisfies ResourceHandGroup;
    });
  }, [myPlayer]);
  const totalHandCount = useMemo(
    () => resourceHands.reduce((total, hand) => total + hand.count, 0),
    [resourceHands],
  );
  const visibleResourceHands = useMemo(
    () => resourceHands.filter((hand) => hand.count > 0),
    [resourceHands],
  );
  const miniHands = useMemo(() => {
    const columnCount = Math.max(1, visibleResourceHands.length);
    const slotWidth = Math.max(
      44,
      (SETTLER_HAND_LAYOUT_WIDTH - RESOURCE_HAND_GAP * (columnCount - 1)) / columnCount,
    );
    return visibleResourceHands.map((hand) => ({
      ...hand,
      layout: getResourceHandLayout(hand.count, slotWidth),
    }));
  }, [visibleResourceHands]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gradient-to-b from-sky-900 via-sky-800 to-sky-700 text-white">
      <div className="flex-1 min-h-0 p-2 lg:p-3 flex flex-col gap-2">
        {/* Main layout: board + hand strip (left), fixed-width sidebar (right) on large screens */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 flex flex-col gap-2">
            {/* Board card: SVG is scrollable inside; phase overlays are absolutely positioned on this shell */}
            <div className="relative flex-1 min-h-0 overflow-hidden rounded-2xl border border-white/15 bg-sky-950/45 shadow-2xl">
              <div className="flex h-full min-h-[320px] items-center justify-center overflow-auto p-2 lg:min-h-0">
              <motion.svg
                className="max-w-full max-h-full w-full h-full drop-shadow-2xl"
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
              >
            {/* Shared SVG defs: gradients + filters for terrain fills and number tokens */}
            <defs>
              <linearGradient id="settlerWood" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#166534" />
                <stop offset="100%" stopColor="#052e16" />
              </linearGradient>
              <linearGradient id="settlerBrick" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#b91c1c" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </linearGradient>
              <linearGradient id="settlerSheep" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#15803d" />
              </linearGradient>
              <linearGradient id="settlerWheat" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
              <linearGradient id="settlerOre" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#64748b" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <linearGradient id="settlerDesert" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fde68a" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <radialGradient id="settlerTileGloss" cx="35%" cy="30%" r="80%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.24)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
              <radialGradient id="settlerTokenPaper" cx="40%" cy="32%" r="78%">
                <stop offset="0%" stopColor="#fff9db" />
                <stop offset="100%" stopColor="#f2dfaf" />
              </radialGradient>
              <filter id="settlerTokenShadow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.25" floodColor="#000000" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Hex tiles: clickable only for robber-move (canRob); producing glow from last roll */}
            {graph.hexes.map((cell) => {
              const hi = cell.index;
              const hex = s.hexes[hi];
              if (!hex) return null;
              const st = TERRAIN_STYLE[hex.terrain];
              const token = hex.numberToken;
              const isRobber = hi === s.robberHexIndex;
              const producing = s.lastProductionHexIndices.includes(hi);
              const canRob = s.phase === 'robber-move' && isMyTurn && hi !== s.robberHexIndex;
              const tokenDy = graph.hexSize * 0.32;

              return (
                <g key={hi}>
                  <path
                    d={flatTopHexPath(cell.cx, cell.cy, graph.hexSize)}
                    fill={st.fill}
                    stroke={st.stroke}
                    strokeWidth={2}
                    shapeRendering="geometricPrecision"
                    className={canRob ? 'cursor-pointer' : ''}
                    opacity={canRob ? 0.92 : 1}
                    style={
                      producing
                        ? { filter: 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.55))' }
                        : { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }
                    }
                    onClick={() => onHexClick(hi)}
                  />
                  <path
                    d={flatTopHexPath(cell.cx, cell.cy, graph.hexSize)}
                    fill="url(#settlerTileGloss)"
                    stroke="none"
                    pointerEvents="none"
                    opacity={0.8}
                  />
                  <text
                    x={cell.cx}
                    y={cell.cy - graph.hexSize * 0.38}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={graph.hexSize * 0.58}
                    pointerEvents="none"
                  >
                    {TERRAIN_EMOJI[hex.terrain]}
                  </text>
                  {token != null && (
                    <g filter="url(#settlerTokenShadow)">
                      <circle
                        cx={cell.cx}
                        cy={cell.cy + tokenDy}
                        r={18}
                        fill="url(#settlerTokenPaper)"
                        stroke="#78350f"
                        strokeWidth={2}
                      />
                      <text
                        x={cell.cx}
                        y={cell.cy + tokenDy + 6}
                        textAnchor="middle"
                        className="font-bold"
                        style={{
                          fontSize: 18,
                          fill: token === 6 || token === 8 ? '#991b1b' : '#1e293b',
                        }}
                      >
                        {token}
                      </text>
                      {Array.from({ length: tokenPipCount(token) }).map((_, idx) => {
                        const gap = 3.8;
                        const start = cell.cx - ((tokenPipCount(token) - 1) * gap) / 2;
                        return (
                          <circle
                            key={`pip-${hi}-${idx}`}
                            cx={start + idx * gap}
                            cy={cell.cy + tokenDy + 12}
                            r={1.05}
                            fill={token === 6 || token === 8 ? '#991b1b' : '#334155'}
                          />
                        );
                      })}
                    </g>
                  )}
                  {isRobber && (
                    <g pointerEvents="none">
                      <circle cx={cell.cx} cy={cell.cy + graph.hexSize * 0.55 - 9} r={15} fill="rgba(15,23,42,0.58)" />
                      <text x={cell.cx} y={cell.cy + graph.hexSize * 0.55} textAnchor="middle" fontSize={22}>
                        🏴‍☠️
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Tile borders: one line per graph edge (shared geometry; avoids double strokes / hairline gaps) */}
            {graph.edges.map((e: EdgeLayout) => {
              const va = graph.vertices[e.a];
              const vb = graph.vertices[e.b];
              if (!va || !vb) return null;
              return (
                <line
                  key={`border-${e.id}`}
                  x1={va.x}
                  y1={va.y}
                  x2={vb.x}
                  y2={vb.y}
                  stroke="rgba(15, 23, 42, 0.55)"
                  strokeWidth={1.25}
                  strokeLinecap="butt"
                  pointerEvents="none"
                />
              );
            })}

            {/* Junction dots: one per board vertex (purely decorative; clicks use settlement layer) */}
            {graph.vertices.map((v) => {
              const isDock = portDockVertexIdSet.has(v.id);
              return (
                <circle
                  key={`junction-${v.id}`}
                  cx={v.x}
                  cy={v.y}
                  r={5}
                  fill={isDock ? '#92400e' : '#facc15'}
                  stroke={isDock ? '#451a03' : '#b45309'}
                  strokeWidth={1}
                  pointerEvents="none"
                  style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}
                />
              );
            })}

            {portCoastalEdgeIds.map((eid) => {
              const spec = ports[eid];
              const coastal = graph.edgeById.get(eid);
              if (!spec || !coastal || coastal.hexIndices.length !== 1) return null;
              const va = graph.vertices[coastal.a];
              const vb = graph.vertices[coastal.b];
              if (!va || !vb) return null;
              const label =
                spec.kind === 'generic-3' ? '3:1' : `2:${RESOURCE_EMOJI[spec.resource]}`;
              const gap = defaultPortDockGap(graph);
              const anchor = portDockAnchor(graph, coastal, gap);
              return (
                <g
                  key={`port-${eid}`}
                  transform={`translate(${anchor.x}, ${anchor.y})`}
                  pointerEvents="none"
                >
                  <text
                    x={0}
                    y={-14}
                    textAnchor="middle"
                    fontSize={13}
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                  >
                    ⚓
                  </text>
                  <rect
                    x={-17}
                    y={-6}
                    width={34}
                    height={16}
                    rx={3}
                    fill="rgba(14,165,233,0.45)"
                    stroke="#38bdf8"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={6}
                    textAnchor="middle"
                    className="fill-slate-950 text-[9px] font-bold"
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Roads: colored owner strokes; cyan wide hit-target only when this edge is legal to build */}
            {graph.edges.map((e: EdgeLayout) => {
              const va = graph.vertices[e.a];
              const vb = graph.vertices[e.b];
              if (!va || !vb) return null;
              const owner = s.roads[e.id];
              const ownerPlayer = owner ? s.players.find((p) => p.id === owner) : null;
              const hl = legalRoads.includes(e.id);
              const hlSelected = pendingEdgeId === e.id;
              const strokeCol = ownerPlayer
                ? PLAYER_COLOR_HEX[ownerPlayer.color as PlayerColor]
                : 'transparent';
              return (
                <g key={e.id}>
                  {owner && (
                    <line
                      x1={va.x}
                      y1={va.y}
                      x2={vb.x}
                      y2={vb.y}
                      stroke={strokeCol}
                      strokeWidth={10}
                      strokeLinecap="round"
                      opacity={0.95}
                    />
                  )}
                  {hl && (
                    <line
                      x1={va.x}
                      y1={va.y}
                      x2={vb.x}
                      y2={vb.y}
                      stroke={
                        hlSelected
                          ? 'rgba(251, 191, 36, 0.85)'
                          : 'rgba(56, 189, 248, 0.45)'
                      }
                      strokeWidth={hlSelected ? 20 : 16}
                      strokeLinecap="round"
                      className="cursor-pointer"
                      onClick={() => onEdgeClick(e.id)}
                    />
                  )}
                </g>
              );
            })}

            {/* Settlements / cities + placement ghosts; city upgrade uses extra transparent hit ring */}
            {graph.vertices.map((v) => {
              const piece = s.settlements[v.id];
              const ownerP = piece ? s.players.find((p) => p.id === piece.playerId) : null;
              const ownerHex = ownerP ? PLAYER_COLOR_HEX[ownerP.color as PlayerColor] : '#fff';
              const showGhost =
                isMyTurn &&
                ((s.phase === 'setup-settlement' && legalSettlements.includes(v.id)) ||
                  (s.phase === 'main-build' && buildTap === 'settlement' && legalSettlements.includes(v.id)) ||
                  (s.phase === 'main-build' && buildTap === 'city' && legalCityVertices.includes(v.id)));
              const cityTarget =
                isMyTurn &&
                s.phase === 'main-build' &&
                buildTap === 'city' &&
                piece &&
                piece.playerId === myId &&
                piece.kind === 'settlement' &&
                legalCityVertices.includes(v.id);
              const vertexSelected = pendingVertexId === v.id;
              return (
                <g key={v.id}>
                  {piece && (
                    <>
                      <circle
                        cx={v.x}
                        cy={v.y}
                        r={piece.kind === 'city' ? 16 : 12}
                        fill={ownerHex}
                        stroke="#0f172a"
                        strokeWidth={2}
                      />
                      {piece.kind === 'city' && (
                        <rect
                          x={v.x - 10}
                          y={v.y - 18}
                          width={20}
                          height={10}
                          rx={2}
                          fill={ownerHex}
                          stroke="#0f172a"
                          strokeWidth={1}
                        />
                      )}
                    </>
                  )}
                  {showGhost && (
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r={vertexSelected ? 18 : 16}
                      fill={
                        vertexSelected
                          ? piece
                            ? 'rgba(251, 191, 36, 0.45)'
                            : 'rgba(52, 211, 153, 0.22)'
                          : piece
                            ? 'rgba(251, 191, 36, 0.25)'
                            : 'transparent'
                      }
                      stroke={
                        vertexSelected
                          ? 'rgba(251, 191, 36, 1)'
                          : piece
                            ? 'rgba(251, 191, 36, 0.8)'
                            : 'none'
                      }
                      strokeWidth={vertexSelected ? 3 : piece ? 2 : 0}
                      className="cursor-pointer"
                      onClick={() => onVertexClick(v.id)}
                    />
                  )}
                  {cityTarget && (
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r={vertexSelected ? 20 : 18}
                      fill="transparent"
                      stroke={vertexSelected ? 'rgba(251, 191, 36, 0.95)' : 'none'}
                      strokeWidth={vertexSelected ? 2 : 0}
                      className="cursor-pointer"
                      onClick={() => onVertexClick(v.id)}
                    />
                  )}
                </g>
              );
            })}

            {pendingVertexLayout && (
              <g
                transform={`translate(${pendingVertexLayout.x}, ${pendingVertexLayout.y - 26})`}
                style={{ pointerEvents: 'auto' }}
              >
                <circle
                  r={14}
                  fill="#059669"
                  stroke="#a7f3d0"
                  strokeWidth={2}
                  className="cursor-pointer"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    confirmPendingVertex();
                  }}
                />
                <text
                  x={0}
                  y={5}
                  textAnchor="middle"
                  fontSize={14}
                  style={{ fontFamily: 'system-ui, sans-serif', pointerEvents: 'none' }}
                >
                  ✅
                </text>
              </g>
            )}
            {pendingEdgeMidpoint && (
              <g
                transform={`translate(${pendingEdgeMidpoint.x}, ${pendingEdgeMidpoint.y - 20})`}
                style={{ pointerEvents: 'auto' }}
              >
                <circle
                  r={14}
                  fill="#059669"
                  stroke="#a7f3d0"
                  strokeWidth={2}
                  className="cursor-pointer"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    confirmPendingEdge();
                  }}
                />
                <text
                  x={0}
                  y={5}
                  textAnchor="middle"
                  fontSize={14}
                  style={{ fontFamily: 'system-ui, sans-serif', pointerEvents: 'none' }}
                >
                  ✅
                </text>
              </g>
            )}
              </motion.svg>
              </div>
              {/* Bottom-left stack: inbound trade → domestic offer → bank trade */}
              {pendingInboundTrade && s.pendingDomesticTrade && (
                <div className="absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg border border-emerald-500/40 bg-slate-900 p-3 shadow-xl space-y-2 pointer-events-auto">
                  <p className="text-xs text-emerald-200/90">Trade offer</p>
                  <p className="text-[11px] text-slate-400">
                    {s.players.find((p) => p.id === s.pendingDomesticTrade!.proposerId)?.name ?? 'Player'}{' '}
                    offers{' '}
                    {RESOURCE_LIST.filter((r) => (s.pendingDomesticTrade!.give[r] ?? 0) > 0).map((r) => (
                      <span key={`og-${r}`}>
                        {s.pendingDomesticTrade!.give[r]}×{RESOURCE_EMOJI[r]}{' '}
                      </span>
                    ))}
                    for{' '}
                    {RESOURCE_LIST.filter((r) => (s.pendingDomesticTrade!.want[r] ?? 0) > 0).map((r) => (
                      <span key={`ow-${r}`}>
                        {s.pendingDomesticTrade!.want[r]}×{RESOURCE_EMOJI[r]}{' '}
                      </span>
                    ))}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm font-medium"
                      onClick={() => onAction({ type: 'respond-domestic-trade', accept: true })}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-2 rounded-lg bg-slate-700 border border-white/10 text-sm"
                      onClick={() => onAction({ type: 'respond-domestic-trade', accept: false })}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}
              {domesticTradeOverlayOpen && myPlayer && (
                <div className="absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg border border-violet-500/35 bg-slate-900 p-3 shadow-xl space-y-2 pointer-events-auto">
                  <p className="text-xs text-violet-200/90">Offer trade (your turn)</p>
                  <select
                    value={domesticTargetId}
                    onChange={(e) => setDomesticTargetId(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-white/10 text-xs p-1"
                  >
                    {s.players
                      .filter((p) => p.id !== myId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-slate-500">You give</p>
                  <div className="grid grid-cols-5 gap-1">
                    {RESOURCE_LIST.map((r) => (
                      <div key={`dg-${r}`} className="flex flex-col items-center gap-0.5">
                        <span className="text-lg leading-none">{RESOURCE_EMOJI[r]}</span>
                        <input
                          type="number"
                          min={0}
                          max={19}
                          value={domesticGive[r]}
                          onChange={(e) =>
                            setDomesticGive((h) => ({
                              ...h,
                              [r]: Math.max(0, Math.min(19, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-full rounded bg-slate-800 border border-white/10 text-[10px] p-0.5 text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">You want</p>
                  <div className="grid grid-cols-5 gap-1">
                    {RESOURCE_LIST.map((r) => (
                      <div key={`dw-${r}`} className="flex flex-col items-center gap-0.5">
                        <span className="text-lg leading-none">{RESOURCE_EMOJI[r]}</span>
                        <input
                          type="number"
                          min={0}
                          max={19}
                          value={domesticWant[r]}
                          onChange={(e) =>
                            setDomesticWant((h) => ({
                              ...h,
                              [r]: Math.max(0, Math.min(19, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-full rounded bg-slate-800 border border-white/10 text-[10px] p-0.5 text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={
                      !domesticTargetId ||
                      s.pendingDomesticTrade?.proposerId === myId ||
                      sumResourceHand(domesticGive) < 1 ||
                      sumResourceHand(domesticWant) < 1 ||
                      !canAfford(myPlayer.hand, domesticGive)
                    }
                    className="w-full py-1.5 rounded bg-violet-700 border border-white/10 text-xs disabled:opacity-40"
                    onClick={() => {
                      onAction({
                        type: 'propose-domestic-trade',
                        targetId: domesticTargetId,
                        give: resourceHandToTradePartial(domesticGive),
                        want: resourceHandToTradePartial(domesticWant),
                      });
                      setDomesticOpen(false);
                      setDomesticGive(emptyHand());
                      setDomesticWant(emptyHand());
                    }}
                  >
                    Propose
                  </button>
                </div>
              )}
              {maritimeTradeOverlayOpen && myPlayer && (
                <div className="absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg border border-white/15 bg-slate-900 p-3 shadow-xl space-y-2 pointer-events-auto">
                  <p className="text-xs text-slate-300">Maritime trade (bank)</p>
                  {legalMaritimeRatios.length > 1 && (
                    <div className="flex flex-wrap gap-1">
                      {legalMaritimeRatios.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`rounded px-2 py-0.5 text-[10px] border ${tradeRatio === r ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                          onClick={() => setTradeRatio(r)}
                        >
                          {r}:1
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <select
                      value={tradeGive}
                      onChange={(e) => setTradeGive(e.target.value as Resource)}
                      className="flex-1 rounded bg-slate-800 border border-white/10 text-xs p-1"
                    >
                      {RESOURCE_LIST.map((r) => (
                        <option key={`give-${r}`} value={r}>
                          Give {r}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tradeReceive}
                      onChange={(e) => setTradeReceive(e.target.value as Resource)}
                      className="flex-1 rounded bg-slate-800 border border-white/10 text-xs p-1"
                    >
                      {RESOURCE_LIST.map((r) => (
                        <option key={`take-${r}`} value={r} disabled={s.bank[r] < 1}>
                          Get {r}{s.bank[r] < 1 ? ' (bank empty)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={
                      !canMaritimeTrade ||
                      tradeGive === tradeReceive ||
                      !legalMaritimeRatios.includes(tradeRatio) ||
                      myPlayer.hand[tradeGive] < tradeRatio ||
                      s.bank[tradeReceive] < 1 ||
                      s.roadBuildingRemaining > 0
                    }
                    onClick={() => {
                      onAction({
                        type: 'maritime-trade',
                        give: tradeGive,
                        receive: tradeReceive,
                        ratio: tradeRatio,
                      });
                      setTradePopupOpen(false);
                    }}
                    className="w-full py-1.5 rounded bg-slate-700 border border-white/10 text-xs disabled:opacity-40"
                  >
                    Trade {tradeRatio} {tradeGive} for 1 {tradeReceive}
                  </button>
                </div>
              )}
              {/* Game over summary; hidden while maritime panel is open so layout stays predictable */}
              {!stackOverlayOpen && s.phase === 'finished' && s.winnerIds && (
                <div className="pointer-events-none absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg bg-amber-500/15 border border-amber-500/30 p-3 text-sm shadow-xl">
                  <p className="font-semibold text-amber-200">Winner</p>
                  <p className="text-white">
                    {s.winnerIds
                      .map((id) => s.players.find((p) => p.id === id)?.name ?? id)
                      .join(', ')}
                  </p>
                </div>
              )}
              {/* Discard: pairs with hand strip turning cards into toggles; confirm sends exact card counts */}
              {!stackOverlayOpen && s.phase === 'discard' && s.discardQueue[0] === myId && (
                <div className="absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg border border-amber-500/40 bg-amber-950/40 p-2 space-y-2 shadow-xl pointer-events-auto">
                  <p className="text-sm text-amber-100">
                    Discard {discardNeed} cards ({discardTotal} selected). Click cards in your hand.
                  </p>
                  <button
                    type="button"
                    disabled={discardTotal !== discardNeed}
                    onClick={() => {
                      onAction({ type: 'discard', cards: discardCardsPayload });
                      setDiscardSlotSelection({});
                    }}
                    className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm font-medium"
                  >
                    Confirm discard
                  </button>
                </div>
              )}
              {/* Robber victim picker after hex move; one steal action per target button */}
              {!stackOverlayOpen && s.phase === 'robber-steal' && isMyTurn && (
                <div className="absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] max-h-[min(50vh,24rem)] overflow-y-auto space-y-2 shadow-xl pointer-events-auto rounded-lg border border-white/15 bg-slate-900/95 p-3">
                  <p className="text-sm text-slate-300">Choose a player to steal from:</p>
                  {s.robberStealTargets.map((tid) => {
                    const p = s.players.find((x) => x.id === tid);
                    if (!p) return null;
                    return (
                      <button
                        key={tid}
                        type="button"
                        className="w-full py-2 rounded-lg bg-slate-800 border border-white/10 hover:border-amber-400/50 text-left px-3"
                        onClick={() => onAction({ type: 'steal-from', victimId: tid })}
                      >
                        <span style={{ color: PLAYER_COLOR_HEX[p.color as PlayerColor] }}>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Hint only — hex clicks on the board perform move-robber */}
              {!stackOverlayOpen && s.phase === 'robber-move' && isMyTurn && (
                <div className="pointer-events-none absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] rounded-lg border border-white/15 bg-slate-900/95 p-2 text-sm text-amber-200/90 shadow-xl">
                  Click a land hex to move the robber.
                </div>
              )}
              {/* Shown after playing a dev card this turn (rules allow only one play per turn) */}
              {!stackOverlayOpen &&
                s.phase === 'main-build' &&
                isMyTurn &&
                myPlayer &&
                s.playedDevCardThisTurn && (
                  <div className="pointer-events-none absolute left-3 bottom-3 z-30 w-[min(100%,22rem)] rounded-lg border border-white/15 bg-slate-900/95 p-2 shadow-xl">
                    <p className="text-[11px] text-slate-400">
                      You can only play one development card per turn.
                    </p>
                  </div>
                )}
              {showTurnTimer && (
                <p
                  className="pointer-events-none absolute top-3 right-3 z-30 tabular-nums text-right text-sm font-semibold text-white drop-shadow-md"
                  aria-live="polite"
                  aria-label={turnTimerAriaLabel}
                >
                  {turnTimerLabel}
                </p>
              )}
              {/* Phase / turn caption (see boardPhaseCaption); pointer-events-none so it never blocks the board */}
              <p
                className="pointer-events-none absolute bottom-3 right-3 z-30 max-w-xs text-right text-sm font-semibold text-white drop-shadow-md"
                aria-live="polite"
              >
                {boardPhaseCaption}
              </p>
            </div>

            {/* Hand strip + main-phase build toolbar (road/settlement/city toggles, trade, buy dev, end turn) */}
            <div className="relative z-0 min-w-0 w-full shrink-0 rounded-2xl border border-white/15 bg-slate-950/80 px-3 py-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                  {myPlayer && (
                    <div className="flex min-h-0 w-[min(100%,22rem)] shrink-0 items-center rounded-2xl border border-white/15 bg-slate-950/80 px-3 py-1">
                      {/* Per-resource columns; in discard phase each card is a button (slot index = which copy) */}
                      <div className="settler-hand settler-hand--compact w-full min-w-0">
                        {totalHandCount === 0 ? (
                          <p className="text-xs text-slate-500">No resources</p>
                        ) : (
                          <div className="settler-handRow" style={{ gap: `${RESOURCE_HAND_GAP}px` }}>
                            {miniHands.map((hand) => (
                              <div key={hand.resource} className="settler-handGroup">
                                <div
                                  className="settler-handSpread"
                                  style={{
                                    width: `${hand.layout.spreadWidth}px`,
                                    height: `${hand.layout.cardHeight + hand.layout.selectedLift}px`,
                                    transition: 'width 0.16s ease',
                                  }}
                                >
                                  {hand.cards.map((resource, i) => {
                                    const isLast = i === hand.cards.length - 1;
                                    const hitboxWidth = isLast ? hand.layout.cardWidth : hand.layout.step;
                                    const selected =
                                      isDiscardSelectingHand &&
                                      (discardSlotSelection[resource]?.has(i) ?? false);
                                    const wrapClassName = [
                                      'settler-handCardWrap',
                                      'settler-handCardWrap--active',
                                      selected ? 'settler-handCardWrap--discardSelected' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ');
                                    const slotStyle = {
                                      left: `${i * hand.layout.step}px`,
                                      width: `${hitboxWidth}px`,
                                      height: `${hand.layout.cardHeight + hand.layout.selectedLift}px`,
                                      zIndex: i + 1,
                                    };
                                    const wrapStyle = {
                                      width: `${hand.layout.cardWidth}px`,
                                      height: `${hand.layout.cardHeight}px`,
                                      transform: 'translateY(0px)',
                                    };
                                    const cardClass = `settler-resourceCard settler-resourceCard--${resource}`;
                                    const cardFace = (
                                      <span
                                        className={wrapClassName}
                                        style={wrapStyle}
                                        aria-hidden={isDiscardSelectingHand}
                                      >
                                        <span
                                          className={cardClass}
                                          aria-label={
                                            isDiscardSelectingHand ? undefined : resourceLabel(resource)
                                          }
                                        >
                                          {isLast && (
                                            <span className="settler-resourceCardCount" aria-hidden>
                                              {hand.count}
                                            </span>
                                          )}
                                          <span className="settler-resourceCardSymbol" aria-hidden>
                                            {RESOURCE_EMOJI[resource]}
                                          </span>
                                        </span>
                                      </span>
                                    );
                                    if (isDiscardSelectingHand) {
                                      return (
                                        <motion.button
                                          key={`${resource}-${i}`}
                                          type="button"
                                          className="settler-handCardSlot cursor-pointer"
                                          initial={{ y: 40, opacity: 0 }}
                                          animate={{ y: 0, opacity: 1 }}
                                          transition={{ delay: i * 0.015 }}
                                          style={slotStyle}
                                          aria-pressed={selected}
                                          aria-label={`${resourceLabel(resource)} ${i + 1} of ${hand.count}, ${selected ? 'selected to discard' : 'tap to select for discard'}`}
                                          onClick={() => toggleDiscardSlot(resource, i)}
                                        >
                                          {cardFace}
                                        </motion.button>
                                      );
                                    }
                                    return (
                                      <motion.div
                                        key={`${resource}-${i}`}
                                        className="settler-handCardSlot"
                                        initial={{ y: 40, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: i * 0.015 }}
                                        style={slotStyle}
                                      >
                                        {cardFace}
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 sm:min-h-0 sm:min-w-0">
                    {s.phase === 'main-build' && isMyTurn && myPlayer && (
                      <div className="flex min-w-0 flex-col gap-1.5">
                        {/* Build toggles then click board; 🔨 buys a dev card (play is handled in logic/bots elsewhere) */}
                        <div className="flex min-w-0 w-full justify-end overflow-x-auto">
                        <div className="flex shrink-0 flex-nowrap items-center gap-2">
                        <div
                          className="relative inline-flex"
                          onMouseEnter={() => showBuildCostTip(roadBtnRef, ROAD_COST_CARDS)}
                          onMouseLeave={hideBuildCostTip}
                        >
                          <button
                            ref={roadBtnRef}
                            type="button"
                            title="Road (1 wood, 1 brick)"
                            aria-label="Road, costs 1 wood and 1 brick"
                            className={`flex size-12 shrink-0 items-center justify-center rounded-lg border text-2xl leading-none ${buildTap === 'road' ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                            disabled={!canBuyRoad || s.roadBuildingRemaining > 0}
                            onClick={() =>
                              setBuildTap((m) => {
                                const next = m === 'road' ? 'none' : 'road';
                                setPendingVertexId(null);
                                if (next === 'none' && s.roadBuildingRemaining === 0) {
                                  setPendingEdgeId(null);
                                }
                                return next;
                              })
                            }
                          >
                            🚦
                          </button>
                        </div>
                        <div
                          className="relative inline-flex"
                          onMouseEnter={() => showBuildCostTip(settlementBtnRef, SETTLEMENT_COST_CARDS)}
                          onMouseLeave={hideBuildCostTip}
                        >
                          <button
                            ref={settlementBtnRef}
                            type="button"
                            title="Settlement (1 wood, 1 brick, 1 sheep, 1 wheat)"
                            aria-label="Settlement, costs 1 wood, 1 brick, 1 sheep, and 1 wheat"
                            className={`flex size-12 shrink-0 items-center justify-center rounded-lg border text-2xl leading-none ${buildTap === 'settlement' ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                            disabled={!canBuySettlement || s.roadBuildingRemaining > 0}
                            onClick={() =>
                              setBuildTap((m) => {
                                const next = m === 'settlement' ? 'none' : 'settlement';
                                setPendingEdgeId(null);
                                if (next === 'none') setPendingVertexId(null);
                                return next;
                              })
                            }
                          >
                            🏠
                          </button>
                        </div>
                        <div
                          className="relative inline-flex"
                          onMouseEnter={() => showBuildCostTip(cityBtnRef, CITY_COST_CARDS)}
                          onMouseLeave={hideBuildCostTip}
                        >
                          <button
                            ref={cityBtnRef}
                            type="button"
                            title="City (3 ore, 2 wheat)"
                            aria-label="City, costs 3 ore and 2 wheat"
                            className={`flex size-12 shrink-0 items-center justify-center rounded-lg border text-2xl leading-none ${buildTap === 'city' ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                            disabled={!canBuyCity || s.roadBuildingRemaining > 0}
                            onClick={() =>
                              setBuildTap((m) => {
                                const next = m === 'city' ? 'none' : 'city';
                                setPendingEdgeId(null);
                                if (next === 'none') setPendingVertexId(null);
                                return next;
                              })
                            }
                          >
                            🏘️
                          </button>
                        </div>
                        <button
                          type="button"
                          title="Maritime trade (bank)"
                          aria-label="Maritime trade with bank"
                          className={`flex size-12 shrink-0 items-center justify-center rounded-lg border text-2xl leading-none ${tradePopupOpen ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                          disabled={!canMaritimeTrade || s.roadBuildingRemaining > 0}
                          onClick={() => {
                            setDomesticOpen(false);
                            setTradePopupOpen((o) => !o);
                          }}
                        >
                          ⚖️
                        </button>
                        <button
                          type="button"
                          title="Offer trade to a player"
                          aria-label="Domestic trade offer"
                          className={`flex size-12 shrink-0 items-center justify-center rounded-lg border text-2xl leading-none ${domesticOpen ? 'border-violet-400 bg-violet-500/20' : 'border-white/10 bg-slate-800'}`}
                          disabled={
                            s.players.length < 2 ||
                            s.phase !== 'main-build' ||
                            !isMyTurn ||
                            s.roadBuildingRemaining > 0
                          }
                          onClick={() => {
                            setTradePopupOpen(false);
                            setDomesticOpen((o) => !o);
                            if (!domesticOpen && !domesticTargetId) {
                              const other = s.players.find((p) => p.id !== myId);
                              if (other) setDomesticTargetId(other.id);
                            }
                          }}
                        >
                          🤝
                        </button>
                        {s.pendingDomesticTrade?.proposerId === myId && isMyTurn && s.phase === 'main-build' && (
                          <button
                            type="button"
                            title="Cancel trade offer"
                            className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-rose-500/50 bg-rose-950/40 text-lg leading-none"
                            onClick={() => onAction({ type: 'cancel-domestic-trade' })}
                          >
                            ✕
                          </button>
                        )}
                        <div
                          className="relative inline-flex"
                          onMouseEnter={() => showBuildCostTip(devCardBtnRef, DEV_CARD_COST_CARDS)}
                          onMouseLeave={hideBuildCostTip}
                        >
                          <button
                            ref={devCardBtnRef}
                            type="button"
                            title="Buy development card (1 sheep, 1 wheat, 1 ore)"
                            aria-label="Buy development card, costs 1 sheep, 1 wheat, and 1 ore"
                            disabled={!canBuyDev || s.roadBuildingRemaining > 0}
                            onClick={() => onAction({ type: 'buy-dev-card' })}
                            className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-800 text-2xl leading-none disabled:opacity-40"
                          >
                            🔨
                          </button>
                        </div>
                        <button
                          type="button"
                          title="End turn"
                          aria-label="End turn"
                          onClick={() => onAction({ type: 'end-turn' })}
                          disabled={s.roadBuildingRemaining > 0}
                          className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-700 text-2xl leading-none hover:bg-slate-600 disabled:opacity-40"
                        >
                          ⏩
                        </button>
                        </div>
                        </div>
                        {/* Road Building card: optional skip if fewer legal edges than remaining placements */}
                        {s.roadBuildingRemaining > 0 && (
                          <button
                            type="button"
                            className="w-full shrink-0 rounded-lg bg-cyan-800/70 px-2 py-1.5 text-center text-xs hover:bg-cyan-700"
                            onClick={() => onAction({ type: 'skip-free-road' })}
                          >
                            Skip free road ({s.roadBuildingRemaining})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
            </div>
          </div>

          {/* Sidebar: chronological log, bank supply, per-player stats + dice for whose turn it is */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/75 p-2 lg:h-full lg:min-h-0">
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2">
              <p className="text-sm text-amber-200/80 uppercase tracking-wider">Action log</p>
              <div ref={actionLogRef} className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1 space-y-2" aria-live="polite">
                {actionLog.length === 0 ? (
                  <p className="text-sm text-slate-400">No actions yet.</p>
                ) : (
                  visibleActionLog.map((entry, index) => {
                    const player = s.players.find((p) => p.id === entry.playerId);
                    const playerName = player?.name ?? entry.playerId;
                    const playerColor = player ? getPlayerHudTextColor(player.color) : '#e2e8f0';
                    return (
                      <p key={`${entry.playerId}-${index}`} className="text-base leading-snug text-slate-200">
                        <span style={{ color: playerColor }}>{playerName}</span>
                        {': '}
                        <span>{renderActionLogText(entry.text)}</span>
                      </p>
                    );
                  })
                )}
              </div>
            </div>
            <div className="mt-2 shrink-0 space-y-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2">
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Bank</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    <span className="rounded bg-slate-800/80 px-1.5 py-1 text-center text-[11px] border border-white/10">🏦</span>
                    <span className="rounded bg-emerald-600/80 px-1.5 py-1 text-center text-[11px] font-semibold">{s.bank.wood}</span>
                    <span className="rounded bg-red-700/80 px-1.5 py-1 text-center text-[11px] font-semibold">{s.bank.brick}</span>
                    <span className="rounded bg-lime-600/80 px-1.5 py-1 text-center text-[11px] font-semibold">{s.bank.sheep}</span>
                    <span className="rounded bg-amber-500/90 px-1.5 py-1 text-center text-[11px] font-semibold text-amber-950">{s.bank.wheat}</span>
                    <span className="rounded bg-slate-500/90 px-1.5 py-1 text-center text-[11px] font-semibold">{s.bank.ore}</span>
                  </div>
                </div>
            </div>
            <div className="mt-2 shrink-0 space-y-1 border-t border-white/10 pt-2">
              {/* isActive highlights currentPlayerIndex except during discard (actor is discardQueue[0]) */}
              {s.players.map((p) => {
                const isActive = p.id === s.players[s.currentPlayerIndex]?.id && s.phase !== 'discard';
                const currentId = s.players[s.currentPlayerIndex]?.id;
                const isCurrentTurnPlayer = p.id === currentId;
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border border-white/10 px-3 py-2 text-xs ${
                      isActive
                        ? 'bg-amber-500/20 ring-2 ring-amber-400/50 ring-inset'
                        : 'bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-base font-semibold leading-none"
                          style={{ color: PLAYER_COLOR_HEX[p.color as PlayerColor] }}
                        >
                          {p.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-200">
                          {p.id === myId ? (
                            <span>
                              VP {victoryPoints(s, p.id)}/{VP_TO_WIN}
                            </span>
                          ) : (
                            <span title="Visible only — hidden VP cards excluded">
                              Vis {visibleVictoryPoints(s, p.id)}/{VP_TO_WIN} · {totalDevCardCount(p.devCards)}{' '}
                              dev
                            </span>
                          )}
                          {s.longestRoadHolderId === p.id && <span className="text-cyan-300">Road</span>}
                          {s.largestArmyHolderId === p.id && <span className="text-violet-300">Army</span>}
                          {p.id === myId &&
                            DEV_CARD_TAG_ORDER.map(({ key, label }) => {
                              const n = p.devCards[key];
                              if (n <= 0) return null;
                              return (
                                <span
                                  key={key}
                                  className="rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-[11px]"
                                >
                                  {label} ×{n}
                                </span>
                              );
                            })}
                        </div>
                      </div>
                      <div className="flex min-h-[2.75rem] min-w-[11rem] shrink-0 items-center justify-end">
                        {isCurrentTurnPlayer && (
                          <SettlerTurnDiceSlot
                            dice={s.dice}
                            showRollButton={s.phase === 'pre-roll' && isMyTurn}
                            onRoll={() => onAction({ type: 'roll' })}
                            onRollAnimationSettled={handleRollAnimationSettled}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* Portaled cost preview: escapes overflow/stacking; dim cards past what the hand can pay in order */}
      {buildCostTip != null &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[200] flex gap-0.5"
            style={{
              left: buildCostTip.x,
              top: buildCostTip.y,
              transform: 'translate(-50%, calc(-100% - 4px))',
            }}
          >
            {buildCostTip.cards.map((r, i) => (
              <span
                key={`${r}-${i}`}
                className={`settler-resourceCard settler-resourceCard--costPreview settler-resourceCard--${r}${
                  buildCostTipAffordableFlags && !buildCostTipAffordableFlags[i]
                    ? ' settler-resourceCard--costPreviewUnaffordable'
                    : ''
                }`}
                aria-hidden
              >
                <span className="settler-resourceCardSymbol">{RESOURCE_EMOJI[r]}</span>
              </span>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
