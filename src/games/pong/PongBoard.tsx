import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PongPlayer, PongState, PongZone } from './types';
import {
  BALL_RADIUS,
  PONG_TICK_MS,
  TRACK_WIDTH,
  hitTToZoneOffset,
  normalizeT,
  paddleArcBounds,
  paddleCenterT,
  perimeterPoint,
  perimeterTangentAngle,
  zoneArcLengthPx,
  zoneLabelT,
  zoneLength,
} from './geometry';
import {
  DEFAULT_PLAYER_COLOR,
  DARK_PLAYER_COLORS,
  PLAYER_COLOR_HEX,
  getPlayerHudTextColor,
  normalizePlayerColor,
} from '../../networking/playerColors';

interface PongBoardProps {
  state: PongState;
  myId: string;
  onAction: (action: unknown) => void;
  isHost?: boolean;
}

function mixHexWithWhite(hex: string, whitePercent: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const w = whitePercent / 100;
  const mix = (c: number) => Math.round(c * (1 - w) + 255 * w);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function drawTrackSegment(
  ctx: CanvasRenderingContext2D,
  startT: number,
  endT: number,
  width: number,
  height: number,
  aspect: number,
  color: string,
  lineWidth: number,
) {
  const steps = Math.max(8, Math.ceil(zoneLength({ playerId: '', startT, endT }) * 120));
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'butt';
  ctx.beginPath();

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    let t: number;
    if (endT >= startT) {
      t = startT + (endT - startT) * frac;
    } else {
      const len = 1 - startT + endT;
      t = normalizeT(startT + len * frac);
    }
    const p = perimeterPoint(t, aspect);
    const px = p.x * width;
    const py = p.y * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

const PONG_INTRO_BLINK_MS = 400;
const PONG_INTRO_BLINK_YELLOW = '#fde68a';
const PONG_INTRO_BLINK_WHITE = '#ffffff';

function drawPaddle(
  ctx: CanvasRenderingContext2D,
  zone: PongZone,
  paddleOffset: number,
  width: number,
  height: number,
  aspect: number,
  baseHex: string,
  trackWidthPx: number,
  introHighlight = false,
  blinkOnWhite = false,
) {
  const { startT, endT } = paddleArcBounds(zone, paddleOffset);
  const accent = introHighlight
    ? (blinkOnWhite ? PONG_INTRO_BLINK_WHITE : PONG_INTRO_BLINK_YELLOW)
    : mixHexWithWhite(baseHex, 55);

  drawTrackSegment(ctx, startT, endT, width, height, aspect, accent, trackWidthPx * 0.9);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  drawTrackSegment(ctx, startT, endT, width, height, aspect, '#ffffff', trackWidthPx * 0.9);
}

function drawZoneLabel(
  ctx: CanvasRenderingContext2D,
  zone: PongZone,
  player: PongPlayer,
  myId: string,
  width: number,
  height: number,
  aspect: number,
  trackWidthPx: number,
  introHighlight = false,
  blinkOnWhite = false,
) {
  const isMe = player.id === myId;
  const displayName = isMe ? 'You' : player.name;
  const hearts = '♥'.repeat(player.lives);
  const label = `${displayName} ${hearts}`;
  const t = zoneLabelT(zone);
  const p = perimeterPoint(t, aspect);
  const angle = perimeterTangentAngle(t, aspect);
  const px = p.x * width;
  const py = p.y * height;
  const maxWidth = zoneArcLengthPx(zone, width, height) * 0.85;

  let fontSize = Math.max(12, trackWidthPx * 0.55);

  const defaultTextColor = DARK_PLAYER_COLORS.has(normalizePlayerColor(player.color))
    ? '#ffffff'
    : '#111827';
  const introTextColor = blinkOnWhite ? PONG_INTRO_BLINK_WHITE : PONG_INTRO_BLINK_YELLOW;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const setFont = (size: number) => {
    ctx.font = `900 ${size}px system-ui, sans-serif`;
  };

  setFont(fontSize);
  while (fontSize > 10 && ctx.measureText(label).width > maxWidth) {
    fontSize -= 1;
    setFont(fontSize);
  }

  if (isMe && introHighlight) {
    ctx.fillStyle = introTextColor;
    ctx.fillText(`${displayName} ${hearts}`, 0, 0);
  } else {
    ctx.fillStyle = defaultTextColor;
    ctx.fillText(label, 0, 0);
  }

  ctx.restore();
}

function lerpPerimeterT(a: number, b: number, alpha: number): number {
  const na = normalizeT(a);
  const nb = normalizeT(b);
  let d = nb - na;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return normalizeT(na + d * alpha);
}

function interpolatePaddleOffset(
  prev: PongState,
  zone: PongZone,
  player: PongPlayer,
  prevPlayer: PongPlayer | undefined,
  alpha: number,
): number {
  const prevZone = prev.zones.find((z) => z.playerId === player.id) ?? zone;
  const prevOffset = prevPlayer?.paddleOffset ?? player.paddleOffset;
  const prevT = paddleCenterT(prevZone, prevOffset);
  const currT = paddleCenterT(zone, player.paddleOffset);
  const t = lerpPerimeterT(prevT, currT, alpha);
  return hitTToZoneOffset(zone, t);
}

function interpolateBallPosition(
  prev: PongState,
  current: PongState,
  alpha: number,
): { x: number; y: number } {
  const { ball: prevBall } = prev;
  const { ball: currBall } = current;

  if (current.startCountdownTicks > 0 || current.serveHoldTicks > 0 || (currBall.vx === 0 && currBall.vy === 0)) {
    return { x: 0.5, y: 0.5 };
  }

  if (Math.hypot(currBall.x - prevBall.x, currBall.y - prevBall.y) > 0.15) {
    return { x: currBall.x, y: currBall.y };
  }

  const velChanged =
    Math.abs(prevBall.vx - currBall.vx) > 1e-6
    || Math.abs(prevBall.vy - currBall.vy) > 1e-6;

  if (!velChanged) {
    if (alpha >= 1) {
      return { x: currBall.x, y: currBall.y };
    }
    return {
      x: prevBall.x + prevBall.vx * alpha,
      y: prevBall.y + prevBall.vy * alpha,
    };
  }

  return {
    x: prevBall.x + (currBall.x - prevBall.x) * alpha,
    y: prevBall.y + (currBall.y - prevBall.y) * alpha,
  };
}

function trackCacheKey(state: PongState, width: number, height: number): string {
  const zones = state.zones.map((z) => `${z.playerId}:${z.startT}:${z.endT}`).join('|');
  const colors = state.players.map((p) => `${p.id}:${p.color}:${p.eliminated}`).join('|');
  const aspect = width / height;
  return `${width}x${height}|${aspect}|${zones}|${colors}`;
}

function drawTrackLayer(
  ctx: CanvasRenderingContext2D,
  state: PongState,
  width: number,
  height: number,
  aspect: number,
  trackWidthPx: number,
) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  for (const zone of state.zones) {
    const player = state.players.find((p) => p.id === zone.playerId);
    const hex = PLAYER_COLOR_HEX[normalizePlayerColor(player?.color ?? DEFAULT_PLAYER_COLOR)];
    drawTrackSegment(ctx, zone.startT, zone.endT, width, height, aspect, hex, trackWidthPx);
  }
}

export default function PongBoard({ state, myId, onAction, isHost = false }: PongBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const stateRef = useRef<PongState>(state);
  const prevStateRef = useRef<PongState>(state);
  const prevTimeRef = useRef<number>(0);
  const inputRef = useRef<-1 | 0 | 1>(0);
  const myIdRef = useRef(myId);
  const lastReportedAspectRef = useRef<number>(0);

  const me = state.players.find((p) => p.id === myId);
  const canPlay = me && !me.eliminated && me.lives > 0 && !state.gameOver;

  const announcement = state.lifeLossAnnouncement;
  const announcementPlayer = announcement
    ? state.players.find((p) => p.id === announcement.playerId)
    : null;
  const introActive = state.startCountdownTicks > 0;
  const countdownSeconds = introActive
    ? Math.ceil((state.startCountdownTicks * PONG_TICK_MS) / 1000)
    : 0;

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
    if (!isHost || size.width <= 0 || size.height <= 0) return;
    const aspect = size.width / size.height;
    if (Math.abs(lastReportedAspectRef.current - aspect) < 0.005) return;
    lastReportedAspectRef.current = aspect;
    onAction({ type: 'set-board-aspect', aspect });
  }, [isHost, size.width, size.height, onAction]);

  const sendInput = useCallback(
    (direction: -1 | 0 | 1) => {
      if (inputRef.current === direction) return;
      inputRef.current = direction;
      onAction({ type: 'set-input', direction });
    },
    [onAction],
  );

  useEffect(() => {
    if (!canPlay) {
      sendInput(0);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        sendInput(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        sendInput(1);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
        sendInput(0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      sendInput(0);
    };
  }, [canPlay, sendInput]);

  useEffect(() => {
    prevStateRef.current = stateRef.current;
    stateRef.current = state;
    prevTimeRef.current = performance.now();
  }, [state]);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const trackWidthPx = Math.max(8, Math.min(size.width, size.height) * TRACK_WIDTH);
    const trackCanvas = document.createElement('canvas');
    const trackCtx = trackCanvas.getContext('2d');
    let cachedTrackKey = '';

    const ensureTrackCache = (current: PongState) => {
      if (!trackCtx) return;
      const renderAspect = size.width / size.height;
      const key = trackCacheKey(current, size.width, size.height);
      if (key === cachedTrackKey) return;

      trackCanvas.width = size.width * dpr;
      trackCanvas.height = size.height * dpr;
      trackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTrackLayer(trackCtx, current, size.width, size.height, renderAspect, trackWidthPx);
      cachedTrackKey = key;
    };

    const render = () => {
      const now = performance.now();
      const current = stateRef.current;
      const prev = prevStateRef.current;
      const renderAspect = size.width / size.height;
      ensureTrackCache(current);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cachedTrackKey) {
        ctx.drawImage(trackCanvas, 0, 0, size.width, size.height);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size.width, size.height);
      }

      const introActive = current.startCountdownTicks > 0;
      const blinkOnWhite = Math.floor(now / PONG_INTRO_BLINK_MS) % 2 === 0;

      for (const zone of current.zones) {
        const player = current.players.find((p) => p.id === zone.playerId);
        if (!player || player.eliminated) continue;
        const highlightIntro = introActive && player.id === myIdRef.current;
        drawZoneLabel(
          ctx,
          zone,
          player,
          myIdRef.current,
          size.width,
          size.height,
          renderAspect,
          trackWidthPx,
          highlightIntro,
          blinkOnWhite,
        );
      }

      const elapsed = now - prevTimeRef.current;
      const alpha = Math.min(1, elapsed / PONG_TICK_MS);

      const { x: ballX, y: ballY } = interpolateBallPosition(prev, current, alpha);

      const prevPlayers = prev.players;

      for (const zone of current.zones) {
        const player = current.players.find((p) => p.id === zone.playerId);
        if (!player || player.eliminated) continue;
        const prevPlayer = prevPlayers.find((p) => p.id === player.id);
        const paddleOffset = interpolatePaddleOffset(prev, zone, player, prevPlayer, alpha);
        const hex = PLAYER_COLOR_HEX[normalizePlayerColor(player.color)];
        const highlightIntro = introActive && player.id === myIdRef.current;
        drawPaddle(
          ctx,
          zone,
          paddleOffset,
          size.width,
          size.height,
          renderAspect,
          hex,
          trackWidthPx,
          highlightIntro,
          blinkOnWhite,
        );
      }

      const bx = ballX * size.width;
      const by = ballY * size.height;
      const ballPx = Math.max(3, Math.min(size.width, size.height) * BALL_RADIUS);
      const touchPlayer = current.lastTouchPlayerId
        ? current.players.find((p) => p.id === current.lastTouchPlayerId)
        : null;
      const ballColor = touchPlayer
        ? PLAYER_COLOR_HEX[normalizePlayerColor(touchPlayer.color)]
        : '#ffffff';
      ctx.beginPath();
      ctx.arc(bx, by, ballPx, 0, Math.PI * 2);
      ctx.fillStyle = ballColor;
      ctx.fill();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  if (state.gameOver) {
    const winner = state.players.find((p) => state.winners.includes(p.id));
    const sorted = [...state.players].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      return b.lives - a.lives;
    });

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex flex-col items-center justify-center space-y-6 text-center bg-black"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over!</h2>
        {winner && (
          <p className="text-xl text-white/80">{winner.name} wins!</p>
        )}
        <div className="space-y-3 w-full max-w-sm px-4">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-4 px-5 py-3 rounded-xl ${
                i === 0 && !p.eliminated
                  ? 'bg-amber-500/10 border border-amber-500/20'
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              <span
                className="font-medium"
                style={{ color: getPlayerHudTextColor(p.color) }}
              >
                {p.name}
              </span>
              <span className="text-white/60">{p.lives} lives</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  const trackAriaLabel = state.players
    .filter((p) => !p.eliminated)
    .map((p) => {
      const name = p.id === myId ? 'You' : p.name;
      const lifeWord = p.lives === 1 ? 'life' : 'lives';
      return `${name}: ${p.lives} ${lifeWord}`;
    })
    .join(', ');

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        role="img"
        aria-label={trackAriaLabel || 'Pong game board'}
      />

      {introActive && (
        <div className="pong-countdown" aria-live="polite">
          <motion.span
            key={countdownSeconds}
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="pong-countdownNumber"
          >
            {countdownSeconds}
          </motion.span>
        </div>
      )}

      {announcementPlayer && announcement && (
        <div className="pong-headsUp" aria-live="polite">
          <p className="pong-headsUpText">
            {announcementPlayer.id === myId ? (
              <>
                <span style={{ color: getPlayerHudTextColor(announcementPlayer.color) }}>You</span>
                {announcement.eliminated ? ' are eliminated' : ' lost a life'}
              </>
            ) : (
              <>
                <span style={{ color: getPlayerHudTextColor(announcementPlayer.color) }}>
                  {announcementPlayer.name}
                </span>
                {announcement.eliminated ? ' is eliminated' : ' lost a life'}
              </>
            )}
          </p>
        </div>
      )}

      {canPlay && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex h-[45dvh] gap-2 px-2 pb-2 touch-none sm:hidden">
          <button
            type="button"
            aria-label="Move paddle left"
            className="flex flex-1 h-full items-center justify-center rounded-2xl bg-white/10 text-white active:bg-white/25"
            onTouchStart={() => sendInput(-1)}
            onTouchEnd={() => sendInput(0)}
            onTouchCancel={() => sendInput(0)}
            onMouseDown={() => sendInput(-1)}
            onMouseUp={() => sendInput(0)}
            onMouseLeave={() => sendInput(0)}
          >
            <ChevronLeft className="h-12 w-12" />
          </button>
          <button
            type="button"
            aria-label="Move paddle right"
            className="flex flex-1 h-full items-center justify-center rounded-2xl bg-white/10 text-white active:bg-white/25"
            onTouchStart={() => sendInput(1)}
            onTouchEnd={() => sendInput(0)}
            onTouchCancel={() => sendInput(0)}
            onMouseDown={() => sendInput(1)}
            onMouseUp={() => sendInput(0)}
            onMouseLeave={() => sendInput(0)}
          >
            <ChevronRight className="h-12 w-12" />
          </button>
        </div>
      )}
    </div>
  );
}
