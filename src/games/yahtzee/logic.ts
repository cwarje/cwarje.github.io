import type { Player } from '../../networking/types';
import type { YahtzeeState, YahtzeeAction, YahtzeePlayer, Scorecard, ScoreCategory } from './types';

const ALL_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance',
];

function emptyScorecard(): Scorecard {
  return {
    ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null,
    threeOfAKind: null, fourOfAKind: null, fullHouse: null,
    smallStraight: null, largeStraight: null, yahtzee: null, chance: null,
  };
}

function rollDice(dice: number[], held: boolean[]): number[] {
  return dice.map((d, i) => held[i] ? d : Math.floor(Math.random() * 6) + 1);
}

function countDice(dice: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  dice.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
  return counts;
}

export function calculateScore(dice: number[], category: ScoreCategory): number {
  const counts = countDice(dice);
  const values = Object.values(counts);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch (category) {
    case 'ones': return (counts[1] || 0) * 1;
    case 'twos': return (counts[2] || 0) * 2;
    case 'threes': return (counts[3] || 0) * 3;
    case 'fours': return (counts[4] || 0) * 4;
    case 'fives': return (counts[5] || 0) * 5;
    case 'sixes': return (counts[6] || 0) * 6;
    case 'threeOfAKind': return values.some(v => v >= 3) ? sum : 0;
    case 'fourOfAKind': return values.some(v => v >= 4) ? sum : 0;
    case 'fullHouse': return (values.includes(3) && values.includes(2)) ? 25 : 0;
    case 'smallStraight': {
      const unique = [...new Set(dice)].sort();
      const str = unique.join('');
      return (str.includes('1234') || str.includes('2345') || str.includes('3456')) ? 30 : 0;
    }
    case 'largeStraight': {
      const unique = [...new Set(dice)].sort();
      const str = unique.join('');
      return (str === '12345' || str === '23456') ? 40 : 0;
    }
    case 'yahtzee': return values.includes(5) ? 50 : 0;
    case 'chance': return sum;
  }
}

function calcTotal(sc: Scorecard, bonusCount: number): number {
  let upper = 0;
  (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as ScoreCategory[]).forEach(cat => {
    if (sc[cat] !== null) upper += sc[cat]!;
  });
  const upperBonus = upper >= 63 ? 35 : 0;

  let lower = 0;
  (['threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'] as ScoreCategory[]).forEach(cat => {
    if (sc[cat] !== null) lower += sc[cat]!;
  });

  return upper + upperBonus + lower + bonusCount * 100;
}

export function createYahtzeeState(players: Player[]): YahtzeeState {
  return {
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      scorecard: emptyScorecard(),
      totalScore: 0,
    })),
    currentPlayerIndex: 0,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    round: 1,
    gameOver: false,
    yahtzeeBonus: {},
  };
}

export function processYahtzeeAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as YahtzeeState;
  const a = action as YahtzeeAction;

  if (s.gameOver) return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return state;

  switch (a.type) {
    case 'roll': {
      if (s.rollsLeft <= 0) return state;
      const newDice = rollDice(s.dice, s.rollsLeft === 3 ? [false, false, false, false, false] : s.held);
      return {
        ...s,
        dice: newDice,
        rollsLeft: s.rollsLeft - 1,
        held: s.rollsLeft === 3 ? [false, false, false, false, false] : s.held,
      };
    }
    case 'toggle-hold': {
      if (s.rollsLeft === 3 || s.rollsLeft === 0) return state; // Can't hold before first roll
      const newHeld = [...s.held];
      newHeld[a.index] = !newHeld[a.index];
      return { ...s, held: newHeld };
    }
    case 'score': {
      if (s.rollsLeft === 3) return state; // Must roll first
      if (currentPlayer.scorecard[a.category] !== null) return state;

      const score = calculateScore(s.dice, a.category);
      const newScorecard = { ...currentPlayer.scorecard, [a.category]: score };

      // Yahtzee bonus
      const newBonuses = { ...s.yahtzeeBonus };
      const isYahtzee = new Set(s.dice).size === 1;
      if (isYahtzee && currentPlayer.scorecard.yahtzee !== null && currentPlayer.scorecard.yahtzee > 0) {
        newBonuses[playerId] = (newBonuses[playerId] || 0) + 1;
      }

      const newPlayer: YahtzeePlayer = {
        ...currentPlayer,
        scorecard: newScorecard,
        totalScore: calcTotal(newScorecard, newBonuses[playerId] || 0),
      };

      const newPlayers = [...s.players];
      newPlayers[s.currentPlayerIndex] = newPlayer;

      // Advance to next player
      let nextIndex = (s.currentPlayerIndex + 1) % s.players.length;
      let nextRound = s.round;
      if (nextIndex === 0) nextRound++;

      const gameOver = nextRound > 13;

      return {
        ...s,
        players: newPlayers,
        currentPlayerIndex: gameOver ? s.currentPlayerIndex : nextIndex,
        dice: [1, 1, 1, 1, 1],
        held: [false, false, false, false, false],
        rollsLeft: 3,
        round: gameOver ? 13 : nextRound,
        gameOver,
        yahtzeeBonus: newBonuses,
      };
    }
  }
  return state;
}

