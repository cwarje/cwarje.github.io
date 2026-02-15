import type { GameType, Player } from '../networking/types';
import { createYahtzeeState, processYahtzeeAction, isYahtzeeOver, runYahtzeeBotTurn } from './yahtzee/logic';
import { createHeartsState, processHeartsAction, isHeartsOver, runHeartsBotTurn } from './hearts/logic';
import { createBattleshipState, processBattleshipAction, isBattleshipOver, runBattleshipBotTurn } from './battleship/logic';
import { createLiarsDiceState, processLiarsDiceAction, isLiarsDiceOver, runLiarsDiceBotTurn } from './liars-dice/logic';
import { createPokerState, processPokerAction, isPokerOver, runPokerBotTurn } from './poker/logic';
import type { YahtzeeState } from './yahtzee/types';
import type { HeartsState } from './hearts/types';
import type { BattleshipState } from './battleship/types';
import type { LiarsDiceState } from './liars-dice/types';
import type { PokerState } from './poker/types';

export function createInitialGameState(gameType: GameType, players: Player[]): unknown {
  switch (gameType) {
    case 'yahtzee': return createYahtzeeState(players);
    case 'hearts': return createHeartsState(players);
    case 'battleship': return createBattleshipState(players);
    case 'liars-dice': return createLiarsDiceState(players);
    case 'poker': return createPokerState(players);
  }
}

export function processGameAction(gameType: GameType, state: unknown, action: unknown, playerId: string): unknown {
  let newState: unknown;
  switch (gameType) {
    case 'yahtzee': newState = processYahtzeeAction(state, action, playerId); break;
    case 'hearts': newState = processHeartsAction(state, action, playerId); break;
    case 'battleship': newState = processBattleshipAction(state, action, playerId); break;
    case 'liars-dice': newState = processLiarsDiceAction(state, action, playerId); break;
    case 'poker': newState = processPokerAction(state, action, playerId); break;
    default: return state;
  }
  // Bot turns are scheduled with delays by the host — don't auto-run them
  if (gameType === 'hearts' || gameType === 'liars-dice' || gameType === 'poker' || gameType === 'battleship' || gameType === 'yahtzee') return newState;
  // For other games, run bot turns synchronously as before
  return runBotTurns(gameType, newState);
}

export function checkGameOver(gameType: GameType, state: unknown): boolean {
  switch (gameType) {
    case 'yahtzee': return isYahtzeeOver(state);
    case 'hearts': return isHeartsOver(state);
    case 'battleship': return isBattleshipOver(state);
    case 'liars-dice': return isLiarsDiceOver(state);
    case 'poker': return isPokerOver(state);
    default: return false;
  }
}

// Run a single bot turn for the given game type (used for delayed scheduling)
export function runSingleBotTurn(gameType: GameType, state: unknown): unknown {
  if (checkGameOver(gameType, state)) return state;
  switch (gameType) {
    case 'yahtzee': return runYahtzeeBotTurn(state);
    case 'hearts': return runHeartsBotTurn(state);
    case 'battleship': return runBattleshipBotTurn(state);
    case 'liars-dice': return runLiarsDiceBotTurn(state);
    case 'poker': return runPokerBotTurn(state);
    default: return state;
  }
}

// Determine the winner(s) of a finished game. Returns array of winning player IDs.
export function getGameWinners(gameType: GameType, gameState: unknown): string[] {
  switch (gameType) {
    case 'yahtzee': {
      const state = gameState as YahtzeeState;
      const maxScore = Math.max(...state.players.map(p => p.totalScore));
      return state.players.filter(p => p.totalScore === maxScore).map(p => p.id);
    }
    case 'hearts': {
      const state = gameState as HeartsState;
      return state.winner ? [state.winner] : [];
    }
    case 'battleship': {
      const state = gameState as BattleshipState;
      return state.winner ? [state.winner] : [];
    }
    case 'liars-dice': {
      const state = gameState as LiarsDiceState;
      return state.players.filter(p => p.alive).map(p => p.id);
    }
    case 'poker': {
      const state = gameState as PokerState;
      const activePlayers = state.players.filter(p => !p.leftGame);
      if (activePlayers.length === 0) return [];
      const maxChips = Math.max(...activePlayers.map(p => p.chips));
      return activePlayers.filter(p => p.chips === maxChips).map(p => p.id);
    }
    default:
      return [];
  }
}

function runBotTurns(gameType: GameType, state: unknown): unknown {
  let current = state;
  let safety = 0;
  // Keep running bot turns until it's a human's turn or game is over
  while (safety < 100) {
    safety++;
    if (checkGameOver(gameType, current)) break;
    let next: unknown;
    switch (gameType) {
      case 'yahtzee': next = runYahtzeeBotTurn(current); break;
      case 'hearts': next = runHeartsBotTurn(current); break;
      case 'battleship': next = runBattleshipBotTurn(current); break;
      case 'liars-dice': next = runLiarsDiceBotTurn(current); break;
      case 'poker': next = runPokerBotTurn(current); break;
      default: return current;
    }
    if (next === current) break; // No bot action taken
    current = next;
  }
  return current;
}
