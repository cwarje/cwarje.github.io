import { useId, useLayoutEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Peg hole centers for one horizontal serpentine band. Index = score (0 … targetScore inclusive).
 * Row 1: left → right. Row 2: right → left (continuation after row 1 end).
 * 61: 31 + 31 holes. 121: 61 + 61 holes.
 */
function buildHolePositionsHorizontal(
  targetScore: 61 | 121,
  trackWidth: number,
  margin: number,
  bandTop: number,
  bandH: number,
  xPad: number
): { x: number; y: number }[] {
  const w = trackWidth - 2 * margin;
  const xLeft = xPad + margin;
  const row1y = bandTop + bandH * 0.3;
  const row2y = bandTop + bandH * 0.7;
  const holes: { x: number; y: number }[] = [];

  if (targetScore === 61) {
    const n0 = 30;
    const n1 = 30;
    for (let s = 0; s <= 30; s++) {
      const t = s / n0;
      holes.push({ x: xLeft + t * w, y: row1y });
    }
    for (let s = 31; s <= 61; s++) {
      const t = (s - 31) / n1;
      holes.push({ x: xLeft + (1 - t) * w, y: row2y });
    }
    return holes;
  }

  const n0 = 60;
  const n1 = 60;
  for (let s = 0; s <= 60; s++) {
    const t = s / n0;
    holes.push({ x: xLeft + t * w, y: row1y });
  }
  for (let s = 61; s <= 121; s++) {
    const t = (s - 61) / n1;
    holes.push({ x: xLeft + (1 - t) * w, y: row2y });
  }
  return holes;
}

/** Main peg path runs along this width (user units). */
const TRACK_LEN_H = 340;
/** Vertical space per scorer (two hole rows). */
const TRACK_BAND_H = 34;
const BOARD_PAD = 4;
const MARGIN = 10;

interface SidePegsProps {
  holes: { x: number; y: number }[];
  pegColor: string;
  score: number;
  targetScore: 61 | 121;
  pegR: number;
  duration: number;
}

function SidePegs({ holes, pegColor, score, targetScore, pegR, duration }: SidePegsProps) {
  const [pegPair, setPegPair] = useState<[number, number]>(() => [0, 0]);

  useLayoutEffect(() => {
    const clampScore = (n: number) => Math.max(0, Math.min(targetScore, n));
    const next = clampScore(score);
    setPegPair(([p1, p2]) => {
      const mx = Math.max(p1, p2);
      if (next < mx) {
        return [next, next];
      }
      if (next <= mx) {
        return [p1, p2];
      }
      if (p1 <= p2) {
        return [next, p2];
      }
      return [p1, next];
    });
  }, [score, targetScore]);

  const clamp = (n: number) => Math.max(0, Math.min(targetScore, n));
  const h1 = clamp(pegPair[0]);
  const h2 = clamp(pegPair[1]);
  const pt1 = holes[h1] ?? holes[0];
  const pt2 = holes[h2] ?? holes[0];
  const peg1First = h1 <= h2;

  const peg1El = (
    <motion.circle
      key="peg1"
      r={pegR}
      fill={pegColor}
      stroke={h1 > h2 ? '#f5e6c8' : '#2b2621'}
      strokeWidth={h1 > h2 ? 0.85 : 0.75}
      initial={false}
      animate={{ cx: pt1.x, cy: pt1.y }}
      transition={{ duration, ease: 'easeOut' }}
    />
  );
  const peg2El = (
    <motion.circle
      key="peg2"
      r={pegR}
      fill={pegColor}
      stroke={h2 > h1 ? '#f5e6c8' : '#2b2621'}
      strokeWidth={h2 > h1 ? 0.85 : 0.75}
      initial={false}
      animate={{ cx: pt2.x, cy: pt2.y }}
      transition={{ duration, ease: 'easeOut' }}
    />
  );

  return <>{peg1First ? [peg1El, peg2El] : [peg2El, peg1El]}</>;
}

export interface CribbagePegBoardSide {
  label: string;
  score: number;
  color: string;
}

export interface CribbagePegBoardProps {
  targetScore: 61 | 121;
  sides: CribbagePegBoardSide[];
}

export default function CribbagePegBoard({ targetScore, sides }: CribbagePegBoardProps) {
  const reduceMotion = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const gradId = `cb-wood-${uid}`;

  const n = sides.length;
  const innerH = n * TRACK_BAND_H;
  const viewW = BOARD_PAD * 2 + TRACK_LEN_H;
  const viewH = BOARD_PAD * 2 + innerH;
  const pegR = n >= 3 ? 3.1 : 3.6;
  const duration = reduceMotion ? 0 : 0.5;

  const trackLayouts = useMemo(() => {
    return Array.from({ length: n }, (_, i) => {
      const bandTop = BOARD_PAD + i * TRACK_BAND_H;
      const holes = buildHolePositionsHorizontal(
        targetScore,
        TRACK_LEN_H,
        MARGIN,
        bandTop,
        TRACK_BAND_H,
        BOARD_PAD
      );
      return { bandTop, holes };
    });
  }, [targetScore, n]);

  if (n === 0) return null;

  const x0 = BOARD_PAD + MARGIN;
  const x1 = BOARD_PAD + TRACK_LEN_H - MARGIN;

  return (
    <div className="min-w-0 w-full max-w-xl shrink-0">
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="h-auto w-full max-h-[min(50vh,300px)] select-none"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#56422d" />
            <stop offset="40%" stopColor="#755637" />
            <stop offset="100%" stopColor="#433325" />
          </linearGradient>
        </defs>
        <rect
          x={2}
          y={2}
          width={viewW - 4}
          height={viewH - 4}
          rx={12}
          fill={`url(#${gradId})`}
          stroke="#332b21"
          strokeWidth={1.5}
        />

        {trackLayouts.map((layout, i) => {
          const bt = layout.bandTop;
          const yTop = bt + TRACK_BAND_H * 0.3;
          const yBot = bt + TRACK_BAND_H * 0.7;
          return (
            <g key={i}>
              <path
                d={`M ${x0} ${yTop} L ${x1} ${yTop} L ${x1} ${yBot} L ${x0} ${yBot}`}
                fill="none"
                stroke="#2b2621"
                strokeWidth={0.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.4}
              />
              {/* Extra stroke on the right turn so the vertical leg reads as one track with the rows */}
              <line
                x1={x1}
                y1={yTop}
                x2={x1}
                y2={yBot}
                stroke="#2b2621"
                strokeWidth={0.95}
                strokeLinecap="round"
                opacity={0.3}
              />
              {layout.holes.map((p, hi) => (
                <circle
                  key={hi}
                  cx={p.x}
                  cy={p.y}
                  r={1.1}
                  fill="#221e1a"
                  stroke="#43382d"
                  strokeWidth={0.25}
                />
              ))}
              <circle
                cx={x1}
                cy={(yTop + yBot) / 2}
                r={1.1}
                fill="#221e1a"
                stroke="#43382d"
                strokeWidth={0.25}
              />
              <SidePegs
                holes={layout.holes}
                pegColor={sides[i].color}
                score={sides[i].score}
                targetScore={targetScore}
                pegR={pegR}
                duration={duration}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
