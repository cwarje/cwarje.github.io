import type { LucideIcon } from 'lucide-react';
import { Dice5, Heart, Ship, Crosshair, Club, ArrowUpDown, Crown } from 'lucide-react';
import type { GameType, Player, GameStartOptions } from '../networking/types';

import { createYahtzeeState, processYahtzeeAction, isYahtzeeOver, runYahtzeeBotTurn, getYahtzeeWinners } from './yahtzee/logic';
import { createFarkleState, processFarkleAction, isFarkleOver, runFarkleBotTurn, getFarkleWinners } from './farkle/logic';
import { createHeartsState, processHeartsAction, isHeartsOver, runHeartsBotTurn, getHeartsWinners } from './hearts/logic';
import { createBattleshipState, processBattleshipAction, isBattleshipOver, runBattleshipBotTurn, getBattleshipWinners } from './battleship/logic';
import { createLiarsDiceState, processLiarsDiceAction, isLiarsDiceOver, runLiarsDiceBotTurn, getLiarsDiceWinners } from './liars-dice/logic';
import { createPokerState, processPokerAction, isPokerOver, runPokerBotTurn, getPokerWinners } from './poker/logic';
import { createUpRiverState, processUpRiverAction, isUpRiverOver, runUpRiverBotTurn, getUpRiverWinners } from './up-and-down-the-river/logic';
import { createTwelveState, processTwelveAction, isTwelveOver, runTwelveBotTurn, getTwelveWinners } from './twelve/logic';

import YahtzeeBoard from './yahtzee/YahtzeeBoard';
import FarkleBoard from './farkle/FarkleBoard';
import HeartsBoard from './hearts/HeartsBoard';
import BattleshipBoard from './battleship/BattleshipBoard';
import LiarsDiceBoard from './liars-dice/LiarsDiceBoard';
import PokerBoard from './poker/PokerBoard';
import UpAndDownTheRiverBoard from './up-and-down-the-river/UpAndDownTheRiverBoard';
import TwelveBoard from './twelve/TwelveBoard';

import HeartsOptions from './hearts/HeartsOptions';
import UpRiverOptions from './up-and-down-the-river/UpRiverOptions';
import TwelveOptions from './twelve/TwelveOptions';

import HeartsTitleExtra from './hearts/HeartsTitleExtra';
import PokerTitleExtra from './poker/PokerTitleExtra';
import UpRiverToolbarExtra from './up-and-down-the-river/UpRiverToolbarExtra';
import TwelveToolbarExtra from './twelve/TwelveToolbarExtra';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface HowToPlay {
  goal: string;
  rules: string[];
  howToPlay: string[];
}

export interface GameTheme {
  gradient: string;
  cardBorder: string;
  hoverBorder: string;
  playersTag: string;
  iconColor: string;
  buttonColors: string;
  panelBg: string;
  labelColor: string;
}

export interface BoardProps {
  state: unknown;
  myId: string;
  onAction: (payload: unknown) => void;
  isHost?: boolean;
  isHandZoomed?: boolean;
  onLeave?: () => void;
}

export interface GameOptionsPanelProps {
  onChange: (options: Partial<GameStartOptions>) => void;
  labelClass: string;
  playerCount: number;
  botCount: number;
}

export interface GameHudProps {
  state: unknown;
  isHandZoomed?: boolean;
}

// ---------------------------------------------------------------------------
// GameDefinition — the single source of truth for every game
// ---------------------------------------------------------------------------

export interface GameDefinition {
  title: string;
  shortDescription: string;
  playersLabel: string;
  minPlayers: number;
  maxPlayers: number;
  info: HowToPlay;
  icon: LucideIcon;
  theme: GameTheme;

