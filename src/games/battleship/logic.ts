import type { Player } from '../../networking/types';
import type { BattleshipState, BattleshipAction, BattleshipPlayer, Ship, CellState } from './types';
import { SHIPS } from './types';

const BOARD_SIZE = 10;

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill('empty'));
}

function placeShipOnBoard(board: CellState[][], ship: Ship): CellState[][] {
  const newBoard = board.map(row => [...row]);
  for (const [r, c] of ship.cells) {
    newBoard[r][c] = 'ship';
  }
  return newBoard;
}

function randomPlacement(): { board: CellState[][]; ships: Ship[] } {
  let board = createEmptyBoard();
  const ships: Ship[] = [];

  for (const shipDef of SHIPS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      attempts++;
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);

      const cells: [number, number][] = [];
      let valid = true;

      for (let i = 0; i < shipDef.size; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;

        if (r >= BOARD_SIZE || c >= BOARD_SIZE || board[r][c] !== 'empty') {
          valid = false;
          break;
        }
        cells.push([r, c]);
      }

      if (valid) {
        const ship: Ship = { name: shipDef.name, size: shipDef.size, cells, sunk: false };
        board = placeShipOnBoard(board, ship);
        ships.push(ship);
        placed = true;
      }
    }
  }

  return { board, ships };
}

export function createBattleshipState(players: Player[]): BattleshipState {
  const gamePlayers = players.slice(0, 2);

  const bsPlayers: BattleshipPlayer[] = gamePlayers.map(p => {
    if (p.isBot) {
      const { board, ships } = randomPlacement();
      return {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        board,
        ships,
        shots: createEmptyBoard(),
        ready: true,
      };
    }
    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      board: createEmptyBoard(),
      ships: [],
      shots: createEmptyBoard(),
      ready: false,
    };
  });

  return {
    players: bsPlayers,
    phase: 'placement',
    currentPlayerIndex: 0,
    winner: null,
    lastShot: null,
  };
}

export function processBattleshipAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as BattleshipState;
  const a = action as BattleshipAction;

  if (s.phase === 'finished') return state;

  switch (a.type) {
    case 'place-ships': {
      if (s.phase !== 'placement') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return state;
      if (s.players[playerIndex].ready) return state;

      // Validate ships
      if (a.ships.length !== SHIPS.length) return state;

      let board = createEmptyBoard();
      for (const ship of a.ships) {
        for (const [r, c] of ship.cells) {
          if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return state;
          if (board[r][c] !== 'empty') return state;
          board[r][c] = 'ship';
        }
      }

      const newPlayers = [...s.players];
      newPlayers[playerIndex] = {
        ...newPlayers[playerIndex],
        board,
        ships: a.ships.map(sh => ({ ...sh, sunk: false })),
        ready: true,
      };

      // Check if all players are ready
      const allReady = newPlayers.every(p => p.ready);

      return {
        ...s,
        players: newPlayers,
        phase: allReady ? 'playing' : 'placement',
      };
    }

    case 'fire': {
      if (s.phase !== 'playing') return state;
      const attackerIndex = s.players.findIndex(p => p.id === playerId);
      if (attackerIndex === -1 || attackerIndex !== s.currentPlayerIndex) return state;

      const { row, col } = a;
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return state;

      const defenderIndex = (attackerIndex + 1) % 2;
      const defender = s.players[defenderIndex];
      const attacker = s.players[attackerIndex];

      // Can't shoot same cell twice
      if (attacker.shots[row][col] !== 'empty') return state;

      const isHit = defender.board[row][col] === 'ship';

      // Update defender's board
      const newDefBoard = defender.board.map(r => [...r]);
      newDefBoard[row][col] = isHit ? 'hit' : 'miss';

      // Update attacker's shots
      const newShots = attacker.shots.map(r => [...r]);
      newShots[row][col] = isHit ? 'hit' : 'miss';

      // Check for sunk ships
      const newShips = defender.ships.map(ship => {
        if (ship.sunk) return ship;
        const allHit = ship.cells.every(([r, c]) => {
          if (r === row && c === col) return isHit;
          return newDefBoard[r][c] === 'hit';
        });
        return { ...ship, sunk: allHit };
      });

      const sunkShip = newShips.find(sh => !defender.ships.find(os => os.name === sh.name)?.sunk && sh.sunk);

      const newPlayers = [...s.players];
      newPlayers[defenderIndex] = { ...defender, board: newDefBoard, ships: newShips };
      newPlayers[attackerIndex] = { ...attacker, shots: newShots };

      // Check win condition
      const allSunk = newShips.every(sh => sh.sunk);

      const lastShot = {
        row,
        col,
        result: (sunkShip ? 'sunk' : isHit ? 'hit' : 'miss') as 'hit' | 'miss' | 'sunk',
      };

      if (allSunk) {
        return {
          ...s,
          players: newPlayers,
          phase: 'finished' as const,
          winner: playerId,
          lastShot,
        };
      }

      return {
        ...s,
        players: newPlayers,
        currentPlayerIndex: defenderIndex,
        lastShot,
      };
    }
  }

  return state;
}

