import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MinigolfBall, MinigolfCourse, MinigolfPlayer, MinigolfState } from './types';
import { getMinigolfTheme, type MinigolfCourseTheme } from './themes';
import { BALL_RADIUS, COURSE_H, COURSE_W, CUP_RADIUS } from './courseGen';
import { MINIGOLF_TICK_MS, SINK_TICKS, isBallAtRest } from './logic';
import {
  PLAYER_COLOR_HEX,
  getPlayerHudTextColor,
  normalizePlayerColor,
} from '../../networking/playerColors';

interface MinigolfBoardProps {
  state: MinigolfState;
  myId: string;
  onAction: (action: unknown) => void;
}

interface AimDrag {
  pointerId: number;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

interface BoardFit {
  boardWidth: number;
  boardHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** Drag distance (course units) that produces a full-power stroke. */
const FULL_POWER_DRAG_UNITS = 55;
const MIN_POWER = 0.05;

function drawCourse(
  ctx: CanvasRenderingContext2D,
  course: MinigolfCourse,
  scale: number,
  theme: MinigolfCourseTheme,
) {
  const { palette } = getMinigolfTheme(theme);
  const w = COURSE_W * scale;
  const h = COURSE_H * scale;

  ctx.fillStyle = palette.fairwayBase;
  ctx.fillRect(0, 0, w, h);

  // Mowed checker stripes.
  const cell = 14 * scale;
  ctx.fillStyle = palette.fairwayAlt;
  for (let row = 0; row * cell < h; row++) {
    for (let col = 0; col * cell < w; col++) {
      if ((row + col) % 2 === 0) continue;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }

  // Sand traps (desert slow zones).
  for (const trap of course.sandTraps ?? []) {
    const x = trap.x * scale;
    const y = trap.y * scale;
    const tw = trap.w * scale;
    const th = trap.h * scale;
    ctx.fillStyle = palette.sandTrapFill;
    ctx.fillRect(x, y, tw, th);
    ctx.strokeStyle = palette.sandTrapEdge;
    ctx.lineWidth = Math.max(1, 0.4 * scale);
    ctx.strokeRect(x, y, tw, th);
  }

  // Tee marker.
  ctx.beginPath();
  ctx.arc(course.tee.x * scale, course.tee.y * scale, 4.5 * scale, 0, Math.PI * 2);
  ctx.strokeStyle = palette.teeStroke;
  ctx.lineWidth = Math.max(1, 0.7 * scale);
  ctx.stroke();

  // Cup with rim + flag.
  const cupX = course.cup.x * scale;
  const cupY = course.cup.y * scale;
  const cupR = CUP_RADIUS * scale;
  ctx.beginPath();
  ctx.arc(cupX, cupY, cupR, 0, Math.PI * 2);
  ctx.fillStyle = palette.cupFill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, 0.5 * scale);
  ctx.stroke();

  const poleH = 14 * scale;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = Math.max(1, 0.7 * scale);
  ctx.beginPath();
  ctx.moveTo(cupX, cupY);
  ctx.lineTo(cupX, cupY - poleH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cupX, cupY - poleH);
  ctx.lineTo(cupX + 7 * scale, cupY - poleH + 2.5 * scale);
  ctx.lineTo(cupX, cupY - poleH + 5 * scale);
  ctx.closePath();
  ctx.fillStyle = '#ef4444';
  ctx.fill();

  // Sink hazards (water, quicksand, cracked ice).
  for (const water of course.waterHazards ?? []) {
    const x = water.x * scale;
    const y = water.y * scale;
    const ww = water.w * scale;
    const wh = water.h * scale;
    ctx.fillStyle = palette.hazardFill;
    ctx.fillRect(x, y, ww, wh);
    const inset = Math.max(1, 0.6 * scale);
    ctx.fillStyle = palette.hazardHighlight;
    ctx.fillRect(x + inset, y + inset, Math.max(0, ww - inset * 2), Math.max(0, wh - inset * 2));
    ctx.strokeStyle = palette.hazardEdge;
    ctx.lineWidth = Math.max(1, 0.4 * scale);
    ctx.strokeRect(x, y, ww, wh);
  }

  // Walls.
  for (const wall of course.walls) {
    const x = wall.x * scale;
    const y = wall.y * scale;
    const ww = wall.w * scale;
    const wh = wall.h * scale;
    ctx.fillStyle = palette.wallFill;
    ctx.fillRect(x, y, ww, wh);
    ctx.strokeStyle = palette.wallEdge;
    ctx.lineWidth = Math.max(1, 0.4 * scale);
    ctx.strokeRect(x, y, ww, wh);
  }
}

function fitCourse(width: number, height: number): BoardFit {
  const scale = Math.min(width / COURSE_W, height / COURSE_H);
  const boardWidth = Math.floor(COURSE_W * scale);
  const boardHeight = Math.floor(COURSE_H * scale);
  return {
    boardWidth,
    boardHeight,
    offsetX: Math.floor((width - boardWidth) / 2),
    offsetY: Math.floor((height - boardHeight) / 2),
    scale: boardWidth / COURSE_W,
  };
}

function interpolateBall(prev: MinigolfBall | undefined, cur: MinigolfBall, alpha: number): { x: number; y: number } {
  if (!prev) return { x: cur.x, y: cur.y };
  // Snap on teleports (hole change, cup capture).
  if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 20) return { x: cur.x, y: cur.y };
  return {
    x: prev.x + (cur.x - prev.x) * alpha,
    y: prev.y + (cur.y - prev.y) * alpha,
  };
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  ballX: number,
  ballY: number,
  aim: AimDrag,
  scale: number,
) {
  const dragX = aim.curX - aim.startX;
  const dragY = aim.curY - aim.startY;
  const dragUnits = Math.hypot(dragX, dragY) / scale;
  const power = Math.min(1, dragUnits / FULL_POWER_DRAG_UNITS);
  if (power < MIN_POWER) return;

  const angle = Math.atan2(-dragY, -dragX);
  const len = (10 + power * 32) * scale;
  const endX = ballX + Math.cos(angle) * len;
  const endY = ballY + Math.sin(angle) * len;

  const red = Math.round(255);
  const greenBlue = Math.round(255 * (1 - power * 0.85));
  const color = `rgb(${red}, ${greenBlue}, ${greenBlue})`;

  const headLen = 3.4 * scale;
  const headSpread = 0.45;
  const lineEndX = endX - Math.cos(angle) * headLen * Math.cos(headSpread);
  const lineEndY = endY - Math.sin(angle) * headLen * Math.cos(headSpread);

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, 1 * scale);
  ctx.beginPath();
  ctx.moveTo(ballX, ballY);
  ctx.lineTo(lineEndX, lineEndY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head — tip sits at the end of the power meter.
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - Math.cos(angle - headSpread) * headLen, endY - Math.sin(angle - headSpread) * headLen);
  ctx.lineTo(endX - Math.cos(angle + headSpread) * headLen, endY - Math.sin(angle + headSpread) * headLen);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function scoreLabel(score: number, par: number): string {
  const diff = score - par;
  if (diff === 0) return 'Par';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function completedTotal(p: MinigolfPlayer): number {
  return p.scores.reduce((s, v) => s + (v ?? 0), 0);
}

function hasRecordedScores(p: MinigolfPlayer): boolean {
  return p.scores.some((s) => s != null);
}

function sectionTotal(p: MinigolfPlayer, start: number, end: number): number {
  let sum = 0;
  for (let h = start; h < end; h++) {
    sum += p.scores[h] ?? 0;
  }
  return sum;
}

function scoreToneClass(score: number | undefined, par: number): string {
  if (score === undefined) return '';
  const diff = score - par;
  if (diff < 0) return 'minigolf-scorecardScore--under';
  if (diff > 0) return 'minigolf-scorecardScore--over';
  return 'minigolf-scorecardScore--par';
}

/** Alternating player-tinted cell backgrounds (base / lighter), like spreadsheet banding. */
function getScorecardCellBackground(
  color: MinigolfPlayer['color'],
  cellIndex: number,
): string {
  const hex = PLAYER_COLOR_HEX[normalizePlayerColor(color == null ? null : String(color))];
  if (cellIndex % 2 === 0) {
    return `color-mix(in srgb, ${hex} 88%, black)`;
  }
  return `color-mix(in srgb, ${hex} 78%, white)`;
}

function getScorecardLeaderIds(players: MinigolfPlayer[]): Set<string> {
  const scoredPlayers = players.filter(hasRecordedScores);
  if (scoredPlayers.length === 0) return new Set();

  const bestTotal = Math.min(...scoredPlayers.map(completedTotal));
  const leaders = scoredPlayers.filter((p) => completedTotal(p) === bestTotal);
  if (leaders.length > 1 && leaders.length === scoredPlayers.length) return new Set();
  return new Set(leaders.map((p) => p.id));
}

function ScorecardPlayerLabel({
  player,
  myId,
  isLeader,
}: {
  player: MinigolfPlayer;
  myId: string;
  isLeader: boolean;
}) {
  return (
    <div className="minigolf-scorecardPlayerInner">
      <span className="minigolf-scorecardCrown" aria-hidden={!isLeader}>
        {isLeader ? '👑' : ''}
      </span>
      <span className="minigolf-scorecardPlayerName">
        {player.id === myId ? 'You' : player.name}
      </span>
    </div>
  );
}

interface ScorecardSectionProps {
  holeStart: number;
  holeEnd: number;
  holesPlayed: number;
  courses: MinigolfCourse[];
  players: MinigolfPlayer[];
  myId: string;
  subtotalLabel: string;
  highlightHole?: number;
  compact: boolean;
  leaderIds: Set<string>;
}

function ScorecardSection({
  holeStart,
  holeEnd,
  holesPlayed,
  courses,
  players,
  myId,
  subtotalLabel,
  highlightHole,
  compact,
  leaderIds,
}: ScorecardSectionProps) {
  const holeCount = holeEnd - holeStart;
  const holeColPct = `${Math.floor(66 / holeCount)}%`;

  return (
    <div className="minigolf-scorecardScroll">
      <table className={`minigolf-scorecard${compact ? ' minigolf-scorecard--compact' : ''}`}>
        <colgroup>
          <col className="minigolf-scorecardCol--player" />
          {Array.from({ length: holeCount }, (_, i) => (
            <col key={i} style={{ width: holeColPct }} />
          ))}
          <col className="minigolf-scorecardCol--total" />
        </colgroup>
        <thead>
          <tr>
            <th className="minigolf-scorecardPlayerHead">
              <div className="minigolf-scorecardPlayerInner">
                <span className="minigolf-scorecardCrown" aria-hidden />
                <span className="minigolf-scorecardPlayerHeadLabel">Player</span>
              </div>
            </th>
            {Array.from({ length: holeCount }, (_, i) => {
              const holeIndex = holeStart + i;
              const played = holeIndex < holesPlayed;
              return (
                <th
                  key={holeIndex}
                  className={highlightHole === holeIndex ? 'minigolf-scorecardCol--highlight' : undefined}
                >
                  <span className="minigolf-scorecardHoleNum">{holeIndex + 1}</span>
                  {played && (
                    <span className="minigolf-scorecardPar">par {courses[holeIndex].par}</span>
                  )}
                </th>
              );
            })}
            <th>{subtotalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const playedEnd = Math.min(holeEnd, holesPlayed);
            const playedInSection = Math.max(0, playedEnd - holeStart);
            const subtotal =
              playedInSection > 0 ? sectionTotal(p, holeStart, playedEnd) : null;
            const isLeader = leaderIds.has(p.id);
            const subtotalCellIndex = 1 + holeCount;
            return (
              <tr key={p.id}>
                <td
                  className="minigolf-scorecardPlayerCell minigolf-scorecardTintedCell"
                  style={{ background: getScorecardCellBackground(p.color, 0) }}
                >
                  <ScorecardPlayerLabel player={p} myId={myId} isLeader={isLeader} />
                </td>
                {Array.from({ length: holeCount }, (_, i) => {
                  const holeIndex = holeStart + i;
                  const score = holeIndex < holesPlayed ? p.scores[holeIndex] : undefined;
                  const par = courses[holeIndex].par;
                  const cellIndex = 1 + i;
                  return (
                    <td
                      key={holeIndex}
                      style={{ background: getScorecardCellBackground(p.color, cellIndex) }}
                      className={[
                        'minigolf-scorecardScore minigolf-scorecardTintedCell',
                        scoreToneClass(score, par),
                        highlightHole === holeIndex ? 'minigolf-scorecardCol--highlight' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {score ?? '–'}
                    </td>
                  );
                })}
                <td
                  style={{ background: getScorecardCellBackground(p.color, subtotalCellIndex) }}
                  className={`minigolf-scorecardSubtotal minigolf-scorecardTintedCell${isLeader ? ' minigolf-scorecardSubtotal--leader' : ''}`}
                >
                  {subtotal ?? '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Scorecard({ state, myId }: { state: MinigolfState; myId: string }) {
  const holesPlayed = state.gameOver ? state.courses.length : state.holeIndex + 1;
  const totalHoles = state.courses.length;
  const useFrontBack = totalHoles === 18;
  const compact = holesPlayed > 6 || state.players.length >= 5;
  const highlightHole = state.phase === 'summary' ? state.holeIndex : undefined;

  const players = [...state.players].sort((a, b) => completedTotal(a) - completedTotal(b));
  const leaderIds = getScorecardLeaderIds(players);

  if (useFrontBack) {
    const showBack = holesPlayed > 9;
    return (
      <div className="minigolf-scorecardSections">
        <div>
          <p className="minigolf-scorecardSectionLabel">Front 9</p>
          <ScorecardSection
            holeStart={0}
            holeEnd={9}
            holesPlayed={holesPlayed}
            courses={state.courses}
            players={players}
            myId={myId}
            subtotalLabel="OUT"
            highlightHole={highlightHole}
            compact={compact}
            leaderIds={leaderIds}
          />
        </div>
        {showBack && (
          <div>
            <p className="minigolf-scorecardSectionLabel">Back 9</p>
            <ScorecardSection
              holeStart={9}
              holeEnd={18}
              holesPlayed={holesPlayed}
              courses={state.courses}
              players={players}
              myId={myId}
              subtotalLabel="IN"
              highlightHole={highlightHole}
              compact={compact}
              leaderIds={leaderIds}
            />
          </div>
        )}
        <div className="minigolf-scorecardScroll">
          <table className={`minigolf-scorecard minigolf-scorecard--grandTotal${compact ? ' minigolf-scorecard--compact' : ''}`}>
            <colgroup>
              <col className="minigolf-scorecardCol--player" />
              <col />
              <col className="minigolf-scorecardCol--total" />
            </colgroup>
            <tbody>
              {players.map((p) => {
                const total = completedTotal(p);
                const isLeader = leaderIds.has(p.id);
                return (
                  <tr key={p.id}>
                    <td
                      className="minigolf-scorecardPlayerCell minigolf-scorecardTintedCell"
                      style={{ background: getScorecardCellBackground(p.color, 0) }}
                    >
                      <ScorecardPlayerLabel player={p} myId={myId} isLeader={isLeader} />
                    </td>
                    <td
                      className="minigolf-scorecardGrandLabel minigolf-scorecardTintedCell"
                      style={{ background: getScorecardCellBackground(p.color, 1) }}
                    >
                      Total
                    </td>
                    <td
                      style={{ background: getScorecardCellBackground(p.color, 2) }}
                      className={`minigolf-scorecardGrandTotal minigolf-scorecardTintedCell${isLeader ? ' minigolf-scorecardGrandTotal--leader' : ''}`}
                    >
                      {total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <ScorecardSection
      holeStart={0}
      holeEnd={totalHoles}
      holesPlayed={holesPlayed}
      courses={state.courses}
      players={players}
      myId={myId}
      subtotalLabel="Total"
      highlightHole={highlightHole}
      compact={compact}
      leaderIds={leaderIds}
    />
  );
}

export default function MinigolfBoard({ state, myId, onAction }: MinigolfBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const stateRef = useRef<MinigolfState>(state);
  const prevStateRef = useRef<MinigolfState>(state);
  const prevTimeRef = useRef<number>(0);
  const aimRef = useRef<AimDrag | null>(null);
  const fitRef = useRef<BoardFit | null>(null);
  const myIdRef = useRef(myId);

  const course = state.courses[state.holeIndex];
  const me = state.players.find((p) => p.id === myId);
  const meDone = !!me && (me.holed || me.gaveUp);
  const canStroke =
    !!me && state.phase === 'playing' && !meDone && isBallAtRest(me.ball) && me.sinkTicks === 0 && !state.gameOver;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    prevStateRef.current = stateRef.current;
    stateRef.current = state;
    prevTimeRef.current = performance.now();
  }, [state]);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    setScorecardOpen(false);
  }, [state.holeIndex]);

  useEffect(() => {
    if (state.phase === 'summary') {
      setScorecardOpen(false);
    }
  }, [state.phase]);

  // -------------------------------------------------------------------------
  // Aim input (slingshot drag anywhere on the course)
  // -------------------------------------------------------------------------

  const canStrokeRef = useRef(canStroke);
  useEffect(() => {
    canStrokeRef.current = canStroke;
    if (!canStroke) aimRef.current = null;
  }, [canStroke]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canStrokeRef.current) return;
    const canvas = canvasRef.current;
    const fit = fitRef.current;
    const current = stateRef.current;
    if (!canvas || !fit) return;
    const myPlayer = current.players.find((p) => p.id === myIdRef.current);
    if (!myPlayer) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    canvas.setPointerCapture(e.pointerId);
    aimRef.current = { pointerId: e.pointerId, startX: px, startY: py, curX: px, curY: py };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const aim = aimRef.current;
    const canvas = canvasRef.current;
    if (!aim || !canvas || aim.pointerId !== e.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    aim.curX = e.clientX - rect.left;
    aim.curY = e.clientY - rect.top;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const aim = aimRef.current;
      const fit = fitRef.current;
      if (!aim || aim.pointerId !== e.pointerId) return;
      aimRef.current = null;
      if (!fit || !canStrokeRef.current) return;

      const dragX = aim.curX - aim.startX;
      const dragY = aim.curY - aim.startY;
      const dragUnits = Math.hypot(dragX, dragY) / fit.scale;
      const power = Math.min(1, dragUnits / FULL_POWER_DRAG_UNITS);
      if (power < MIN_POWER) return;

      const angle = Math.atan2(-dragY, -dragX);
      onAction({ type: 'stroke', angle, power });
    },
    [onAction],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (aimRef.current?.pointerId === e.pointerId) aimRef.current = null;
  }, []);

  // -------------------------------------------------------------------------
  // Canvas render loop
  // -------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;

    const fit = fitCourse(size.width, size.height);
    if (fit.boardWidth <= 0 || fit.boardHeight <= 0) return;
    fitRef.current = fit;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = fit.boardWidth * dpr;
    canvas.height = fit.boardHeight * dpr;
    canvas.style.width = `${fit.boardWidth}px`;
    canvas.style.height = `${fit.boardHeight}px`;
    canvas.style.left = `${fit.offsetX}px`;
    canvas.style.top = `${fit.offsetY}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Static course layer cache; redrawn when the hole changes.
    const courseCanvas = document.createElement('canvas');
    courseCanvas.width = fit.boardWidth * dpr;
    courseCanvas.height = fit.boardHeight * dpr;
    const courseCtx = courseCanvas.getContext('2d');
    let cachedHoleIndex = -1;

    let raf = 0;
    const render = () => {
      const now = performance.now();
      const current = stateRef.current;
      const prev = prevStateRef.current;
      const currentCourse = current.courses[current.holeIndex];

      if (courseCtx && cachedHoleIndex !== current.holeIndex) {
        courseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawCourse(courseCtx, currentCourse, fit.scale, currentCourse.theme);
        cachedHoleIndex = current.holeIndex;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(courseCanvas, 0, 0, fit.boardWidth, fit.boardHeight);

      const alpha = Math.min(1, (now - prevTimeRef.current) / MINIGOLF_TICK_MS);

      // Draw other players first so my ball renders on top.
      const ordered = [...current.players].sort((a, b) => {
        if (a.id === myIdRef.current) return 1;
        if (b.id === myIdRef.current) return -1;
        return 0;
      });

      for (const p of ordered) {
        if (p.holed) continue;
        const prevPlayer = prev.players.find((pp) => pp.id === p.id);
        const sinking = p.sinkTicks > 0;
        const pos = sinking
          ? { x: p.ball.x, y: p.ball.y }
          : interpolateBall(prevPlayer?.ball, p.ball, alpha);
        const x = pos.x * fit.scale;
        const y = pos.y * fit.scale;
        const isMe = p.id === myIdRef.current;
        const hex = PLAYER_COLOR_HEX[normalizePlayerColor(p.color)];

        const sinkProgress = sinking ? 1 - p.sinkTicks / SINK_TICKS : 0;
        const ballPx = Math.max(3, BALL_RADIUS * fit.scale * (sinking ? 1 - sinkProgress * 0.85 : 1));
        const ballAlpha = sinking ? 1 - sinkProgress : 1;
        const sinkYOffset = sinking ? sinkProgress * ballPx : 0;

        ctx.save();
        ctx.globalAlpha = ballAlpha;

        ctx.beginPath();
        ctx.arc(x, y + ballPx * 0.35 + sinkYOffset, ballPx * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y + sinkYOffset, ballPx, 0, Math.PI * 2);
        ctx.fillStyle = p.gaveUp ? 'rgba(120,120,120,0.6)' : hex;
        ctx.fill();
        if (isMe) {
          ctx.lineWidth = Math.max(1.5, ballPx * 0.35);
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        ctx.restore();

        if (!isMe) {
          const fontSize = Math.max(10, 3.4 * fit.scale);
          ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillText(p.name, x, y - ballPx - 2);
        }
      }

      const aim = aimRef.current;
      if (aim && canStrokeRef.current) {
        const myPlayer = current.players.find((p) => p.id === myIdRef.current);
        if (myPlayer) {
          drawAim(ctx, myPlayer.ball.x * fit.scale, myPlayer.ball.y * fit.scale, aim, fit.scale);
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // -------------------------------------------------------------------------
  // Overlays
  // -------------------------------------------------------------------------

  const themeConfig = getMinigolfTheme(course.theme);

  if (state.gameOver) {
    const winners = state.players.filter((p) => state.winners.includes(p.id));
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="minigolf-gameOver h-full flex flex-col items-center text-center px-4 overflow-y-auto"
        style={{ background: themeConfig.chrome.boardBg }}
      >
        <span className="text-7xl block mx-auto mt-6" aria-hidden>⛳</span>
        <h2 className="text-3xl font-extrabold text-white mt-4">Game Over!</h2>
        <p className="text-xl text-white/80 mt-2 mb-6">
          {winners.length === 1
            ? `${winners[0].id === myId ? 'You win' : `${winners[0].name} wins`}!`
            : `Tie: ${winners.map((w) => (w.id === myId ? 'You' : w.name)).join(', ')}`}
        </p>
        <div className="w-full flex justify-center pb-6">
          <div className="minigolf-summaryPanel minigolf-summaryPanel--light">
            <Scorecard state={state} myId={myId} />
          </div>
        </div>
      </motion.div>
    );
  }

  const summarySeconds = Math.ceil((state.summaryTicks * MINIGOLF_TICK_MS) / 1000);
  const isLastHole = state.holeIndex >= state.courses.length - 1;
  const waitingOn = state.players.filter((p) => !p.holed && !p.gaveUp);
  const manualScorecardOpen = scorecardOpen && state.phase === 'playing';
  const showScorecardOverlay = manualScorecardOpen || state.phase === 'summary';

  return (
    <div className="flex h-full w-full flex-col" style={{ background: themeConfig.chrome.boardBg }}>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute block touch-none"
          role="img"
          aria-label={`Minigolf hole ${state.holeIndex + 1} of ${state.courses.length}, par ${course.par}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />

        {/* Hole info */}
        <div className="minigolf-rightHud">
          <span className="minigolf-hudPill minigolf-hudPill--bold">
            Hole {state.holeIndex + 1}/{state.courses.length}
          </span>
          <span className="minigolf-hudPill">Par {course.par}</span>
          {me && (
            <span className="minigolf-hudPill">
              {me.holed
                ? `Holed in ${me.strokes} (${scoreLabel(me.strokes, course.par)})`
                : me.gaveUp
                  ? 'Max strokes'
                  : `Strokes: ${me.strokes}`}
            </span>
          )}
        </div>

        {/* Scorecard toggle + player status chips */}
        <div className="minigolf-leftHud">
          <button
            type="button"
            className={`minigolf-hudPill minigolf-scorecardBtn${manualScorecardOpen ? ' minigolf-scorecardBtn--active' : ''}`}
            onClick={() => setScorecardOpen((open) => !open)}
            aria-expanded={manualScorecardOpen}
            aria-label="Toggle scorecard"
          >
            Scorecard
          </button>
          <div className="minigolf-chips">
            {state.players.map((p) => (
              <div key={p.id} className="minigolf-hudPill minigolf-hudPill--dark minigolf-chip">
                <span
                  className="minigolf-chipDot"
                  style={{ background: PLAYER_COLOR_HEX[normalizePlayerColor(p.color)] }}
                />
                <span className="minigolf-chipName" style={{ color: getPlayerHudTextColor(p.color) }}>
                  {`${p.id === myId ? 'You' : p.name} (${completedTotal(p)})`}
                </span>
                <span className="text-white/70">
                  {p.holed ? '⛳' : p.gaveUp ? '✕' : p.strokes}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Waiting message for players who finished */}
        {meDone && state.phase === 'playing' && waitingOn.length > 0 && (
          <div className="minigolf-waiting" aria-live="polite">
            Waiting on {waitingOn.map((p) => (p.id === myId ? 'you' : p.name)).join(', ')}…
          </div>
        )}

        {/* Aim hint */}
        {canStroke && me && me.strokes === 0 && state.holeIndex === 0 && (
          <div className="minigolf-hint">Drag to aim, release to putt</div>
        )}

        {/* Scorecard overlay (manual toggle or between-holes summary) */}
        {showScorecardOverlay && (
          <div
            className={`minigolf-summaryOverlay${manualScorecardOpen ? ' minigolf-summaryOverlay--plain' : ''}`}
            onClick={manualScorecardOpen ? () => setScorecardOpen(false) : undefined}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              className="minigolf-summaryPanel minigolf-summaryPanel--light"
              onClick={manualScorecardOpen ? (e) => e.stopPropagation() : undefined}
            >
              {state.phase === 'summary' ? (
                <>
                  <h3 className="minigolf-summaryPanelTitle">
                    Hole {state.holeIndex + 1} complete
                  </h3>
                  <Scorecard state={state} myId={myId} />
                  <p className="minigolf-summaryPanelMeta">
                    {isLastHole ? 'Final results' : 'Next hole'} in {summarySeconds}s…
                  </p>
                </>
              ) : (
                <>
                  <h3 className="minigolf-summaryPanelTitle">Scorecard</h3>
                  <Scorecard state={state} myId={myId} />
                </>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
