import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  DEFAULT_BOARD_GRAPH,
  boardViewBox,
  flatTopHexPath,
  type EdgeLayout,
} from './layout';
import type { SettlerState, Resource, Terrain } from './types';
import { COSTS, RESOURCE_EMOJI, RESOURCE_LIST, VP_TO_WIN } from './types';
import {
  getLegalRoadEdgesForPlayer,
  getLegalSettlementVertices,
  setupCurrentPlayerSlot,
  victoryPoints,
} from './logic';
import { Dice, faceOrientations, type DiceValue } from '../../components/Dice';
import { PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import type { PlayerColor } from '../../networking/types';

const graph = DEFAULT_BOARD_GRAPH;

/** Unicode die faces U+2680–U+2685 (same glyphs as action log rolls in logic). */
const ACTION_LOG_DIE_FACE = /[\u2680-\u2685]/;

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

const TERRAIN_STYLE: Record<Terrain, { fill: string; stroke: string; label: string }> = {
  wood: { fill: 'url(#settlerWood)', stroke: '#14532d', label: 'Forest' },
  brick: { fill: 'url(#settlerBrick)', stroke: '#7f1d1d', label: 'Brick' },
  sheep: { fill: 'url(#settlerSheep)', stroke: '#166534', label: 'Pasture' },
  wheat: { fill: 'url(#settlerWheat)', stroke: '#a16207', label: 'Fields' },
  ore: { fill: 'url(#settlerOre)', stroke: '#334155', label: 'Mountains' },
  desert: { fill: 'url(#settlerDesert)', stroke: '#92400e', label: 'Desert' },
};

interface SettlerBoardProps {
  state: unknown;
  myId: string;
  onAction: (payload: unknown) => void;
}

type BuildTapMode = 'none' | 'road' | 'settlement' | 'city';
function resourceLabel(r: Resource): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function tokenPipCount(token: number): number {
  return Math.max(1, 6 - Math.abs(7 - token));
}

function canAfford(h: SettlerState['players'][0]['hand'], cost: Partial<Record<Resource, number>>): boolean {
  for (const r of RESOURCE_LIST) {
    if (h[r] < (cost[r] ?? 0)) return false;
  }
  return true;
}

export default function SettlerBoard({ state, myId, onAction }: SettlerBoardProps) {
  const s = state as SettlerState;
  const myIndex = s.players.findIndex((p) => p.id === myId);
  const myPlayer = myIndex >= 0 ? s.players[myIndex] : null;

  const [buildTap, setBuildTap] = useState<BuildTapMode>('none');
  const [discardPick, setDiscardPick] = useState<Partial<Record<Resource, number>>>({});
  const [tradeGive, setTradeGive] = useState<Resource>('wood');
  const [tradeReceive, setTradeReceive] = useState<Resource>('brick');
  const [yopA, setYopA] = useState<Resource>('wood');
  const [yopB, setYopB] = useState<Resource>('brick');
  const [monopolyResource, setMonopolyResource] = useState<Resource>('wheat');
  const handContainerRef = useRef<HTMLDivElement>(null);
  const actionLogRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);

  const viewBox = useMemo(() => boardViewBox(graph, 72), []);

  useEffect(() => {
    const element = handContainerRef.current;
    if (!element) return;

    const updateSize = () => setHandWidth(element.clientWidth);
    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isMyTurn = useMemo(() => {
    if (s.phase === 'discard') return s.discardQueue[0] === myId;
    if (s.phase === 'robber-steal') return s.players[s.currentPlayerIndex]?.id === myId;
    if (s.phase === 'setup-settlement' || s.phase === 'setup-road') {
      return s.players[s.currentPlayerIndex]?.id === myId;
    }
    return myIndex >= 0 && s.currentPlayerIndex === myIndex;
  }, [s, myId, myIndex]);

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

  const legalCityVertices = useMemo(() => {
    if (!myPlayer || !isMyTurn || s.phase !== 'main-build' || buildTap !== 'city') return [];
    return Object.entries(s.settlements)
      .filter(([, piece]) => piece.playerId === myId && piece.kind === 'settlement')
      .map(([vid]) => Number(vid));
  }, [s, myId, myPlayer, isMyTurn, buildTap]);

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
      canAfford(myPlayer.hand, COSTS.city) &&
      Object.values(s.settlements).some((piece) => piece.playerId === myId && piece.kind === 'settlement')
  );
  const canMaritimeTrade = Boolean(
    myPlayer && RESOURCE_LIST.some((r) => myPlayer.hand[r] >= 4)
  );
  const canBuyDev = Boolean(
    myPlayer &&
      s.devDeck.length > 0 &&
      canAfford(myPlayer.hand, { sheep: 1, wheat: 1, ore: 1 })
  );
  const canPlayKnight = Boolean(
    myPlayer && myPlayer.devCards.knight - myPlayer.newDevCards.knight > 0 && !s.playedDevCardThisTurn
  );
  const canPlayRoadBuilding = Boolean(
    myPlayer &&
      myPlayer.devCards['road-building'] - myPlayer.newDevCards['road-building'] > 0 &&
      !s.playedDevCardThisTurn
  );
  const canPlayYop = Boolean(
    myPlayer &&
      myPlayer.devCards['year-of-plenty'] - myPlayer.newDevCards['year-of-plenty'] > 0 &&
      !s.playedDevCardThisTurn
  );
  const canPlayMonopoly = Boolean(
    myPlayer &&
      myPlayer.devCards.monopoly - myPlayer.newDevCards.monopoly > 0 &&
      !s.playedDevCardThisTurn
  );
  const noMainActions =
    s.phase === 'main-build' &&
    isMyTurn &&
    s.roadBuildingRemaining === 0 &&
    !canBuyRoad &&
    !canBuySettlement &&
    !canBuyCity &&
    !canMaritimeTrade &&
    !canBuyDev &&
    !canPlayKnight &&
    !canPlayRoadBuilding &&
    !canPlayYop &&
    !canPlayMonopoly;

  const onVertexClick = useCallback(
    (vid: number) => {
      if (!isMyTurn) return;
      if (s.phase === 'setup-settlement' && legalSettlements.includes(vid)) {
        onAction({ type: 'place-settlement', vertexId: vid });
        return;
      }
      if (s.phase === 'main-build' && buildTap === 'settlement' && legalSettlements.includes(vid)) {
        onAction({ type: 'build-settlement', vertexId: vid });
        setBuildTap('none');
        return;
      }
      if (s.phase === 'main-build' && buildTap === 'city' && legalCityVertices.includes(vid)) {
        onAction({ type: 'build-city', vertexId: vid });
        setBuildTap('none');
      }
    },
    [isMyTurn, s.phase, legalSettlements, legalCityVertices, buildTap, onAction]
  );

  const onEdgeClick = useCallback(
    (eid: string) => {
      if (!isMyTurn) return;
      if (s.phase === 'setup-road' && legalRoads.includes(eid)) {
        onAction({ type: 'place-road', edgeId: eid });
        return;
      }
      if (s.phase === 'main-build' && buildTap === 'road' && legalRoads.includes(eid)) {
        onAction({ type: 'build-road', edgeId: eid });
        setBuildTap('none');
        return;
      }
      if (s.phase === 'main-build' && s.roadBuildingRemaining > 0 && legalRoads.includes(eid)) {
        onAction({ type: 'place-free-road', edgeId: eid });
      }
    },
    [isMyTurn, s.phase, s.roadBuildingRemaining, legalRoads, buildTap, onAction]
  );

  const onHexClick = useCallback(
    (hi: number) => {
      if (s.phase !== 'robber-move' || !isMyTurn) return;
      if (hi === s.robberHexIndex) return;
      onAction({ type: 'move-robber', hexIndex: hi });
    },
    [s.phase, s.robberHexIndex, isMyTurn, onAction]
  );

  const discardNeed = s.phase === 'discard' && s.discardQueue[0] === myId ? s.discardRequired[myId] ?? 0 : 0;
  const discardTotal = RESOURCE_LIST.reduce((acc, r) => acc + (discardPick[r] ?? 0), 0);

  const phaseLabel = (() => {
    switch (s.phase) {
      case 'setup-settlement':
        return `Setup: place settlement (round ${s.setupRound})`;
      case 'setup-road':
        return 'Setup: place road from your new settlement';
      case 'pre-roll':
        return 'Roll the dice';
      case 'discard':
        return 'Discard half your hand (7 rolled)';
      case 'robber-move':
        return 'Move the robber';
      case 'robber-steal':
        return 'Steal one resource';
      case 'main-build':
        return 'Build or end turn';
      case 'finished':
        return 'Game over';
      default:
        return '';
    }
  })();

  const setupActorName = s.players[setupCurrentPlayerSlot(s)]?.name ?? '';
  const actorIdForHud = s.phase === 'discard' ? s.discardQueue[0] : s.players[s.currentPlayerIndex]?.id;
  const actorForHud = actorIdForHud ? s.players.find((p) => p.id === actorIdForHud) : null;
  const turnText = useMemo(() => {
    if (!actorForHud) return null;
    switch (s.phase) {
      case 'setup-settlement':
        return `${actorForHud.name} is placing a settlement`;
      case 'setup-road':
        return `${actorForHud.name} is placing a road`;
      case 'pre-roll':
        return `${actorForHud.name}'s turn to roll`;
      case 'discard':
        return `${actorForHud.name} must discard`;
      case 'robber-move':
        return `${actorForHud.name} is moving the robber`;
      case 'robber-steal':
        return `${actorForHud.name} can steal a resource`;
      case 'main-build':
        return `${actorForHud.name}'s build phase`;
      default:
        return null;
    }
  }, [actorForHud, s.phase]);
  const actionLog = s.actionLog ?? [];
  useEffect(() => {
    const element = actionLogRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [actionLog.length]);
  const expandedHand = useMemo(() => {
    if (!myPlayer) return [] as Resource[];
    const cards: Resource[] = [];
    for (const r of RESOURCE_LIST) {
      for (let i = 0; i < myPlayer.hand[r]; i += 1) cards.push(r);
    }
    return cards;
  }, [myPlayer]);
  const handLayout = useMemo(() => {
    const cardCount = expandedHand.length;
    const available = Math.max(handWidth - 8, 220);
    const cardWidth = Math.max(62, Math.min(available * 0.16, available < 420 ? 76 : 86));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.6);
    const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
    const step = cardCount > 1 ? Math.max(10, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;

    return {
      cardWidth,
      cardHeight,
      step,
      spreadWidth,
      selectedLift: 12,
    };
  }, [expandedHand.length, handWidth]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gradient-to-b from-sky-900 via-sky-800 to-sky-700 text-white">
      <div className="flex-1 min-h-0 p-2 lg:p-3 flex flex-col gap-2">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 flex flex-col gap-2">
            <div className="flex-1 min-h-0 rounded-2xl border border-white/15 bg-sky-950/45 shadow-2xl overflow-hidden">
              <div className="h-full min-h-[320px] lg:min-h-0 flex items-center justify-center overflow-auto p-2">
              <motion.svg
                className="max-w-full max-h-full w-full h-full drop-shadow-2xl"
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
              >
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

            {graph.hexes.map((cell) => {
              const hi = cell.index;
              const hex = s.hexes[hi];
              if (!hex) return null;
              const st = TERRAIN_STYLE[hex.terrain];
              const token = hex.numberToken;
              const isRobber = hi === s.robberHexIndex;
              const producing = s.lastProductionHexIndices.includes(hi);
              const canRob = s.phase === 'robber-move' && isMyTurn && hi !== s.robberHexIndex;

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
                    fontSize={10}
                    fontWeight={700}
                    fill="rgba(15, 23, 42, 0.68)"
                    style={{ letterSpacing: '0.08em' }}
                    pointerEvents="none"
                  >
                    {st.label.toUpperCase()}
                  </text>
                  {token != null && (
                    <g filter="url(#settlerTokenShadow)">
                      <circle
                        cx={cell.cx}
                        cy={cell.cy}
                        r={18}
                        fill="url(#settlerTokenPaper)"
                        stroke="#78350f"
                        strokeWidth={2}
                      />
                      <text
                        x={cell.cx}
                        y={cell.cy + 6}
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
                            cy={cell.cy + 12}
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

            {/* Single shared edges — avoids double strokes that cause gaps between tiles */}
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

            {/* One yellow junction marker per shared vertex (not six per hex) */}
            {graph.vertices.map((v) => (
              <circle
                key={`junction-${v.id}`}
                cx={v.x}
                cy={v.y}
                r={5}
                fill="#facc15"
                stroke="#b45309"
                strokeWidth={1}
                pointerEvents="none"
                style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}
              />
            ))}

            {graph.edges.map((e: EdgeLayout) => {
              const va = graph.vertices[e.a];
              const vb = graph.vertices[e.b];
              if (!va || !vb) return null;
              const owner = s.roads[e.id];
              const ownerPlayer = owner ? s.players.find((p) => p.id === owner) : null;
              const hl = legalRoads.includes(e.id);
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
                      stroke="rgba(56, 189, 248, 0.45)"
                      strokeWidth={16}
                      strokeLinecap="round"
                      className="cursor-pointer"
                      onClick={() => onEdgeClick(e.id)}
                    />
                  )}
                </g>
              );
            })}

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
                      r={16}
                      fill={piece ? 'rgba(251, 191, 36, 0.25)' : 'transparent'}
                      stroke={piece ? 'rgba(251, 191, 36, 0.8)' : 'none'}
                      strokeWidth={piece ? 2 : 0}
                      className="cursor-pointer"
                      onClick={() => onVertexClick(v.id)}
                    />
                  )}
                  {cityTarget && (
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r={18}
                      fill="transparent"
                      className="cursor-pointer"
                      onClick={() => onVertexClick(v.id)}
                    />
                  )}
                </g>
              );
            })}
              </motion.svg>
              </div>
            </div>

            <div className="shrink-0 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2" aria-live="polite">
              <p className="text-xs text-amber-200/80 uppercase tracking-wider">Settler</p>
              <p className="text-sm font-semibold text-white">{phaseLabel}</p>
              {(s.phase === 'setup-settlement' || s.phase === 'setup-road') && (
                <p className="text-xs text-slate-300 mt-0.5">Current: {setupActorName}</p>
              )}
              <p className="text-xs text-slate-300 mt-2">{turnText ?? '\u00a0'}</p>
              {turnText && actorForHud && (
                <p className="text-xs text-slate-400">
                  Turn: <span style={{ color: getPlayerHudTextColor(actorForHud.color) }}>{actorForHud.name}</span>
                </p>
              )}
            </div>
          </div>

          <div className="min-h-0 rounded-2xl border border-white/15 bg-slate-950/75 p-2 flex flex-col gap-2 overflow-hidden">
            <div className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 min-h-28 flex flex-col">
              <p className="text-sm text-amber-200/80 uppercase tracking-wider">Action log</p>
              <div ref={actionLogRef} className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1 space-y-2" aria-live="polite">
                {actionLog.length === 0 ? (
                  <p className="text-sm text-slate-400">No actions yet.</p>
                ) : (
                  actionLog.map((entry, index) => {
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

            {myPlayer && (
              <div className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2">
                <p className="text-xs text-slate-400 mb-1.5">Resources</p>
                <div className="grid grid-cols-6 gap-1.5">
                  <span className="rounded bg-slate-800/80 px-1.5 py-1 text-center text-[11px] border border-white/10">🏠</span>
                  <span className="rounded bg-emerald-600/80 px-1.5 py-1 text-center text-[11px] font-semibold">{myPlayer.hand.wood}</span>
                  <span className="rounded bg-red-700/80 px-1.5 py-1 text-center text-[11px] font-semibold">{myPlayer.hand.brick}</span>
                  <span className="rounded bg-lime-600/80 px-1.5 py-1 text-center text-[11px] font-semibold">{myPlayer.hand.sheep}</span>
                  <span className="rounded bg-amber-500/90 px-1.5 py-1 text-center text-[11px] font-semibold text-amber-950">{myPlayer.hand.wheat}</span>
                  <span className="rounded bg-slate-500/90 px-1.5 py-1 text-center text-[11px] font-semibold">{myPlayer.hand.ore}</span>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
            {s.phase === 'finished' && s.winnerIds && (
              <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 p-3 text-sm">
                <p className="font-semibold text-amber-200">Winner</p>
                <p className="text-white">
                  {s.winnerIds
                    .map((id) => s.players.find((p) => p.id === id)?.name ?? id)
                    .join(', ')}
                </p>
              </div>
            )}

            {myPlayer && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Development cards</p>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10">
                    Knight ×{myPlayer.devCards.knight}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10">
                    VP ×{myPlayer.devCards['victory-point']}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10">
                    Road ×{myPlayer.devCards['road-building']}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10">
                    Plenty ×{myPlayer.devCards['year-of-plenty']}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10">
                    Monopoly ×{myPlayer.devCards.monopoly}
                  </span>
                </div>
              </div>
            )}

            {s.phase === 'discard' && s.discardQueue[0] === myId && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-2 space-y-2">
                <p className="text-sm text-amber-100">Discard {discardNeed} cards ({discardTotal} selected)</p>
                <div className="flex flex-wrap gap-2">
                  {RESOURCE_LIST.map((r) => {
                    const maxTake = myPlayer?.hand[r] ?? 0;
                    const cur = discardPick[r] ?? 0;
                    return (
                      <div key={r} className="flex items-center gap-1 text-xs">
                        <span className="w-14">{r}</span>
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded bg-slate-700 disabled:opacity-30"
                          disabled={cur <= 0}
                          onClick={() =>
                            setDiscardPick((d) => ({ ...d, [r]: Math.max(0, (d[r] ?? 0) - 1) }))
                          }
                        >
                          −
                        </button>
                        <span className="w-4 text-center">{cur}</span>
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded bg-slate-700 disabled:opacity-30"
                          disabled={cur >= maxTake || discardTotal >= discardNeed}
                          onClick={() =>
                            setDiscardPick((d) => ({ ...d, [r]: Math.min(maxTake, (d[r] ?? 0) + 1) }))
                          }
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={discardTotal !== discardNeed}
                  onClick={() => {
                    onAction({ type: 'discard', cards: discardPick });
                    setDiscardPick({});
                  }}
                  className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm font-medium"
                >
                  Confirm discard
                </button>
              </div>
            )}

            {s.phase === 'robber-steal' && isMyTurn && (
              <div className="space-y-2">
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

            {s.phase === 'main-build' && isMyTurn && myPlayer && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Secondary actions</p>
                {noMainActions && (
                  <p className="text-xs text-amber-200/90">
                    No legal build/trade/dev actions right now. You can safely end your turn.
                  </p>
                )}

                <div className="rounded-lg border border-white/10 p-2 space-y-2">
                  <p className="text-xs text-slate-300">Maritime trade (4:1)</p>
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
                        <option key={`take-${r}`} value={r}>
                          Get {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!canMaritimeTrade || tradeGive === tradeReceive || myPlayer.hand[tradeGive] < 4 || s.roadBuildingRemaining > 0}
                    onClick={() => onAction({ type: 'maritime-trade', give: tradeGive, receive: tradeReceive })}
                    className="w-full py-1.5 rounded bg-slate-700 border border-white/10 text-xs disabled:opacity-40"
                  >
                    Trade 4 {tradeGive} for 1 {tradeReceive}
                  </button>
                </div>

                <div className="rounded-lg border border-white/10 p-2 space-y-2">
                  <p className="text-xs text-slate-300">Development cards</p>
                  <button
                    type="button"
                    disabled={!canBuyDev || s.roadBuildingRemaining > 0}
                    onClick={() => onAction({ type: 'buy-dev-card' })}
                    className="w-full py-1.5 rounded bg-slate-700 border border-white/10 text-xs disabled:opacity-40"
                  >
                    Buy dev card (1 sheep, 1 wheat, 1 ore)
                  </button>
                  <button
                    type="button"
                    disabled={!canPlayKnight || s.roadBuildingRemaining > 0}
                    onClick={() => onAction({ type: 'play-knight' })}
                    className="w-full py-1.5 rounded bg-slate-700 border border-white/10 text-xs disabled:opacity-40"
                  >
                    Play Knight
                  </button>
                  <button
                    type="button"
                    disabled={!canPlayRoadBuilding || s.roadBuildingRemaining > 0}
                    onClick={() => onAction({ type: 'play-road-building' })}
                    className="w-full py-1.5 rounded bg-slate-700 border border-white/10 text-xs disabled:opacity-40"
                  >
                    Play Road Building
                  </button>
                  <div className="flex gap-2">
                    <select
                      value={yopA}
                      onChange={(e) => setYopA(e.target.value as Resource)}
                      className="flex-1 rounded bg-slate-800 border border-white/10 text-xs p-1"
                    >
                      {RESOURCE_LIST.map((r) => (
                        <option key={`yop-a-${r}`} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <select
                      value={yopB}
                      onChange={(e) => setYopB(e.target.value as Resource)}
                      className="flex-1 rounded bg-slate-800 border border-white/10 text-xs p-1"
                    >
                      {RESOURCE_LIST.map((r) => (
                        <option key={`yop-b-${r}`} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!canPlayYop || s.roadBuildingRemaining > 0}
                    onClick={() => onAction({ type: 'play-year-of-plenty', resourceA: yopA, resourceB: yopB })}
                    className="w-full py-1.5 rounded bg-slate-700 border border-white/10 text-xs disabled:opacity-40"
                  >
                    Play Year of Plenty
                  </button>
                  <div className="flex gap-2">
                    <select
                      value={monopolyResource}
                      onChange={(e) => setMonopolyResource(e.target.value as Resource)}
                      className="flex-1 rounded bg-slate-800 border border-white/10 text-xs p-1"
                    >
                      {RESOURCE_LIST.map((r) => (
                        <option key={`mono-${r}`} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!canPlayMonopoly || s.roadBuildingRemaining > 0}
                      onClick={() => onAction({ type: 'play-monopoly', resource: monopolyResource })}
                      className="flex-1 py-1.5 rounded bg-slate-700 border border-white/10 text-xs disabled:opacity-40"
                    >
                      Play Monopoly
                    </button>
                  </div>
                  {s.playedDevCardThisTurn && (
                    <p className="text-[11px] text-slate-400">You can only play one development card per turn.</p>
                  )}
                </div>
              </div>
            )}

            {s.phase === 'robber-move' && isMyTurn && (
              <p className="text-sm text-amber-200/90">Click a land hex to move the robber.</p>
            )}
            </div>

            <div className="space-y-1 pt-1 border-t border-white/10">
              {s.players.map((p) => {
                const isActive = p.id === s.players[s.currentPlayerIndex]?.id && s.phase !== 'discard';
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg px-3 py-2 border text-xs ${
                      isActive ? 'border-amber-400/60 bg-amber-500/20' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <p className="text-base font-semibold leading-none" style={{ color: PLAYER_COLOR_HEX[p.color as PlayerColor] }}>
                      {p.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-slate-200">
                      <span>VP {victoryPoints(s, p.id)}/{VP_TO_WIN}</span>
                      {s.longestRoadHolderId === p.id && <span className="text-cyan-300">Road</span>}
                      {s.largestArmyHolderId === p.id && <span className="text-violet-300">Army</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-white/15 bg-slate-950/80 px-3 py-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {s.dice && (
                <div className="rounded-lg bg-slate-900/80 border border-white/10 px-2 py-1.5 flex items-center gap-2">
                  <Dice orientation={faceOrientations[s.dice.d1 as DiceValue]} size="2.1rem" disabled />
                  <Dice orientation={faceOrientations[s.dice.d2 as DiceValue]} size="2.1rem" disabled />
                  <span className="text-sm font-bold text-amber-200">= {s.dice.d1 + s.dice.d2}</span>
                </div>
              )}
              <p className="text-sm text-white/90 min-h-6">{turnText ?? phaseLabel}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {s.phase === 'pre-roll' && isMyTurn && (
                <button
                  type="button"
                  onClick={() => onAction({ type: 'roll' })}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-semibold text-slate-950"
                >
                  Roll dice
                </button>
              )}
              {s.phase === 'main-build' && isMyTurn && (
                <>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-lg text-sm border ${buildTap === 'road' ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                    disabled={!canBuyRoad || s.roadBuildingRemaining > 0}
                    onClick={() => setBuildTap((m) => (m === 'road' ? 'none' : 'road'))}
                  >
                    Road
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-lg text-sm border ${buildTap === 'settlement' ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                    disabled={!canBuySettlement || s.roadBuildingRemaining > 0}
                    onClick={() => setBuildTap((m) => (m === 'settlement' ? 'none' : 'settlement'))}
                  >
                    Settlement
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-lg text-sm border ${buildTap === 'city' ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-slate-800'}`}
                    disabled={!canBuyCity || s.roadBuildingRemaining > 0}
                    onClick={() => setBuildTap((m) => (m === 'city' ? 'none' : 'city'))}
                  >
                    City
                  </button>
                  {s.roadBuildingRemaining > 0 && (
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg bg-cyan-800/70 hover:bg-cyan-700 text-sm"
                      onClick={() => onAction({ type: 'skip-free-road' })}
                    >
                      Skip free road ({s.roadBuildingRemaining})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAction({ type: 'end-turn' })}
                    disabled={s.roadBuildingRemaining > 0}
                    className="px-4 py-2 rounded-lg bg-slate-700 border border-white/10 hover:bg-slate-600 disabled:opacity-40 text-sm font-medium"
                  >
                    End turn
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {myPlayer && (
          <div className="shrink-0 rounded-2xl border border-white/15 bg-slate-950/80 px-3 py-2">
            <p className="text-xs text-slate-400 mb-1 text-center">Your hand ({expandedHand.length})</p>
            <div className="mx-auto w-full max-w-[540px]">
              <div ref={handContainerRef} className="settler-hand">
                {expandedHand.length === 0 ? (
                  <p className="text-xs text-slate-500">No resources</p>
                ) : (
                  <div
                    className="settler-handSpread"
                    style={{
                      width: `${handLayout.spreadWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      transition: 'width 0.16s ease',
                    }}
                  >
                    {expandedHand.map((resource, i) => {
                      const isLast = i === expandedHand.length - 1;
                      const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;
                      return (
                        <motion.div
                          key={`${resource}-${i}`}
                          className="settler-handCardSlot"
                          initial={{ y: 40, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: i * 0.015 }}
                          style={{
                            left: `${i * handLayout.step}px`,
                            width: `${hitboxWidth}px`,
                            height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                            zIndex: i + 1,
                          }}
                        >
                          <span
                            className="settler-handCardWrap settler-handCardWrap--active"
                            style={{
                              width: `${handLayout.cardWidth}px`,
                              height: `${handLayout.cardHeight}px`,
                              transform: 'translateY(0px)',
                            }}
                          >
                            <span
                              className={`settler-resourceCard settler-resourceCard--${resource}`}
                              aria-label={resourceLabel(resource)}
                            >
                              <span className="settler-resourceCardSymbol" aria-hidden>
                                {RESOURCE_EMOJI[resource]}
                              </span>
                            </span>
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
