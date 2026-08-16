import {
  CHECKERS_PER_PLAYER,
  POINT_COUNT,
  type BackgammonState,
  type LegalMove,
  type MoveFrom,
  type MoveTo,
  type Side,
  createStartingPoints,
  currentSide,
} from './types';

export function directionForSide(side: Side): -1 | 1 {
  return side === 'white' ? -1 : 1;
}

/** Home board point indices (inclusive). */
export function homeBoardRange(side: Side): { start: number; end: number } {
  return side === 'white' ? { start: 0, end: 5 } : { start: 18, end: 23 };
}

export function cloneState(state: BackgammonState): BackgammonState {
  return {
    ...state,
    points: [...state.points],
    bar: { ...state.bar },
    off: { ...state.off },
    movesRemaining: [...state.movesRemaining],
    dice: state.dice ? [...state.dice] as [number, number] : null,
    players: [...state.players] as BackgammonState['players'],
  };
}

function signedCount(points: number[], index: number, side: Side): number {
  const v = points[index] ?? 0;
  return side === 'white' ? Math.max(0, v) : Math.max(0, -v);
}

function opponentCount(points: number[], index: number, side: Side): number {
  const v = points[index] ?? 0;
  return side === 'white' ? Math.max(0, -v) : Math.max(0, v);
}

function removeChecker(points: number[], index: number, side: Side): void {
  const self = signedCount(points, index, side);
  const opp = opponentCount(points, index, side);
  const nextSelf = self - 1;
  if (nextSelf <= 0) {
    points[index] = side === 'white' ? (opp ? -opp : 0) : opp || 0;
  } else {
    points[index] = side === 'white' ? nextSelf : -nextSelf;
  }
}

function addChecker(points: number[], index: number, side: Side): boolean {
  const opp = opponentCount(points, index, side);
  if (opp === 1) {
    points[index] = side === 'white' ? 1 : -1;
    return true;
  }
  const self = signedCount(points, index, side);
  points[index] = side === 'white' ? self + 1 : -(self + 1);
  return false;
}

function barCount(state: BackgammonState, side: Side): number {
  return side === 'white' ? state.bar.white : state.bar.black;
}

function offCount(state: BackgammonState, side: Side): number {
  return side === 'white' ? state.off.white : state.off.black;
}

export function canBearOff(state: BackgammonState, side: Side): boolean {
  const { start, end } = homeBoardRange(side);
  for (let i = 0; i < POINT_COUNT; i++) {
    if (i >= start && i <= end) continue;
    if (signedCount(state.points, i, side) > 0) return false;
  }
  if (barCount(state, side) > 0) return false;
  return true;
}

function highestHomePoint(state: BackgammonState, side: Side): number | null {
  const { start, end } = homeBoardRange(side);
  if (side === 'white') {
    for (let i = end; i >= start; i--) {
      if (signedCount(state.points, i, side) > 0) return i;
    }
  } else {
    for (let i = start; i <= end; i++) {
      if (signedCount(state.points, i, side) > 0) return i;
    }
  }
  return null;
}

function entryPointIndex(side: Side, die: number): number {
  return side === 'white' ? 24 - die : die - 1;
}

function destinationIndex(from: number, side: Side, die: number): number {
  return side === 'white' ? from - die : from + die;
}

function canLandOn(points: number[], index: number, side: Side): boolean {
  if (index < 0 || index >= POINT_COUNT) return false;
  const opp = opponentCount(points, index, side);
  return opp <= 1;
}

function bearOffDistance(side: Side, from: number): number {
  return side === 'white' ? from + 1 : 24 - from;
}

function getSingleDieMoves(state: BackgammonState, side: Side, die: number): LegalMove[] {
  const moves: LegalMove[] = [];
  const points = state.points;
  const onBar = barCount(state, side) > 0;
  const bearing = canBearOff(state, side);

  if (onBar) {
    const entry = entryPointIndex(side, die);
    if (entry < 0 || entry >= POINT_COUNT) return moves;
    const opp = opponentCount(points, entry, side);
    if (opp <= 1) {
      moves.push({
        from: 'bar',
        to: entry,
        dieUsed: die,
        hit: opp === 1,
      });
    }
    return moves;
  }

  for (let i = 0; i < POINT_COUNT; i++) {
    if (signedCount(points, i, side) === 0) continue;

    const dest = destinationIndex(i, side, die);

    if (dest >= 0 && dest < POINT_COUNT) {
      if (canLandOn(points, dest, side)) {
        const opp = opponentCount(points, dest, side);
        moves.push({
          from: i,
          to: dest,
          dieUsed: die,
          hit: opp === 1,
        });
      }
      continue;
    }

    if (!bearing || dest < 0 || dest >= POINT_COUNT) {
      const { start, end } = homeBoardRange(side);
      if (i < start || i > end) continue;

      const dist = bearOffDistance(side, i);
      if (die === dist) {
        moves.push({ from: i, to: 'off', dieUsed: die });
      } else if (die > dist) {
        const highest = highestHomePoint(state, side);
        if (highest === i) {
          moves.push({ from: i, to: 'off', dieUsed: die });
        }
      }
    }
  }

  return moves;
}

