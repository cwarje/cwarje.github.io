import type { GameType, Player } from '../networking/types';
import { createYahtzeeState, processYahtzeeAction, isYahtzeeOver, runYahtzeeBotTurn } from './yahtzee/logic';
import { createHeartsState, processHeartsAction, isHeartsOver, runHeartsBotTurn } from './hearts/logic';
import { createBattleshipState, processBattleshipAction, isBattleshipOver, runBattleshipBotTurn } from './battleship/logic';

export function createInitialGameState(gameType: GameType, players: Player[]): unknown {
  switch (gameType) {
    case 'yahtzee': return createYahtzeeState(players);
    case 'hearts': return createHeartsState(players);
    case 'battleship': return createBattleshipState(players);
  }
}

export function processGameAction(gameType: GameType, state: unknown, action: unknown, playerId: string): unknown {
  let newState: unknown;
  switch (gameType) {
    case 'yahtzee': newState = processYahtzeeAction(state, action, playerId); break;
    case 'hearts': newState = processHeartsAction(state, action, playerId); break;
    case 'battleship': newState = processBattleshipAction(state, action, playerId); break;
    default: return state;
  }
  // Run bot turns after processing human action
  return runBotTurns(gameType, newState);
}

export function checkGameOver(gameType: GameType, state: unknown): boolean {
  switch (gameType) {
    case 'yahtzee': return isYahtzeeOver(state);
    case 'hearts': return isHeartsOver(state);
    case 'battleship': return isBattleshipOver(state);
    default: return false;
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
      default: return current;
    }
    if (next === current) break; // No bot action taken
    current = next;
  }
  return current;
}
