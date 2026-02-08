import type { GameType, Player } from '../networking/types';
import { createYahtzeeState, processYahtzeeAction, isYahtzeeOver, runYahtzeeBotTurn } from './yahtzee/logic';
import { createHeartsState, processHeartsAction, isHeartsOver, runHeartsBotTurn } from './hearts/logic';
import { createBattleshipState, processBattleshipAction, isBattleshipOver, runBattleshipBotTurn } from './battleship/logic';
import { createLiarsDiceState, processLiarsDiceAction, isLiarsDiceOver, runLiarsDiceBotTurn } from './liars-dice/logic';

export function createInitialGameState(gameType: GameType, players: Player[]): unknown {
  switch (gameType) {
    case 'yahtzee': return createYahtzeeState(players);
    case 'hearts': return createHeartsState(players);
    case 'battleship': return createBattleshipState(players);
    case 'liars-dice': return createLiarsDiceState(players);
  }
}

export function processGameAction(gameType: GameType, state: unknown, action: unknown, playerId: string): unknown {
  let newState: unknown;
  switch (gameType) {
    case 'yahtzee': newState = processYahtzeeAction(state, action, playerId); break;
    case 'hearts': newState = processHeartsAction(state, action, playerId); break;
    case 'battleship': newState = processBattleshipAction(state, action, playerId); break;
    case 'liars-dice': newState = processLiarsDiceAction(state, action, playerId); break;
    default: return state;
  }
  // For Hearts and Liar's Dice, bot turns are scheduled with delays by the host — don't auto-run them
  if (gameType === 'hearts' || gameType === 'liars-dice') return newState;
  // For other games, run bot turns synchronously as before
  return runBotTurns(gameType, newState);
}

export function checkGameOver(gameType: GameType, state: unknown): boolean {
  switch (gameType) {
    case 'yahtzee': return isYahtzeeOver(state);
    case 'hearts': return isHeartsOver(state);
    case 'battleship': return isBattleshipOver(state);
    case 'liars-dice': return isLiarsDiceOver(state);
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
    default: return state;
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
      default: return current;
    }
    if (next === current) break; // No bot action taken
    current = next;
  }
  return current;
}