export function isBattleshipOver(state: unknown): boolean {
  return (state as BattleshipState).phase === 'finished';
}

// Bot AI - Hunt and Target
export function runBattleshipBotTurn(state: unknown): unknown {
  const s = state as BattleshipState;
  if (s.phase !== 'playing') return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer.isBot) return state;

  const shots = currentPlayer.shots;

  // Find hits that haven't resulted in sunk ships
  const opponentIndex = (s.currentPlayerIndex + 1) % 2;
  const opponent = s.players[opponentIndex];
  const unsunkHitCells: [number, number][] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (shots[r][c] === 'hit') {
        // Check if this hit is part of a sunk ship
        const partOfSunk = opponent.ships.some(
          sh => sh.sunk && sh.cells.some(([sr, sc]) => sr === r && sc === c)
        );
        if (!partOfSunk) unsunkHitCells.push([r, c]);
      }
    }
  }

  let target: [number, number] | null = null;

  if (unsunkHitCells.length > 0) {
    // Target mode: try adjacent cells of hits
    const directions: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    // If multiple hits in a line, try extending the line
    if (unsunkHitCells.length >= 2) {
      const [r1, c1] = unsunkHitCells[0];
      const [r2, c2] = unsunkHitCells[1];

      if (r1 === r2) {
        // Horizontal line
        const cols = unsunkHitCells.filter(([r]) => r === r1).map(([, c]) => c).sort((a, b) => a - b);
        const minC = cols[0] - 1;
        const maxC = cols[cols.length - 1] + 1;
        if (minC >= 0 && shots[r1][minC] === 'empty') target = [r1, minC];
        else if (maxC < BOARD_SIZE && shots[r1][maxC] === 'empty') target = [r1, maxC];
      } else if (c1 === c2) {
        // Vertical line
        const rows = unsunkHitCells.filter(([, c]) => c === c1).map(([r]) => r).sort((a, b) => a - b);
        const minR = rows[0] - 1;
        const maxR = rows[rows.length - 1] + 1;
        if (minR >= 0 && shots[minR][c1] === 'empty') target = [minR, c1];
        else if (maxR < BOARD_SIZE && shots[maxR][c1] === 'empty') target = [maxR, c1];
      }
    }

    if (!target) {
      // Try adjacent to any hit
      for (const [hr, hc] of unsunkHitCells) {
        for (const [dr, dc] of directions) {
          const nr = hr + dr;
          const nc = hc + dc;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && shots[nr][nc] === 'empty') {
            target = [nr, nc];
            break;
          }
        }
        if (target) break;
      }
    }
  }

  if (!target) {
    // Hunt mode: checkerboard pattern for efficiency
    const candidates: [number, number][] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (shots[r][c] === 'empty' && (r + c) % 2 === 0) {
          candidates.push([r, c]);
        }
      }
    }

    // If no checkerboard cells left, try all empty
    if (candidates.length === 0) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (shots[r][c] === 'empty') candidates.push([r, c]);
        }
      }
    }

    if (candidates.length === 0) return state;
    target = candidates[Math.floor(Math.random() * candidates.length)];
  }

  return processBattleshipAction(s, { type: 'fire', row: target[0], col: target[1] }, currentPlayer.id);
}
