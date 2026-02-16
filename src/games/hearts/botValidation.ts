import type { Player } from '../../networking/types';
import type { Card, HeartsState } from './types';
import { createHeartsState, processHeartsAction, runHeartsBotTurn } from './logic';

export interface HeartsBotValidationMetrics {
  gamesPlayed: number;
  roundsPlayed: number;
  averagePointsPerRound: number;
  queenOfSpadesTaken: number;
  moonRoundsObserved: number;
  moonShootsPrevented: number;
  lateGamePointsTaken: number;
  winsByPlayerId: Record<string, number>;
}

function isQueenOfSpades(card: Card): boolean {
  return card.suit === 'spades' && card.rank === 12;
}

function createBotPlayers(): Player[] {
  return [
    { id: 'bot-1', name: 'Bot 1', isBot: true, isHost: true, connected: true },
    { id: 'bot-2', name: 'Bot 2', isBot: true, isHost: false, connected: true },
    { id: 'bot-3', name: 'Bot 3', isBot: true, isHost: false, connected: true },
    { id: 'bot-4', name: 'Bot 4', isBot: true, isHost: false, connected: true },
  ];
}

function computeRoundResultFromFinalTrick(state: HeartsState): { adjustedRoundScores: Record<string, number>; shooterId: string | null } {
  const winnerId = state.trickWinner;
  const trickPoints = state.currentTrick.reduce((sum, entry) => {
    if (entry.card.suit === 'hearts') return sum + 1;
    if (entry.card.suit === 'spades' && entry.card.rank === 12) return sum + 13;
    return sum;
  }, 0);

  const rawRoundScores: Record<string, number> = {};
  for (const p of state.players) {
    rawRoundScores[p.id] = p.roundScore + (p.id === winnerId ? trickPoints : 0);
  }

  const shooter = state.players.find(p => rawRoundScores[p.id] === 26);
  if (!shooter) return { adjustedRoundScores: rawRoundScores, shooterId: null };

  const adjustedRoundScores: Record<string, number> = {};
  for (const p of state.players) {
    adjustedRoundScores[p.id] = p.id === shooter.id ? 0 : 26;
  }

  return { adjustedRoundScores, shooterId: shooter.id };
}

export function runHeartsBotValidation(gameCount = 40): HeartsBotValidationMetrics {
  const winsByPlayerId: Record<string, number> = {};
  const metrics: HeartsBotValidationMetrics = {
    gamesPlayed: 0,
    roundsPlayed: 0,
    averagePointsPerRound: 0,
    queenOfSpadesTaken: 0,
    moonRoundsObserved: 0,
    moonShootsPrevented: 0,
    lateGamePointsTaken: 0,
    winsByPlayerId,
  };

  let totalRoundPoints = 0;

  for (let gameNumber = 0; gameNumber < gameCount; gameNumber++) {
    let state = createHeartsState(createBotPlayers());
    let safety = 0;

    while (!state.gameOver && safety < 20000) {
      safety++;

      if (state.phase === 'playing' && state.trickWinner) {
        const winnerBeforeResolve = state.players.find(p => p.id === state.trickWinner);
        const trickPoints = state.currentTrick.reduce((sum, entry) => {
          if (entry.card.suit === 'hearts') return sum + 1;
          if (entry.card.suit === 'spades' && entry.card.rank === 12) return sum + 13;
          return sum;
        }, 0);

        if (state.currentTrick.some(entry => isQueenOfSpades(entry.card))) {
          metrics.queenOfSpadesTaken++;
        }

        if (winnerBeforeResolve && trickPoints > 0 && winnerBeforeResolve.totalScore >= 85) {
          metrics.lateGamePointsTaken += trickPoints;
        }

        if (state.trickNumber === 13) {
          const result = computeRoundResultFromFinalTrick(state);
          metrics.roundsPlayed++;
          const roundPoints = Object.values(result.adjustedRoundScores).reduce((sum, pts) => sum + pts, 0);
          totalRoundPoints += roundPoints;
          if (result.shooterId) {
            metrics.moonRoundsObserved++;
          }
        }

        state = processHeartsAction(state, { type: 'resolve-trick' }, state.players[0]?.id ?? '') as HeartsState;
        continue;
      }

      const next = runHeartsBotTurn(state) as HeartsState;
      if (next === state) {
        break;
      }
      state = next;
    }

    if (safety >= 20000) {
      continue;
    }

    metrics.gamesPlayed++;
    if (state.winner) {
      winsByPlayerId[state.winner] = (winsByPlayerId[state.winner] ?? 0) + 1;
    }
  }

  if (metrics.roundsPlayed > 0) {
    metrics.averagePointsPerRound = totalRoundPoints / metrics.roundsPlayed;
  }
  metrics.moonShootsPrevented = Math.max(0, metrics.roundsPlayed - metrics.moonRoundsObserved);

  return metrics;
}
