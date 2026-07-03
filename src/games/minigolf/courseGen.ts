import type { MinigolfCourse, MinigolfRect, MinigolfVec } from './types';

// Course play field is a fixed portrait rectangle in abstract units.
export const COURSE_W = 100;
export const COURSE_H = 140;
export const WALL_THICKNESS = 3;
export const BALL_RADIUS = 1.6;
export const CUP_RADIUS = 2.8;

export type Rng = () => number;

const TEE_Y = COURSE_H - 18;
const CUP_Y = 18;
/** Keep obstacles this far away from tee/cup so every hole has room to putt. */
const CLEARANCE = 9;

function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

function borderWalls(): MinigolfRect[] {
  return [
    { x: 0, y: 0, w: COURSE_W, h: WALL_THICKNESS },
    { x: 0, y: COURSE_H - WALL_THICKNESS, w: COURSE_W, h: WALL_THICKNESS },
    { x: 0, y: 0, w: WALL_THICKNESS, h: COURSE_H },
    { x: COURSE_W - WALL_THICKNESS, y: 0, w: WALL_THICKNESS, h: COURSE_H },
  ];
}

function rectClearOfPoint(rect: MinigolfRect, p: MinigolfVec, clearance: number): boolean {
  const nx = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
  return Math.hypot(p.x - nx, p.y - ny) >= clearance;
}

/** A horizontal wall spanning the course with a single gap the ball must pass through. */
function makeGateWalls(rng: Rng): MinigolfRect[] {
  const gapWidth = randRange(rng, 16, 26);
  const gapStart = randRange(rng, WALL_THICKNESS + 6, COURSE_W - WALL_THICKNESS - 6 - gapWidth);
  const y = randRange(rng, COURSE_H * 0.35, COURSE_H * 0.6);
  const walls: MinigolfRect[] = [];
  if (gapStart > WALL_THICKNESS + 1) {
    walls.push({ x: WALL_THICKNESS, y, w: gapStart - WALL_THICKNESS, h: WALL_THICKNESS });
  }
  const rightStart = gapStart + gapWidth;
  if (rightStart < COURSE_W - WALL_THICKNESS - 1) {
    walls.push({ x: rightStart, y, w: COURSE_W - WALL_THICKNESS - rightStart, h: WALL_THICKNESS });
  }
  return walls;
}

function makeBlock(rng: Rng): MinigolfRect {
  const w = randRange(rng, 8, 26);
  const h = randRange(rng, 6, 22);
  const x = randRange(rng, WALL_THICKNESS + 2, COURSE_W - WALL_THICKNESS - 2 - w);
  const y = randRange(rng, COURSE_H * 0.2, COURSE_H * 0.78 - h);
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    w: Math.round(w * 10) / 10,
    h: Math.round(h * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Reachability + par via coarse grid BFS
// ---------------------------------------------------------------------------

const GRID_CELL = 5;
const GRID_COLS = Math.floor(COURSE_W / GRID_CELL);
const GRID_ROWS = Math.floor(COURSE_H / GRID_CELL);

function cellBlocked(col: number, row: number, walls: MinigolfRect[]): boolean {
  const cx = (col + 0.5) * GRID_CELL;
  const cy = (row + 0.5) * GRID_CELL;
  const pad = BALL_RADIUS + 0.5;
  for (const w of walls) {
    if (
      cx >= w.x - pad && cx <= w.x + w.w + pad &&
      cy >= w.y - pad && cy <= w.y + w.h + pad
    ) {
      return true;
    }
  }
  return false;
}

/** Returns BFS path length from tee to cup in grid cells, or null if unreachable. */
export function pathLengthCells(walls: MinigolfRect[], tee: MinigolfVec, cup: MinigolfVec): number | null {
  const blocked: boolean[] = new Array(GRID_COLS * GRID_ROWS);
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      blocked[r * GRID_COLS + c] = cellBlocked(c, r, walls);
    }
  }

  const toCell = (p: MinigolfVec): number => {
    const c = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(p.x / GRID_CELL)));
    const r = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(p.y / GRID_CELL)));
    return r * GRID_COLS + c;
  };

  const start = toCell(tee);
  const goal = toCell(cup);
  if (blocked[start] || blocked[goal]) return null;

  const dist = new Array<number>(GRID_COLS * GRID_ROWS).fill(-1);
  dist[start] = 0;
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goal) return dist[cur];
    const c = cur % GRID_COLS;
    const r = Math.floor(cur / GRID_COLS);
    const neighbors = [
      c > 0 ? cur - 1 : -1,
      c < GRID_COLS - 1 ? cur + 1 : -1,
      r > 0 ? cur - GRID_COLS : -1,
      r < GRID_ROWS - 1 ? cur + GRID_COLS : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || blocked[n] || dist[n] !== -1) continue;
      dist[n] = dist[cur] + 1;
      queue.push(n);
    }
  }
  return null;
}

function computePar(pathCells: number, obstacleCount: number): number {
  const pathUnits = pathCells * GRID_CELL;
  const straightUnits = TEE_Y - CUP_Y;
  const detourRatio = pathUnits / straightUnits;
  let par = 2;
  if (detourRatio > 1.25 || obstacleCount >= 4) par = 3;
  if (detourRatio > 1.7 || obstacleCount >= 7) par = 4;
  if (detourRatio > 2.3) par = 5;
  return Math.max(2, Math.min(5, par));
}

// ---------------------------------------------------------------------------
// Hole generation
// ---------------------------------------------------------------------------

export function generateHole(rng: Rng = Math.random): MinigolfCourse {
  for (let attempt = 0; attempt < 30; attempt++) {
    // Fewer obstacles on later attempts so we always converge on a valid hole.
    const relax = Math.floor(attempt / 10);
    const tee: MinigolfVec = { x: randRange(rng, 18, COURSE_W - 18), y: TEE_Y };
    const cup: MinigolfVec = { x: randRange(rng, 18, COURSE_W - 18), y: CUP_Y };

    const obstacles: MinigolfRect[] = [];
    if (rng() < 0.55) {
      obstacles.push(...makeGateWalls(rng));
    }
    const blockCount = Math.max(1, randInt(rng, 3, 8 - obstacles.length) - relax * 2);
    for (let i = 0; i < blockCount; i++) {
      const block = makeBlock(rng);
      if (
        rectClearOfPoint(block, tee, CLEARANCE) &&
        rectClearOfPoint(block, cup, CLEARANCE)
      ) {
        obstacles.push(block);
      }
    }

    const gateClearOfEnds = obstacles.every(
      (o) => rectClearOfPoint(o, tee, CLEARANCE - 3) && rectClearOfPoint(o, cup, CLEARANCE - 3),
    );
    if (!gateClearOfEnds) continue;

    const walls = [...borderWalls(), ...obstacles];
    const pathCells = pathLengthCells(walls, tee, cup);
    if (pathCells == null) continue;

    return { walls, tee, cup, par: computePar(pathCells, obstacles.length) };
  }

  // Fallback: an empty hole is always playable.
  const tee: MinigolfVec = { x: COURSE_W / 2, y: TEE_Y };
  const cup: MinigolfVec = { x: COURSE_W / 2, y: CUP_Y };
  return { walls: borderWalls(), tee, cup, par: 2 };
}

export function generateCourses(count: number, rng: Rng = Math.random): MinigolfCourse[] {
  return Array.from({ length: count }, () => generateHole(rng));
}
