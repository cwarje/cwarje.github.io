import type { Player } from '../../networking/types';
import type { TwelveState } from './types';
import { createTwelveState, processTwelveAction, runTwelveBotTurn } from './logic';
import { getTrickWinnerPlayerId, isLegalPlay, listPlayableCards, rankStrength, suitsWithRoyalPair } from './rules';

export interface TwelveBotValidationMetrics {
  gamesPlayed: number;
  roundsPlayed: number;
  trumpSetEligibleStarts: number;
  trumpSetEvents: number;
  trumpSetRate: number;
  preventedOpponentDeclarationEvents: number;
  mostPointsBonusCount: number;
  lastTrickBonusCount: number;
  averageMostPointsBonusPerRound: number;
  averageLastTrickBonusPerRound: number;
  newBotWins: number;
  legacyBotWins: number;
  winRateNewBots: number;
  stalledGames: number;
}

function createMixedBotPlayers(): Player[] {
  return [
    { id: 'new-1', name: 'New Bot 1', color: 'red', isBot: true, isHost: true, connected: true },
    { id: 'legacy-1', name: 'Legacy Bot 1', color: 'orange', isBot: true, isHost: false, connected: true },
    { id: 'new-2', name: 'New Bot 2', color: 'green', isBot: true, isHost: false, connected: true },
    { id: 'legacy-2', name: 'Legacy Bot 2', color: 'dark-purple', isBot: true, isHost: false, connected: true },
  ];
}

function isNewBotId(playerId: string): boolean {
  return playerId.startsWith('new-');
}

function runLegacyTwelveBotTurn(state: TwelveState): TwelveState {
  if (state.gameOver || state.phase === 'round-end' || state.trickWinner) return state;
  if (state.phase === 'flipping') {
    return processTwelveAction(state, { type: 'flip-exposed' }, '') as TwelveState;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer?.isBot) return state;

  if (
    state.currentTrick.length === 0
    && state.lastTrickWinnerId === currentPlayer.id
    && state.trumpSuit === null
    && currentPlayer.totalScore <= 9
  ) {
    const pairs = suitsWithRoyalPair(currentPlayer);
    if (pairs.length > 0 && Math.random() < 0.55) {
      return processTwelveAction(state, { type: 'set-trump', suit: pairs[0] }, currentPlayer.id) as TwelveState;
    }
  }

  if (
    state.currentTrick.length === 0
    && state.lastTrickWinnerId === currentPlayer.id
    && state.trumpSuit !== null
    && currentPlayer.totalScore <= 10
  ) {
    const suits = suitsWithRoyalPair(currentPlayer)
      .filter(suit => !currentPlayer.tjogSuitsCalled.includes(suit))
      .filter(suit => !(state.trumpSetterId === currentPlayer.id && suit === state.trumpSuit));
    if (suits.length > 0 && Math.random() < 0.45) {
      return processTwelveAction(state, { type: 'call-tjog', suit: suits[0] }, currentPlayer.id) as TwelveState;
    }
  }

  const options = listPlayableCards(currentPlayer).filter((entry) => {
    if (entry.source === 'hand') return isLegalPlay(state, state.currentPlayerIndex, entry.card, 'hand');
    return isLegalPlay(state, state.currentPlayerIndex, entry.card, 'pile', entry.pileIndex);
  });
  if (options.length === 0) return state;

  const chosen = [...options].sort((a, b) => rankStrength(a.card.rank) - rankStrength(b.card.rank))[0];
  if (chosen.source === 'hand') {
    return processTwelveAction(state, { type: 'play-hand-card', card: chosen.card }, currentPlayer.id) as TwelveState;
  }
  return processTwelveAction(state, { type: 'play-pile-card', pileIndex: chosen.pileIndex ?? 0 }, currentPlayer.id) as TwelveState;
}

function canCurrentPlayerSetTrump(state: TwelveState): boolean {
  if (state.currentTrick.length !== 0 || state.trumpSuit !== null) return false;
  const current = state.players[state.currentPlayerIndex];
  if (!current) return false;
  if (state.lastTrickWinnerId !== current.id) return false;
  if (current.totalScore >= 10) return false;
  return suitsWithRoyalPair(current).length > 0;
}

function canCurrentPlayerOvertakeThreat(state: TwelveState): { isThreatLive: boolean; canOvertake: boolean } {
  if (state.trumpSuit !== null || state.currentTrick.length === 0) return { isThreatLive: false, canOvertake: false };
  const current = state.players[state.currentPlayerIndex];
  if (!current) return { isThreatLive: false, canOvertake: false };
  const currentLeaderId = getTrickWinnerPlayerId(state.currentTrick, state.trumpSuit);
  if (!currentLeaderId || currentLeaderId === current.id) return { isThreatLive: false, canOvertake: false };
  const leader = state.players.find(player => player.id === currentLeaderId);
  if (!leader || leader.totalScore >= 10 || suitsWithRoyalPair(leader).length === 0) {
    return { isThreatLive: false, canOvertake: false };
  }

  const legal = listPlayableCards(current).filter((entry) => {
    if (entry.source === 'hand') return isLegalPlay(state, state.currentPlayerIndex, entry.card, 'hand');
    return isLegalPlay(state, state.currentPlayerIndex, entry.card, 'pile', entry.pileIndex);
  });
  const canOvertake = legal.some((entry) => {
    const nextTrick = [...state.currentTrick, { playerId: current.id, card: entry.card }];
    return getTrickWinnerPlayerId(nextTrick, state.trumpSuit) !== currentLeaderId;
  });

  return { isThreatLive: true, canOvertake };
}

