import type { MinigolfCourse, MinigolfLandmine, MinigolfRect, MinigolfVec } from './types';
import {
  getMinigolfTheme,
  getObstacleMotionKind,
  pickObstacleEmoji,
  pickRandomCourseTheme,
  type MinigolfCourseTheme,
  type MinigolfThemeOption,
} from './themes';

// Course play field is a fixed portrait rectangle in abstract units.
export const COURSE_W = 100;
export const COURSE_H = 140;
export const WALL_THICKNESS = 3;
export const BALL_RADIUS = 1.6;
export const CUP_RADIUS = 2.8;
/** Canvas stroke width for walls, hazards, sand traps, and similar course borders. */
export function obstacleEdgeWidth(scale: number): number {
  return Math.max(1, 0.4 * scale);
}
/** Radius around the tee where ball-to-ball collisions are ignored. */
export const TEE_STARTING_AREA_RADIUS = 10;
/** Ball must enter this range to detonate a proximity obstacle. */
export const LANDMINE_TRIGGER_RADIUS = 3.5;
/** On detonation, all balls within this radius are knocked back. */
export const LANDMINE_EXPLOSION_RADIUS = 8;
export const LANDMINE_COUNT_MIN = 2;
export const LANDMINE_COUNT_MAX = 3;

export type Rng = () => number;

const TEE_Y = COURSE_H - 18;
const CUP_Y = 18;
/** Keep obstacles this far away from tee/cup so every hole has room to putt. */
const CLEARANCE = 9;
const LANDMINE_MIN_SPACING = 8;
const LANDMINE_PLACEMENT_ATTEMPTS = 40;

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

export function courseBorderWalls(): MinigolfRect[] {
  return borderWalls();
}

function splitCourseBorders(
  generation: ReturnType<typeof getMinigolfTheme>['generation'],
  solidObstacles: MinigolfRect[],
  interiorWater: MinigolfRect[],
): { walls: MinigolfRect[]; waterHazards: MinigolfRect[] } {
  const borders = borderWalls();
  if (generation.borderAsWaterHazard) {
    return {
      walls: [...solidObstacles],
      waterHazards: [...borders, ...interiorWater],
    };
  }
  return {
    walls: [...borders, ...solidObstacles],
    waterHazards: interiorWater,
  };
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

function pointClearOfWalls(p: MinigolfVec, walls: MinigolfRect[]): boolean {
  const pad = BALL_RADIUS;
  for (const w of walls) {
    if (
      p.x >= w.x - pad && p.x <= w.x + w.w + pad &&
      p.y >= w.y - pad && p.y <= w.y + w.h + pad
    ) {
      return false;
    }
  }
  return true;
}

function pointClearOfLandmines(p: MinigolfVec, landmines: MinigolfLandmine[]): boolean {
  return landmines.every((lm) => Math.hypot(p.x - lm.x, p.y - lm.y) >= LANDMINE_MIN_SPACING);
}

function canPlaceWaterHazard(
  generation: ReturnType<typeof getMinigolfTheme>['generation'],
  waterHazards: MinigolfRect[],
): boolean {
  if (generation.disallowWaterHazards) return false;
  const max = generation.maxWaterHazards;
  if (max != null && waterHazards.length >= max) return false;
  return true;
}

function tryPlaceHazardBlock(
  block: MinigolfRect,
  rng: Rng,
  generation: ReturnType<typeof getMinigolfTheme>['generation'],
  sandTraps: MinigolfRect[],
  waterHazards: MinigolfRect[],
  solidObstacles: MinigolfRect[],
): void {
  const sandSplit = generation.sandTrapSplit;
  const mudSplit = generation.mudTrapSplit;
  if (sandSplit != null && rng() < sandSplit) {
    sandTraps.push(block);
    return;
  }
  if (mudSplit != null && rng() < mudSplit) {
    sandTraps.push(block);
    return;
  }
  if (canPlaceWaterHazard(generation, waterHazards)) {
    waterHazards.push(block);
    return;
  }
  if (generation.disallowSolidWalls) {
    sandTraps.push(block);
    return;
  }
  solidObstacles.push(block);
}

export function placeLandmines(
  rng: Rng,
  tee: MinigolfVec,
  cup: MinigolfVec,
  walls: MinigolfRect[],
  theme: MinigolfCourseTheme,
): MinigolfLandmine[] {
  const { generation } = getMinigolfTheme(theme);
  const countRange = generation.landmineCount ?? { min: LANDMINE_COUNT_MIN, max: LANDMINE_COUNT_MAX };
  const count = randInt(rng, countRange.min, countRange.max);
  const landmines: MinigolfLandmine[] = [];
  const margin = WALL_THICKNESS + BALL_RADIUS + 1;
  const minX = margin;
  const maxX = COURSE_W - margin;
  const minY = margin;
  const maxY = COURSE_H - margin;

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < LANDMINE_PLACEMENT_ATTEMPTS; attempt++) {
      const p: MinigolfVec = {
        x: Math.round(randRange(rng, minX, maxX) * 10) / 10,
        y: Math.round(randRange(rng, minY, maxY) * 10) / 10,
      };
      if (Math.hypot(p.x - tee.x, p.y - tee.y) < CLEARANCE) continue;
      if (Math.hypot(p.x - cup.x, p.y - cup.y) < CLEARANCE) continue;
      if (!pointClearOfWalls(p, walls)) continue;
      if (!pointClearOfLandmines(p, landmines)) continue;
      const emoji = pickObstacleEmoji(theme, rng);
      const motion = getObstacleMotionKind(emoji) ?? undefined;
      landmines.push({ ...p, emoji, motion });
      break;
    }
  }
  return landmines;
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

