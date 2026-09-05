import { applyMove, getAllLegalTurnSequences, homeBoardRange } from './rules';
import type { BackgammonState, LegalMove, Side } from './types';
import { POINT_COUNT, currentSide } from './types';

function signedCount(points: number[], index: number, side: Side): number {
  const v = points[index] ?? 0;
  return side === 'white' ? Math.max(0, v) : Math.max(0, -v);
}

function barCount(state: BackgammonState, side: Side): number {
  return side === 'white' ? state.bar.white : state.bar.black;
}

function offCount(state: BackgammonState, side: Side): number {
  return side === 'white' ? state.off.white : state.off.black;
}

function pipDistance(side: Side, pointIndex: number): number {
  return side === 'white' ? pointIndex + 1 : 24 - pointIndex;
}

/** Total pip count for one side (bar checkers count as 25 pips each). */
export function pipCount(state: BackgammonState, side: Side): number {
  let pips = barCount(state, side) * 25;
  for (let i = 0; i < POINT_COUNT; i++) {
    const count = signedCount(state.points, i, side);
    if (count > 0) pips += count * pipDistance(side, i);
  }
  return pips;
}

function opponentSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

/** Count opponent points that can directly hit a blot at `blotIndex` with a single die (1–6). */
function directShotExposure(state: BackgammonState, side: Side, blotIndex: number): number {
  const opp = opponentSide(side);
  let exposure = 0;
  for (let die = 1; die <= 6; die++) {
    const from =
      opp === 'white' ? blotIndex + die : blotIndex - die;
    if (from < 0 || from >= POINT_COUNT) continue;
    if (signedCount(state.points, from, opp) > 0) exposure += 1;
  }
  return exposure;
}

function evaluateSidePosition(state: BackgammonState, side: Side): number {
  let score = 0;

  score -= barCount(state, side) * 25;
  score += barCount(state, opponentSide(side)) * 20;
  score += offCount(state, side) * 3;

  const { start: homeStart, end: homeEnd } = homeBoardRange(side);

  for (let i = 0; i < POINT_COUNT; i++) {
    const count = signedCount(state.points, i, side);
    if (count === 0) continue;

    if (count >= 2) {
      score += 4;
      if (i >= homeStart && i <= homeEnd) score += 3;
    } else if (count === 1) {
      const exposure = directShotExposure(state, side, i);
      score -= exposure * 6;
    }
  }

  return score;
}

/** Evaluate position from the given side's perspective (higher = better). */
export function evaluatePosition(state: BackgammonState, side: Side): number {
  const myPips = pipCount(state, side);
  const oppPips = pipCount(state, opponentSide(side));
  return (oppPips - myPips) + evaluateSidePosition(state, side);
}

function applySequence(state: BackgammonState, sequence: LegalMove[]): BackgammonState {
  let next = state;
  for (const move of sequence) {
    next = applyMove(next, move.from, move.to, move.dieUsed);
  }
  return next;
}

/** Pick the first move of the best-scoring complete turn sequence. */
export function pickBestBotMove(state: BackgammonState): LegalMove | null {
  const sequences = getAllLegalTurnSequences(state);
  if (sequences.length === 0 || sequences[0]!.length === 0) return null;

  const side = currentSide(state);
  let best: LegalMove | null = null;
  let bestScore = -Infinity;

  for (const seq of sequences) {
    const move = seq[0];
    if (!move) continue;
    const after = applySequence(state, seq);
    const score = evaluatePosition(after, side);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}