function resolveRoundBonuses(state: TwelveState): { mostPointsAwarded: boolean; lastTrickAwarded: boolean } {
  const points = state.roundCardPoints;
  const values = Object.values(points);
  const max = values.length > 0 ? Math.max(...values) : 0;
  const leaders = Object.entries(points).filter(([, value]) => value === max);
  return {
    mostPointsAwarded: leaders.length === 1,
    lastTrickAwarded: state.lastTrickWinnerId !== null,
  };
}

function runAssignedBotTurn(state: TwelveState): TwelveState {
  const current = state.players[state.currentPlayerIndex];
  if (!current) return state;
  if (isNewBotId(current.id)) return runTwelveBotTurn(state) as TwelveState;
  return runLegacyTwelveBotTurn(state);
}

export function runTwelveBotValidation(gameCount = 40): TwelveBotValidationMetrics {
  const metrics: TwelveBotValidationMetrics = {
    gamesPlayed: 0,
    roundsPlayed: 0,
    trumpSetEligibleStarts: 0,
    trumpSetEvents: 0,
    trumpSetRate: 0,
    preventedOpponentDeclarationEvents: 0,
    mostPointsBonusCount: 0,
    lastTrickBonusCount: 0,
    averageMostPointsBonusPerRound: 0,
    averageLastTrickBonusPerRound: 0,
    newBotWins: 0,
    legacyBotWins: 0,
    winRateNewBots: 0,
    stalledGames: 0,
  };

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex++) {
    let state = createTwelveState(createMixedBotPlayers(), { pileCount: 4 }) as TwelveState;
    let safety = 0;

    while (!state.gameOver && safety < 30000) {
      safety++;

      if (state.phase === 'playing' && state.trickWinner) {
        state = processTwelveAction(state, { type: 'resolve-trick' }, state.players[0]?.id ?? '') as TwelveState;
        continue;
      }

      if (state.phase === 'round-end') {
        const roundBonus = resolveRoundBonuses(state);
        metrics.roundsPlayed++;
        if (roundBonus.mostPointsAwarded) metrics.mostPointsBonusCount++;
        if (roundBonus.lastTrickAwarded) metrics.lastTrickBonusCount++;
        if (!state.gameOver) {
          state = processTwelveAction(state, { type: 'start-next-round' }, state.players[0]?.id ?? '') as TwelveState;
        }
        continue;
      }

      const leaderBefore = getTrickWinnerPlayerId(state.currentTrick, state.trumpSuit);
      const threatInfo = canCurrentPlayerOvertakeThreat(state);
      const canSet = canCurrentPlayerSetTrump(state);
      if (canSet) metrics.trumpSetEligibleStarts++;

      const next = runAssignedBotTurn(state);
      if (next === state) break;

      if (canSet && next.trumpSuit !== null && next.trumpSetterId === state.players[state.currentPlayerIndex]?.id) {
        metrics.trumpSetEvents++;
      }

      if (threatInfo.isThreatLive && threatInfo.canOvertake) {
        const leaderAfter = getTrickWinnerPlayerId(next.currentTrick, next.trumpSuit);
        if (leaderBefore && leaderAfter && leaderAfter !== leaderBefore) {
          metrics.preventedOpponentDeclarationEvents++;
        }
      }

      state = next;
    }

    if (safety >= 30000) {
      metrics.stalledGames++;
      continue;
    }

    metrics.gamesPlayed++;
    if (state.winners.some(winner => isNewBotId(winner))) metrics.newBotWins++;
    if (state.winners.some(winner => !isNewBotId(winner))) metrics.legacyBotWins++;
  }

  if (metrics.trumpSetEligibleStarts > 0) {
    metrics.trumpSetRate = metrics.trumpSetEvents / metrics.trumpSetEligibleStarts;
  }
  if (metrics.roundsPlayed > 0) {
    metrics.averageMostPointsBonusPerRound = metrics.mostPointsBonusCount / metrics.roundsPlayed;
    metrics.averageLastTrickBonusPerRound = metrics.lastTrickBonusCount / metrics.roundsPlayed;
  }
  if (metrics.gamesPlayed > 0) {
    metrics.winRateNewBots = metrics.newBotWins / metrics.gamesPlayed;
  }

  return metrics;
}
