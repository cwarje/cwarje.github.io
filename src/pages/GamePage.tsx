import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useRoomContext } from '../networking/roomStore';
import LeaveButton from '../components/LeaveButton';
import YahtzeeBoard from '../games/yahtzee/YahtzeeBoard';
import HeartsBoard from '../games/hearts/HeartsBoard';
import BattleshipBoard from '../games/battleship/BattleshipBoard';
import type { YahtzeeState } from '../games/yahtzee/types';
import type { HeartsState } from '../games/hearts/types';
import type { BattleshipState } from '../games/battleship/types';

export default function GamePage() {
  const navigate = useNavigate();
  const { room, gameState, myId, isHost, sendAction, playAgain, error } = useRoomContext();

  useEffect(() => {
    if (!room) {
      navigate('/');
    }
  }, [room, navigate]);

  if (!room || !gameState) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Loading game...</p>
      </div>
    );
  }

  const isFinished = room.phase === 'finished';

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white capitalize">{room.gameType}</h1>
          <p className="text-xs text-gray-500">Room: {room.roomCode}</p>
        </div>
        <div className="flex items-center gap-3">
          {isFinished && isHost && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={playAgain}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </motion.button>
          )}
          <LeaveButton />
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Game Board */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {room.gameType === 'yahtzee' && (
          <YahtzeeBoard state={gameState as YahtzeeState} myId={myId} onAction={sendAction} />
        )}
        {room.gameType === 'hearts' && (
          <HeartsBoard state={gameState as HeartsState} myId={myId} onAction={sendAction} />
        )}
        {room.gameType === 'battleship' && (
          <BattleshipBoard state={gameState as BattleshipState} myId={myId} onAction={sendAction} />
        )}
      </motion.div>
    </div>
  );
}
