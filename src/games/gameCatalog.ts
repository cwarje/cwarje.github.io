import type { GameType } from '../networking/types';

export interface HowToPlay {
  goal: string;
  rules: string[];
  howToPlay: string[];
}

export interface GameCatalogEntry {
  title: string;
  shortDescription: string;
  playersLabel: string;
  minPlayers: number;
  maxPlayers: number;
  info: HowToPlay;
}

export const GAME_CATALOG: Record<GameType, GameCatalogEntry> = {
  yahtzee: {
    title: 'Yahtzee',
    shortDescription: 'Roll dice, pick categories, and chase that perfect score. Classic dice game for 1-4 players.',
    playersLabel: '1-4 Players',
    minPlayers: 1,
    maxPlayers: 4,
    info: {
      goal: 'Score the most points by rolling five dice to make certain combinations over 13 rounds.',
      rules: [
        'Each turn you get up to 3 rolls of 5 dice.',
        'After each roll, you may hold any dice and re-roll the rest.',
        'At the end of your turn, you must assign your roll to one unused category on the scorecard.',
        'If your dice don\'t match a category, you score 0 for the chosen slot.',
        'The upper section (Ones through Sixes) scores the sum of matching dice. A bonus of 35 points is awarded if the upper section totals 63 or more.',
        'The lower section includes Three of a Kind, Four of a Kind, Full House (25 pts), Small Straight (30 pts), Large Straight (40 pts), Yahtzee (50 pts), and Chance (sum of all dice).',
      ],
      howToPlay: [
        'Click "Roll" to roll all five dice.',
        'Click individual dice to hold or unhold them before your next roll.',
        'After up to 3 rolls, click a category on the scorecard to lock in your score for that round.',
        'Play continues until all 13 categories are filled. Highest total wins!',
      ],
    },
  },
  hearts: {
    title: 'Hearts',
    shortDescription: 'Avoid tricks with hearts and the dreaded Queen of Spades. Or shoot the moon!',
    playersLabel: '4 Players',
    minPlayers: 4,
    maxPlayers: 4,
    info: {
      goal: 'Have the fewest points when any player reaches 100. Hearts are worth 1 point each, and the Queen of Spades is worth 13.',
      rules: [
        'Played with a standard 52-card deck among 4 players.',
        'Each round, players pass 3 cards to another player (left, right, across, then no pass — rotating each round).',
        'The player with the 2 of Clubs leads the first trick.',
        'You must follow the lead suit if you can. If you can\'t, you may play any card.',
        'Hearts cannot be led until a heart has been "broken" (played on a previous trick).',
        'The player who plays the highest card of the lead suit takes the trick and all its point cards.',
        'If one player takes ALL hearts and the Queen of Spades in a round, they "Shoot the Moon" — they score 0 and everyone else gets 26 points.',
      ],
      howToPlay: [
        'Select 3 cards to pass at the start of each round, then click Pass.',
        'When it\'s your turn, click a valid card from your hand to play it.',
        'Try to avoid winning tricks that contain hearts or the Queen of Spades.',
        'The round ends when all cards are played. A new round begins until someone hits 100 points.',
      ],
    },
  },
  battleship: {
    title: 'Battleship',
    shortDescription: 'Place your fleet and hunt down the enemy ships. Strategic naval combat for two.',
    playersLabel: '2 Players',
    minPlayers: 2,
    maxPlayers: 2,
    info: {
      goal: 'Sink all of your opponent\'s ships before they sink yours.',
      rules: [
        'Each player has a 10x10 grid and a fleet of 5 ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), and Destroyer (2).',
        'Ships are placed horizontally or vertically and cannot overlap.',
        'Players take turns firing at a coordinate on the opponent\'s grid.',
        'A hit is marked when a shot lands on a ship; a miss is marked otherwise.',
        'A ship is sunk when all of its cells have been hit.',
        'The first player to sink the entire enemy fleet wins.',
      ],
      howToPlay: [
        'During setup, drag or click to place each ship on your grid. Click a ship to rotate it.',
        'Once both players are ready, the game begins.',
        'On your turn, click a cell on the opponent\'s grid to fire a shot.',
        'The result (hit or miss) is shown immediately. Keep firing until all enemy ships are sunk!',
      ],
    },
  },
  'liars-dice': {
    title: "Liar's Dice",
    shortDescription: "Bluff, bid, and call liars. Losers face the revolver. Last player standing wins. Inspired by Liar's Bar.",
    playersLabel: '2-4 Players',
    minPlayers: 2,
    maxPlayers: 4,
    info: {
      goal: 'Be the last player standing. Survive by bluffing well and catching others in their lies.',
      rules: [
        'Each player starts with a set of dice hidden from other players.',
        'Players take turns making bids on how many dice of a certain face value are on the table (across ALL players).',
        'Each bid must be higher than the previous — either a higher quantity or a higher face value at the same quantity.',
        'Instead of bidding, a player can call "Liar!" on the previous bid.',
        'When someone calls "Liar!", all dice are revealed. If the bid was correct or exceeded, the caller loses. If the bid was too high, the bidder loses.',
        'The loser must pull the trigger on a revolver. If the chamber fires, they\'re eliminated.',
        'Play continues until only one player remains.',
      ],
      howToPlay: [
        'Look at your dice (hidden from others) and decide your bid.',
        'Use the bid controls to select a quantity and face value, then submit your bid.',
        'If you think the previous player is bluffing, click "Liar!" to challenge them.',
        'Losers pull the trigger — survive and keep playing, or get eliminated.',
        'Last player standing wins!',
      ],
    },
  },
  poker: {
    title: 'Poker',
    shortDescription: 'Texas Hold\'em with blinds, betting rounds, and side pots. Bluff your way to the chips!',
    playersLabel: '2-8 Players',
    minPlayers: 2,
    maxPlayers: 8,
    info: {
      goal: 'Win chips by having the best 5-card hand or by making all other players fold.',
      rules: [
        'Each player is dealt 2 hole cards (face down). Five community cards are dealt face up over three stages: the Flop (3 cards), the Turn (1 card), and the River (1 card).',
        'Make the best 5-card hand from any combination of your 2 hole cards and the 5 community cards.',
        'Hand rankings from highest to lowest: Royal Flush, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, One Pair, High Card.',
        'Two players post forced bets (blinds) each round to create action.',
        'There is a betting round after each deal stage. Players can Check, Bet, Call, Raise, or Fold.',
        'If all but one player folds, the remaining player wins the pot without showing cards.',
        'If multiple players remain after the River, cards are revealed and the best hand wins.',
      ],
      howToPlay: [
        'You\'re dealt 2 cards face down. Check your hand.',
        'Use the action buttons to Fold, Check/Call, or Raise during each betting round.',
        'Watch the community cards appear: Flop (3), Turn (1), River (1).',
        'After the final betting round, the best hand wins the pot. Play continues until one player has all the chips!',
      ],
    },
  },
  'up-and-down-the-river': {
    title: 'Up and Down the River',
    shortDescription: 'Bid your exact tricks as rounds climb to 7 cards, then descend. Nail your bids to rack up points.',
    playersLabel: '4 Players',
    minPlayers: 4,
    maxPlayers: 4,
    info: {
      goal: 'Score the most points by exactly matching your trick bid each round.',
      rules: [
        'Played with a standard 52-card deck among 4 players.',
        'Rounds follow this sequence: 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1 cards per player.',
        'Each round, one card is turned face up after dealing to set the trump suit.',
        'Starting left of the dealer, each player bids how many tricks they expect to win.',
        'You must follow the lead suit if possible. If you cannot, you may play any card, including trump.',
        'A trump card beats non-trump cards. If no trump is played, highest card of the lead suit wins.',
        'Exact bid scores 10 plus tricks won. Missing your bid scores 0.',
      ],
      howToPlay: [
        'Review your hand and the trump suit, then place your bid when it is your turn.',
        'When a trick starts, click a legal card to play.',
        'Track each player\'s bid and tricks won to gauge risk as the round progresses.',
        'After each round, scores are added and the dealer rotates.',
        'After the final 1-card round, highest total score wins.',
      ],
    },
  },
};