export function generateHole(
  rng: Rng = Math.random,
  theme: MinigolfCourseTheme = 'classic',
  obstaclesEnabled = false,
): MinigolfCourse {
  const { generation } = getMinigolfTheme(theme);
  for (let attempt = 0; attempt < 30; attempt++) {
    // Fewer obstacles on later attempts so we always converge on a valid hole.
    const relax = Math.floor(attempt / 10);
    const tee: MinigolfVec = { x: randRange(rng, 18, COURSE_W - 18), y: TEE_Y };
    const cup: MinigolfVec = { x: randRange(rng, 18, COURSE_W - 18), y: CUP_Y };

    const solidObstacles: MinigolfRect[] = [];
    const waterHazards: MinigolfRect[] = [];
    const sandTraps: MinigolfRect[] = [];
    if (!generation.disallowSolidWalls && rng() < generation.gateChance) {
      solidObstacles.push(...makeGateWalls(rng));
    }
    const blockCount = generation.disallowSolidWalls
      ? Math.max(2, randInt(rng, 4, 8) - relax)
      : Math.max(1, randInt(rng, 3, 8 - solidObstacles.length) - relax * 2);
    for (let i = 0; i < blockCount; i++) {
      const block = makeBlock(rng);
      if (
        rectClearOfPoint(block, tee, CLEARANCE) &&
        rectClearOfPoint(block, cup, CLEARANCE)
      ) {
        if (rng() < generation.hazardBlockChance) {
          tryPlaceHazardBlock(block, rng, generation, sandTraps, waterHazards, solidObstacles);
        } else if (!generation.disallowSolidWalls) {
          solidObstacles.push(block);
        } else {
          tryPlaceHazardBlock(block, rng, generation, sandTraps, waterHazards, solidObstacles);
        }
      }
    }

    const allObstacles = [...solidObstacles, ...waterHazards, ...sandTraps];
    const gateClearOfEnds = allObstacles.every(
      (o) => rectClearOfPoint(o, tee, CLEARANCE - 3) && rectClearOfPoint(o, cup, CLEARANCE - 3),
    );
    if (!gateClearOfEnds) continue;

    const { walls, waterHazards: finalWaterHazards } = splitCourseBorders(
      generation,
      solidObstacles,
      waterHazards,
    );
    const pathCells = pathLengthCells(walls, tee, cup);
    if (pathCells == null) continue;

    const allObstaclesWithBorder = [...solidObstacles, ...finalWaterHazards, ...sandTraps];
    const course: MinigolfCourse = {
      walls,
      waterHazards: finalWaterHazards,
      tee,
      cup,
      par: computePar(pathCells, allObstaclesWithBorder.length),
      theme,
    };
    if (sandTraps.length > 0) course.sandTraps = sandTraps;
    if (obstaclesEnabled) {
      const landmines = placeLandmines(rng, tee, cup, walls, theme);
      if (landmines.length > 0) course.landmines = landmines;
    }
    return course;
  }

  // Fallback: an empty hole is always playable.
  const tee: MinigolfVec = { x: COURSE_W / 2, y: TEE_Y };
  const cup: MinigolfVec = { x: COURSE_W / 2, y: CUP_Y };
  const { walls, waterHazards } = splitCourseBorders(generation, [], []);
  return { walls, waterHazards, tee, cup, par: 2, theme };
}

export function generateCourses(
  count: number,
  rng: Rng = Math.random,
  themeOption: MinigolfThemeOption = 'classic',
  obstaclesEnabled = false,
): MinigolfCourse[] {
  return Array.from({ length: count }, () => {
    const theme = themeOption === 'random' ? pickRandomCourseTheme(rng) : themeOption;
    return generateHole(rng, theme, obstaclesEnabled);
  });
}
