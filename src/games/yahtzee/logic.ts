import type { Player } from '../../networking/types';
import type { YahtzeeState, YahtzeeAction, YahtzeePlayer, Scorecard, ScoreCategory } from './types';

const ALL_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance',
];

const UPPER_CATS: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LOWER_CATS: ScoreCategory[] = ['threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];

const DICE_TO_UPPER: Record<number, ScoreCategory> = {
  1: 'ones', 2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes',
};

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

/** Check if Yahtzee joker rules apply (rolled a Yahtzee with Yahtzee already scored as 50) */
export function isJokerActive(dice: number[], scorecard: Scorecard): boolean {
  const isYahtzee = new Set(dice).size === 1;
  return isYahtzee && scorecard.yahtzee !== null && scorecard.yahtzee > 0;
}

/** Calculate score for a category, applying joker rules when active */
export function calculateScoreWithJoker(dice: number[], category: ScoreCategory, scorecard: Scorecard): number {
  if (!isJokerActive(dice, scorecard)) {
    return calculateScore(dice, category);
  }

  // Joker active: upper section scores normally
  if ((UPPER_CATS as string[]).includes(category)) {
    return calculateScore(dice, category);
  }

  // Lower section with joker: guaranteed values regardless of dice pattern
  const sum = dice.reduce((a, b) => a + b, 0);
  switch (category) {
    case 'threeOfAKind': return sum;
    case 'fourOfAKind': return sum;
    case 'fullHouse': return 25;
    case 'smallStraight': return 30;
    case 'largeStraight': return 40;
    case 'yahtzee': return 50;
    case 'chance': return sum;
    default: return calculateScore(dice, category);
  }
}

/** Get categories available for scoring, enforcing joker rules when active */
export function getAvailableCategories(dice: number[], scorecard: Scorecard): ScoreCategory[] {
  if (!isJokerActive(dice, scorecard)) {
    // Normal: all unfilled categories
    return ALL_CATEGORIES.filter(c => scorecard[c] === null);
  }

  const diceValue = dice[0]; // All dice are the same value
  const correspondingUpper = DICE_TO_UPPER[diceValue];

  // 1. Must use corresponding upper section if it's open
  if (scorecard[correspondingUpper] === null) {
    return [correspondingUpper];
  }

  // 2. Any open lower section category (with joker values)
  const openLower = LOWER_CATS.filter(c => scorecard[c] === null);
  if (openLower.length > 0) {
    return openLower;
  }

  // 3. Fallback: any open upper section category
  return UPPER_CATS.filter(c => scorecard[c] === null);
}

/** Get upper section subtotal (ones through sixes) */
export function getUpperTotal(scorecard: Scorecard): number {
  let total = 0;
  UPPER_CATS.forEach(cat => {
    if (scorecard[cat] !== null) total += scorecard[cat]!;
  });
  return total;
}

/** Get lower section subtotal */
export function getLowerTotal(scorecard: Scorecard): number {
  let total = 0;
  LOWER_CATS.forEach(cat => {
    if (scorecard[cat] !== null) total += scorecard[cat]!;
  });
  return total;
}

/** Check if upper bonus is earned (upper total >= 63) */
export function hasUpperBonus(scorecard: Scorecard): boolean {
  return getUpperTotal(scorecard) >= 63;
}

/** Check if all upper categories have been filled */
export function isUpperComplete(scorecard: Scorecard): boolean {
  return UPPER_CATS.every(cat => scorecard[cat] !== null);
}

function calcTotal(sc: Scorecard, bonusCount: number): number {
  const upper = getUpperTotal(sc);
  const upperBonus = upper >= 63 ? 35 : 0;
  const lower = getLowerTotal(sc);
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

      // Enforce joker rules: only allowed categories can be scored
      const available = getAvailableCategories(s.dice, currentPlayer.scorecard);
      if (!available.includes(a.category)) return state;

      const score = calculateScoreWithJoker(s.dice, a.category, currentPlayer.scorecard);
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

/** Returns true when the bot's next step will be scoring (not rolling).
 *  Used by the host scheduler to show the dice longer before the score clears them. */
export function willYahtzeeBotScore(state: unknown): boolean {
  const s = state as YahtzeeState;
  if (s.gameOver) return false;
  const player = s.players[s.currentPlayerIndex];
  if (!player || !player.isBot) return false;
  if (s.rollsLeft === 3) return false; // will roll first
  if (s.rollsLeft === 0) return true;  // must score
  const available = getAvailableCategories(s.dice, player.scorecard);
  const best = pickBestCategory(s.dice, available, player.scorecard);
  return !shouldReroll(s.dice, best, player.scorecard);
}

// Bot AI — performs exactly ONE step per call (one roll or one score)
// so the host scheduler can insert delays between each visible action.
export function runYahtzeeBotTurn(state: unknown): unknown {
  const s = state as YahtzeeState;
  if (s.gameOver) return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer.isBot) return state;

  // Step 1: First roll (rollsLeft === 3) — roll all dice
  if (s.rollsLeft === 3) {
    const newDice = rollDice(s.dice, [false, false, false, false, false]);
    return {
      ...s,
      dice: newDice,
      rollsLeft: 2,
      held: [false, false, false, false, false],
    };
  }

  // Decide whether to keep rolling or score (respects joker rules)
  const availableCategories = getAvailableCategories(s.dice, currentPlayer.scorecard);
  const bestCategory = pickBestCategory(s.dice, availableCategories, currentPlayer.scorecard);

  // Step 2: Reroll (rollsLeft > 0 and should reroll) — hold + roll once
  if (s.rollsLeft > 0 && shouldReroll(s.dice, bestCategory, currentPlayer.scorecard)) {
    const newHeld = decideBotHolds(s.dice, bestCategory);
    const newDice = rollDice(s.dice, newHeld);
    return {
      ...s,
      dice: newDice,
      held: newHeld,
      rollsLeft: s.rollsLeft - 1,
    };
  }

  // Step 3: Score the best category
  return processYahtzeeAction(s, { type: 'score', category: bestCategory }, currentPlayer.id);
}

function pickBestCategory(dice: number[], available: ScoreCategory[], scorecard: Scorecard): ScoreCategory {
  let best: ScoreCategory = available[0];
  let bestScore = -1;

  for (const cat of available) {
    const score = calculateScoreWithJoker(dice, cat, scorecard);
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

function shouldReroll(dice: number[], bestCategory: ScoreCategory, scorecard: Scorecard): boolean {
  // Don't reroll if joker is active (already have a Yahtzee!)
  if (isJokerActive(dice, scorecard)) return false;

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