export function isYahtzeeOver(state: unknown): boolean {
  return (state as YahtzeeState).gameOver;
}

// Bot AI
export function runYahtzeeBotTurn(state: unknown): unknown {
  const s = state as YahtzeeState;
  if (s.gameOver) return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer.isBot) return state;

  // If needs to roll
  if (s.rollsLeft === 3) {
    const newDice = rollDice(s.dice, [false, false, false, false, false]);
    return runYahtzeeBotTurn({
      ...s,
      dice: newDice,
      rollsLeft: 2,
      held: [false, false, false, false, false],
    });
  }

  // Decide whether to keep rolling or score
  const availableCategories = ALL_CATEGORIES.filter(c => currentPlayer.scorecard[c] === null);
  const bestCategory = pickBestCategory(s.dice, availableCategories);

  if (s.rollsLeft > 0 && shouldReroll(s.dice, bestCategory)) {
    // Decide which to hold
    const newHeld = decideBotHolds(s.dice, bestCategory);
    const newDice = rollDice(s.dice, newHeld);
    const afterRoll = {
      ...s,
      dice: newDice,
      held: newHeld,
      rollsLeft: s.rollsLeft - 1,
    };
    // Recursively continue bot turn
    return runYahtzeeBotTurn(afterRoll);
  }

  // Score
  return processYahtzeeAction(s, { type: 'score', category: bestCategory }, currentPlayer.id);
}

function pickBestCategory(dice: number[], available: ScoreCategory[]): ScoreCategory {
  let best: ScoreCategory = available[0];
  let bestScore = -1;

  for (const cat of available) {
    const score = calculateScore(dice, cat);
    // Weight categories by their value relative to expected
    let weight = score;
    if (cat === 'yahtzee' && score === 50) weight = 100;
    if (cat === 'largeStraight' && score === 40) weight = 80;
    if (cat === 'fullHouse' && score === 25) weight = 50;
    if (weight > bestScore) {
      bestScore = weight;
      best = cat;
    }
  }
  return best;
}

function shouldReroll(dice: number[], bestCategory: ScoreCategory): boolean {
  const score = calculateScore(dice, bestCategory);
  if (bestCategory === 'yahtzee' && score === 50) return false;
  if (bestCategory === 'largeStraight' && score === 40) return false;
  if (bestCategory === 'fullHouse' && score === 25) return false;
  if (score === 0) return true;
  const sum = dice.reduce((a, b) => a + b, 0);
  return sum < 15;
}

function decideBotHolds(dice: number[], _targetCategory: ScoreCategory): boolean[] {
  // Simple strategy: hold the most common value
  const counts = countDice(dice);
  let maxVal = 1;
  let maxCount = 0;
  for (const [val, count] of Object.entries(counts)) {
    if (count > maxCount || (count === maxCount && Number(val) > maxVal)) {
      maxCount = count;
      maxVal = Number(val);
    }
  }
  return dice.map(d => d === maxVal);
}
