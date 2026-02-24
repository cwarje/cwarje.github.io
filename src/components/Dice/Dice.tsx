import { type TransitionEvent } from 'react';
import { motion } from 'framer-motion';
import './Dice.css';

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type CubeOrientation = { x: number; y: number };

export const faceOrientations: Record<DiceValue, CubeOrientation> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 90, y: 0 },
};

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function getForwardRotationDelta(currentDeg: number, targetDeg: number): number {
  return positiveModulo(targetDeg - currentDeg, 360);
}

const pipPositions: Record<DiceValue, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function PipFace({ value, className = '' }: { value: DiceValue; className?: string }) {
  const activePips = new Set(pipPositions[value]);

  return (
    <div className={`pip-face ${className}`.trim()} aria-label={`Dice face ${value}`}>
      {Array.from({ length: 9 }).map((_, index) => (
        <span
          key={index}
          className={`pip ${activePips.has(index) ? 'pip-on' : ''}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

interface DiceProps {
  orientation: CubeOrientation;
  rolling?: boolean;
  held?: boolean;
  golden?: boolean;
  onClick?: () => void;
  onTransitionEnd?: (event: TransitionEvent<HTMLDivElement>) => void;
  size?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export default function Dice({
  orientation,
  rolling = false,
  held = false,
  golden = false,
  onClick,
  onTransitionEnd,
  size,
  disabled = false,
  className = '',
  ariaLabel,
}: DiceProps) {
  const sizeStyle = size ? { '--dice-size': size } as React.CSSProperties : undefined;

  return (
    <div className={`dice-scene ${className}`.trim()} style={sizeStyle}>
      <motion.div
        className="dice-interactive"
        whileHover={!rolling && !held && !disabled ? { scale: 1.02, y: -4 } : {}}
        whileTap={!rolling && !held && !disabled ? { scale: 0.98 } : {}}
        onClick={disabled ? undefined : onClick}
        onTransitionEnd={onTransitionEnd}
        role={onClick ? 'button' : undefined}
        tabIndex={rolling || disabled ? -1 : 0}
        aria-pressed={held}
        aria-label={ariaLabel}
      >
        <div
          className={`dice-cube ${rolling ? 'rolling' : ''} ${held ? 'held' : ''} ${golden ? 'golden' : ''}`.trim()}
          style={{ transform: `rotateX(${orientation.x}deg) rotateY(${orientation.y}deg)` }}
        >
          <PipFace value={1} className="cube-face face-front" />
          <PipFace value={2} className="cube-face face-back" />
          <PipFace value={3} className="cube-face face-right" />
          <PipFace value={4} className="cube-face face-left" />
          <PipFace value={5} className="cube-face face-top" />
          <PipFace value={6} className="cube-face face-bottom" />
        </div>
      </motion.div>
    </div>
  );
}