export function applyMove(state: BackgammonState, from: MoveFrom, to: MoveTo, dieUsed: number): BackgammonState {
  const next = cloneState(state);
  const side = currentSide(state);

  if (from === 'bar') {
    if (side === 'white') next.bar.white -= 1;
    else next.bar.black -= 1;
  } else {
    removeChecker(next.points, from, side);
  }

  let hit = false;
  if (to === 'off') {
    if (side === 'white') next.off.white += 1;
    else next.off.black += 1;
  } else {
    hit = addChecker(next.points, to, side);
    if (hit) {
      if (side === 'white') next.bar.black += 1;
      else next.bar.white += 1;
    }
  }

  const idx = next.movesRemaining.indexOf(dieUsed);
  if (idx >= 0) next.movesRemaining.splice(idx, 1);

  next.lastMove = { from, to, dieUsed, hit, side };
  return next;
}

function sequencesFromState(state: BackgammonState, side: Side, remaining: number[]): LegalMove[][] {
  if (remaining.length === 0) return [[]];

  const allMoves: LegalMove[][] = [];
  const seen = new Set<string>();

  for (let i = 0; i < remaining.length; i++) {
    const die = remaining[i]!;
    const rest = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
    const moves = getSingleDieMoves(state, side, die);

    for (const move of moves) {
      const after = applyMove(
        { ...state, movesRemaining: [...remaining] },
        move.from,
        move.to,
        move.dieUsed
      );
      const subSeqs = sequencesFromState(after, side, rest);
      for (const sub of subSeqs) {
        const seq = [move, ...sub];
        const key = seq.map((m) => `${m.from}->${m.to}:${m.dieUsed}`).join('|');
        if (!seen.has(key)) {
          seen.add(key);
          allMoves.push(seq);
        }
      }
    }
  }

  return allMoves;
}

function maxDiceUsedCount(sequences: LegalMove[][]): number {
  let max = 0;
  for (const seq of sequences) {
    if (seq.length > max) max = seq.length;
  }
  return max;
}

/** Legal complete-turn sequences respecting must-use-max-dice rules. */
export function getAllLegalTurnSequences(state: BackgammonState): LegalMove[][] {
  const side = currentSide(state);
  const remaining = state.movesRemaining;
  if (remaining.length === 0) return [[]];

  const allSeqs = sequencesFromState(state, side, remaining);
  if (allSeqs.length === 0) return [[]];

  const maxUsed = maxDiceUsedCount(allSeqs);
  return allSeqs.filter((seq) => seq.length === maxUsed);
}

export function getLegalMovesForRemainingDice(state: BackgammonState): LegalMove[] {
  const sequences = getAllLegalTurnSequences(state);
  if (sequences.length === 0 || sequences[0]!.length === 0) return [];

  const firstMoves = new Map<string, LegalMove>();
  for (const seq of sequences) {
    const move = seq[0];
    if (!move) continue;
    const key = `${move.from}->${move.to}:${move.dieUsed}`;
    firstMoves.set(key, move);
  }
  return [...firstMoves.values()];
}

export function hasAnyLegalMove(state: BackgammonState): boolean {
  return getLegalMovesForRemainingDice(state).length > 0;
}

export function diceToMovesRemaining(d1: number, d2: number): number[] {
  if (d1 === d2) return [d1, d1, d1, d1];
  return [d1, d2];
}

export function isValidMove(state: BackgammonState, from: MoveFrom, to: MoveTo): LegalMove | null {
  const legal = getLegalMovesForRemainingDice(state);
  return legal.find((m) => m.from === from && m.to === to) ?? null;
}

export function checkWin(state: BackgammonState, side: Side): boolean {
  return offCount(state, side) >= CHECKERS_PER_PLAYER;
}

export { createStartingPoints };
