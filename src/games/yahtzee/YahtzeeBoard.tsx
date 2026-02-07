import { motion, AnimatePresence } from 'framer-motion';
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, RotateCcw, Trophy } from 'lucide-react';
import type { YahtzeeState, ScoreCategory } from './types';
import { calculateScore } from './logic';

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const UPPER_CATEGORIES: { key: ScoreCategory; label: string }[] = [
  { key: 'ones', label: 'Ones' },
  { key: 'twos', label: 'Twos' },
  { key: 'threes', label: 'Threes' },
  { key: 'fours', label: 'Fours' },
  { key: 'fives', label: 'Fives' },
  { key: 'sixes', label: 'Sixes' },
];

const LOWER_CATEGORIES: { key: ScoreCategory; label: string }[] = [
  { key: 'threeOfAKind', label: '3 of a Kind' },
  { key: 'fourOfAKind', label: '4 of a Kind' },
  { key: 'fullHouse', label: 'Full House' },
  { key: 'smallStraight', label: 'Sm. Straight' },
  { key: 'largeStraight', label: 'Lg. Straight' },
  { key: 'yahtzee', label: 'Yahtzee' },
  { key: 'chance', label: 'Chance' },
];

interface YahtzeeBoardProps {
  state: YahtzeeState;
  myId: string;
  onAction: (action: unknown) => void;
}

export default function YahtzeeBoard({ state, myId, onAction }: YahtzeeBoardProps) {
  const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const myPlayer = state.players.find(p => p.id === myId);
  const hasRolled = state.rollsLeft < 3;

  const handleRoll = () => {
    if (isMyTurn && state.rollsLeft > 0) {
      onAction({ type: 'roll' });
    }
  };

  const handleToggleHold = (index: number) => {
    if (isMyTurn && hasRolled && state.rollsLeft > 0) {
      onAction({ type: 'toggle-hold', index });
    }
  };

  const handleScore = (category: ScoreCategory) => {
    if (isMyTurn && hasRolled && myPlayer?.scorecard[category] === null) {
      onAction({ type: 'score', category });
    }
  };

  if (state.gameOver) {
    const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-6 text-center">
        <Trophy className="w-16 h-16 text-amber-400 mx-auto" />
        <h2 className="text-3xl font-extrabold text-white">Game Over!</h2>
        <div className="space-y-3">
          {sorted.map((p, i) => (
            <div key={p.id} className={`flex items-center justify-between px-5 py-3 rounded-xl ${i === 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'glass-light'}`}>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${i === 0 ? 'text-amber-400' : 'text-gray-400'}`}>#{i + 1}</span>
                <span className="text-white font-medium">{p.name}</span>
              </div>
              <span className="text-xl font-bold text-white">{p.totalScore}</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Turn indicator */}
      <div className="text-center">
        <p className="text-sm text-gray-400">
          Round {state.round}/13 &middot;{' '}
          <span className={isMyTurn ? 'text-primary-400 font-medium' : 'text-white'}>
            {isMyTurn ? "Your turn" : `${currentPlayer?.name}'s turn`}
          </span>
        </p>
      </div>

      {/* Dice */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {state.dice.map((value, i) => {
              const DiceIcon = DICE_ICONS[value - 1];
              return (
                <motion.button
                  key={i}
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: state.rollsLeft < 3 ? 360 : 0 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  onClick={() => handleToggleHold(i)}
                  disabled={!isMyTurn || !hasRolled || state.rollsLeft === 0}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    state.held[i]
                      ? 'bg-primary-600/30 border-2 border-primary-400 shadow-lg shadow-primary-600/20'
                      : 'bg-white/10 border border-white/10 hover:bg-white/15'
                  } ${!isMyTurn || !hasRolled ? 'opacity-60' : ''}`}
                >
                  <DiceIcon className={`w-8 h-8 sm:w-10 sm:h-10 ${state.held[i] ? 'text-primary-300' : 'text-white'}`} />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {isMyTurn && (
          <button
            onClick={handleRoll}
            disabled={state.rollsLeft === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Roll {hasRolled ? `(${state.rollsLeft} left)` : ''}
          </button>
        )}
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.players.map((player) => {
          const isMe = player.id === myId;
          const isCurrent = state.players[state.currentPlayerIndex]?.id === player.id;

          return (
            <div
              key={player.id}
              className={`glass rounded-2xl p-4 space-y-3 ${isCurrent ? 'ring-1 ring-primary-500/30' : ''}`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold ${isMe ? 'text-primary-400' : 'text-white'}`}>
                  {player.name} {isMe ? '(You)' : ''}
                </h3>
                <span className="text-lg font-bold text-white">{player.totalScore}</span>
              </div>

              {/* Upper section */}
              <div className="space-y-1">
                {UPPER_CATEGORIES.map(({ key, label }) => {
                  const scored = player.scorecard[key];
                  const potential = isMe && isMyTurn && hasRolled && scored === null ? calculateScore(state.dice, key) : null;

                  return (
                    <button
                      key={key}
                      onClick={() => isMe && handleScore(key)}
                      disabled={!isMe || !isMyTurn || !hasRolled || scored !== null}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        scored !== null
                          ? 'bg-white/5 text-gray-500'
                          : potential !== null
                          ? 'bg-primary-600/10 hover:bg-primary-600/20 text-white cursor-pointer'
                          : 'bg-transparent text-gray-600'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="font-mono font-bold">
                        {scored !== null ? scored : potential !== null ? <span className="text-primary-400">{potential}</span> : '-'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-white/5" />

              {/* Lower section */}
              <div className="space-y-1">
                {LOWER_CATEGORIES.map(({ key, label }) => {
                  const scored = player.scorecard[key];
                  const potential = isMe && isMyTurn && hasRolled && scored === null ? calculateScore(state.dice, key) : null;

                  return (
                    <button
                      key={key}
                      onClick={() => isMe && handleScore(key)}
                      disabled={!isMe || !isMyTurn || !hasRolled || scored !== null}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        scored !== null
                          ? 'bg-white/5 text-gray-500'
                          : potential !== null
                          ? 'bg-primary-600/10 hover:bg-primary-600/20 text-white cursor-pointer'
                          : 'bg-transparent text-gray-600'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="font-mono font-bold">
                        {scored !== null ? scored : potential !== null ? <span className="text-primary-400">{potential}</span> : '-'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