  createState: (players: Player[], options?: GameStartOptions) => unknown;
  processAction: (state: unknown, action: unknown, playerId: string) => unknown;
  isOver: (state: unknown) => boolean;
  runBotTurn: (state: unknown) => unknown;
  getWinners: (state: unknown) => string[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Board: React.ComponentType<any>;
  OptionsPanel?: React.ComponentType<GameOptionsPanelProps>;
  TitleExtra?: React.ComponentType<GameHudProps>;
  ToolbarExtra?: React.ComponentType<GameHudProps>;

  fullBoard?: boolean;
  hasHandZoom?: boolean;
  production?: boolean;
  hudTitleLines?: string[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GAME_REGISTRY: Record<GameType, GameDefinition> = {
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
    icon: Dice5,
    theme: {
      gradient: 'from-amber-500/20 to-orange-600/20',
      cardBorder: 'border-amber-500/20',
      hoverBorder: 'hover:border-amber-500/30',
      playersTag: 'bg-amber-500/25 text-amber-200 border border-amber-500/30',
      iconColor: 'text-amber-400',
      buttonColors: 'bg-amber-600 hover:bg-amber-500',
      panelBg: 'bg-amber-950',
      labelColor: 'text-amber-200',
    },
    createState: createYahtzeeState,
    processAction: processYahtzeeAction,
    isOver: isYahtzeeOver,
    runBotTurn: runYahtzeeBotTurn,
    getWinners: getYahtzeeWinners,
    Board: YahtzeeBoard,
    fullBoard: true,
    production: true,
  },

  farkle: {
    title: 'Farkle',
    shortDescription: 'Push your luck with six dice. Keep scoring combos, avoid a farkle, and bank at the right time.',
    playersLabel: '2-6 Players',
    minPlayers: 2,
    maxPlayers: 6,
    info: {
      goal: 'Be the first player to reach 10,000 points by rolling six dice and banking your turn score.',
      rules: [
        'On your turn, roll all available dice and set aside at least one scoring die or combo.',
        'Single 1s score 100 and single 5s score 50.',
        'Three of a kind scores face value × 100, except three 1s score 1000.',
        'Four/five/six of a kind score 1000/2000/3000 respectively.',
        'A straight (1-2-3-4-5-6) scores 1500, three pairs score 1500, and two triplets score 2500.',
        'If a roll has no scoring dice, you farkle: your unbanked turn points are lost and your turn ends.',
        'If you score with all six dice, you get hot dice and may roll all six again in the same turn.',
        'You must bank at least 500 points in a single turn to get on the board for your first score.',
      ],
      howToPlay: [
        'Click Roll to roll all available dice.',
        'When scoring dice appear, select the dice you want to keep and click Keep Selected.',
        'After keeping dice, choose to keep pushing with Roll or secure points with Bank.',
        'If you farkle, your turn score resets to 0 and the next player starts.',
        'Use risk management: large turn totals are tempting, but one bad roll loses the whole turn.',
      ],
    },
    icon: Dice5,
    theme: {
      gradient: 'from-violet-500/20 to-purple-600/20',
      cardBorder: 'border-violet-500/20',
      hoverBorder: 'hover:border-violet-500/30',
      playersTag: 'bg-violet-500/25 text-violet-200 border border-violet-500/30',
      iconColor: 'text-violet-400',
      buttonColors: 'bg-violet-600 hover:bg-violet-500',
      panelBg: 'bg-violet-950',
      labelColor: 'text-violet-200',
    },
    createState: createFarkleState,
    processAction: processFarkleAction,
    isOver: isFarkleOver,
    runBotTurn: runFarkleBotTurn,
    getWinners: getFarkleWinners,
    Board: FarkleBoard,
    fullBoard: true,
    production: true,
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
    icon: Heart,
    theme: {
      gradient: 'from-rose-500/20 to-pink-600/20',
      cardBorder: 'border-rose-500/20',
      hoverBorder: 'hover:border-rose-500/30',
      playersTag: 'bg-rose-500/25 text-rose-200 border border-rose-500/30',
      iconColor: 'text-rose-400',
      buttonColors: 'bg-rose-600 hover:bg-rose-500',
      panelBg: 'bg-rose-950',
      labelColor: 'text-rose-200',
    },
    createState: (players, options) => createHeartsState(players, { targetScore: options?.targetScore }),
    processAction: processHeartsAction,
    isOver: isHeartsOver,
    runBotTurn: runHeartsBotTurn,
    getWinners: getHeartsWinners,
    Board: HeartsBoard,
    OptionsPanel: HeartsOptions,
    TitleExtra: HeartsTitleExtra,
    fullBoard: true,
    hasHandZoom: true,
    production: true,
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
    icon: Ship,
    theme: {
      gradient: 'from-cyan-500/20 to-blue-600/20',
      cardBorder: 'border-cyan-500/20',
      hoverBorder: 'hover:border-cyan-500/30',
      playersTag: 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/30',
      iconColor: 'text-cyan-400',
      buttonColors: 'bg-cyan-600 hover:bg-cyan-500',
      panelBg: 'bg-cyan-950',
      labelColor: 'text-cyan-200',
    },
    createState: createBattleshipState,
    processAction: processBattleshipAction,
    isOver: isBattleshipOver,
    runBotTurn: runBattleshipBotTurn,
    getWinners: getBattleshipWinners,
    Board: BattleshipBoard,
    production: false,
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
    icon: Crosshair,
    theme: {
      gradient: 'from-emerald-500/20 to-green-600/20',
      cardBorder: 'border-emerald-500/20',
      hoverBorder: 'hover:border-emerald-500/30',
      playersTag: 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/30',
      iconColor: 'text-emerald-400',
      buttonColors: 'bg-emerald-600 hover:bg-emerald-500',
      panelBg: 'bg-emerald-950',
      labelColor: 'text-emerald-200',
    },
    createState: createLiarsDiceState,
    processAction: processLiarsDiceAction,
    isOver: isLiarsDiceOver,
    runBotTurn: runLiarsDiceBotTurn,
    getWinners: getLiarsDiceWinners,
    Board: LiarsDiceBoard,
    production: false,
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
    icon: Club,
    theme: {
      gradient: 'from-orange-500/20 to-amber-600/20',
      cardBorder: 'border-orange-500/20',
      hoverBorder: 'hover:border-orange-500/30',
      playersTag: 'bg-orange-500/25 text-orange-200 border border-orange-500/30',
      iconColor: 'text-orange-400',
      buttonColors: 'bg-orange-600 hover:bg-orange-500',
      panelBg: 'bg-orange-950',
      labelColor: 'text-orange-200',
    },
    createState: createPokerState,
    processAction: processPokerAction,
    isOver: isPokerOver,
    runBotTurn: runPokerBotTurn,
    getWinners: getPokerWinners,
    Board: PokerBoard,
    TitleExtra: PokerTitleExtra,
    fullBoard: true,
    hasHandZoom: true,
    production: true,
  },

  'up-and-down-the-river': {
    title: 'Up and Down the River',
    shortDescription: 'Bid your exact tricks as rounds rise and fall between 1 and 7 cards. Choose 1-7-1 or 7-1-7 and nail your bids to rack up points.',
    playersLabel: '4-6 Players',
    minPlayers: 4,
    maxPlayers: 6,
    info: {
      goal: 'Score the most points by exactly matching your trick bid each round.',
      rules: [
        'Played with a standard 52-card deck among 4-6 players.',
        'At game start, choose a round order: 1,2,3,4,5,6,7,7,6,5,4,3,2,1 or 7,6,5,4,3,2,1,1,2,3,4,5,6,7 cards per player.',
        'Each round, one card is turned face up after dealing to set the trump suit.',
        'Starting left of the dealer, each player bids how many tricks they expect to win.',
        'You must follow the lead suit if possible. If you cannot, you may play any card, including trump.',
        'A trump card beats non-trump cards. If no trump is played, highest card of the lead suit wins.',
        'Exact bid scores 10 plus tricks won. Missing your bid scores 0.',
      ],
      howToPlay: [
        'When the host starts the game, pick either Up and Down (1-7-1) or Down and Up (7-1-7).',
        'Review your hand and the trump suit, then place your bid when it is your turn.',
        'When a trick starts, click a legal card to play.',
        'Track each player\'s bid and tricks won to gauge risk as the round progresses.',
        'After each round, scores are added and the dealer rotates.',
        'After the final 1-card round, highest total score wins.',
      ],
    },
    icon: ArrowUpDown,
    theme: {
      gradient: 'from-teal-500/20 to-sky-600/20',
      cardBorder: 'border-teal-500/20',
      hoverBorder: 'hover:border-teal-500/30',
      playersTag: 'bg-teal-500/25 text-teal-200 border border-teal-500/30',
      iconColor: 'text-teal-300',
      buttonColors: 'bg-teal-600 hover:bg-teal-500',
      panelBg: 'bg-teal-950',
      labelColor: 'text-teal-200',
    },
    createState: (players, options) => createUpRiverState(players, { upRiverStartMode: options?.upRiverStartMode }),
    processAction: processUpRiverAction,
    isOver: isUpRiverOver,
    runBotTurn: runUpRiverBotTurn,
    getWinners: getUpRiverWinners,
    Board: UpAndDownTheRiverBoard,
    OptionsPanel: UpRiverOptions,
    ToolbarExtra: UpRiverToolbarExtra,
    fullBoard: true,
    hasHandZoom: true,
    production: true,
    hudTitleLines: ['Up and Down', 'the River'],
  },

  twelve: {
    title: 'Twelve',
    shortDescription: 'Trick-taking with table piles, optional trump, and race-to-12 scoring.',
    playersLabel: '2-4 Players',
    minPlayers: 2,
    maxPlayers: 4,
    info: {
      goal: 'Reach 12 game points by timing trump and shog calls, winning round points, and taking the last trick.',
      rules: [
        'Play uses a 36-card deck: 6 through Ace in each suit (2-5 removed). Rank order is 6-9, J, Q, K, 10, A (Aces high).',
        'At round start, each player gets table piles chosen at launch: one face-down card with one face-up card on top of each pile. Remaining cards are dealt to hand.',
        'On your turn, play either a hand card or the exposed top card from one of your table piles.',
        'You must follow suit if able (from either hand or exposed pile cards). If you cannot, you may play any card.',
        'If trump is set, highest trump wins the trick; otherwise highest card of the lead suit wins.',
        'When a top pile card is played, any newly exposed face-down card flips face up at the start of the next trick.',
      ],
      howToPlay: [
        'Choose the pile count at launch, then review your hand and table piles.',
        'If it is your turn and you have a royal pair (K+Q same suit), you may set trump (+2) unless your score is 10 or more.',
        'After trump is set, you may call shog (+1 each suit) for each royal pair suit you have; at 11 you cannot call shog.',
        'Round points from captured cards: J=2, Q=3, K=4, 10=10, A=11, 6-9=0 (total 120).',
        'End of round: +1 for most round points (if unique), +1 for last trick. First to 12 wins; if multiple hit 12 in one round, most round points breaks the tie.',
      ],
    },
    icon: Crown,
    theme: {
      gradient: 'from-blue-500/20 to-indigo-600/20',
      cardBorder: 'border-blue-500/20',
      hoverBorder: 'hover:border-blue-500/30',
      playersTag: 'bg-blue-500/25 text-blue-200 border border-blue-500/30',
      iconColor: 'text-blue-300',
      buttonColors: 'bg-blue-600 hover:bg-blue-500',
      panelBg: 'bg-blue-950',
      labelColor: 'text-blue-200',
    },
    createState: (players, options) => createTwelveState(players, { pileCount: options?.pileCount }),
    processAction: processTwelveAction,
    isOver: isTwelveOver,
    runBotTurn: runTwelveBotTurn,
    getWinners: getTwelveWinners,
    Board: TwelveBoard,
    OptionsPanel: TwelveOptions,
    ToolbarExtra: TwelveToolbarExtra,
    fullBoard: true,
    hasHandZoom: true,
    production: true,
  },
};

/** All registered game types */
export const ALL_GAME_TYPES = Object.keys(GAME_REGISTRY) as GameType[];

/** Game types shown in production */
export const PRODUCTION_GAME_TYPES = ALL_GAME_TYPES.filter(
  (gt) => GAME_REGISTRY[gt].production,
);
