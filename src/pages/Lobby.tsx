import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Copy, Plus, Play, Dice5, Heart, Ship } from 'lucide-react';
import { useRoomContext } from '../networking/roomStore';
import PlayerList from '../components/PlayerList';
import LeaveButton from '../components/LeaveButton';
import type { GameType } from '../networking/types';

const GAME_TITLES: Record<GameType, string> = {
  yahtzee: 'Yahtzee',
  hearts: 'Hearts',
  battleship: 'Battleship',
};

const GAME_ICONS: Record<GameType, typeof Dice5> = {
  yahtzee: Dice5,
  hearts: Heart,
  battleship: Ship,
};

const MIN_PLAYERS: Record<GameType, number> = {
  yahtzee: 1,
  hearts: 4,
  battleship: 2,
};

const MAX_PLAYERS: Record<GameType, number> = {
  yahtzee: 4,
  hearts: 4,
  battleship: 2,
};

export default function Lobby() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { room, isHost, addBot, removeBot, removePlayer, startGame, rejoinRoom, connecting, error } = useRoomContext();
  const rejoinAttempted = useRef(false);

  // Auto-rejoin: if we have a room code in the URL but no room state, try to rejoin
  useEffect(() => {
    if (!room && !error && !connecting && roomCode && !rejoinAttempted.current) {
      rejoinAttempted.current = true;
      rejoinRoom(roomCode).catch(() => {
        navigate('/');
      });
    }
  }, [room, error, connecting, roomCode, rejoinRoom, navigate]);

  useEffect(() => {
    // Only redirect home if rejoin was attempted and failed
    if (!room && error && rejoinAttempted.current) {
      navigate('/');
    }
  }, [room, error, navigate]);

  useEffect(() => {
    if (room?.phase === 'playing' || room?.phase === 'finished') {
      navigate(`/game/${room.roomCode}`);
    }
  }, [room?.phase, room?.roomCode, navigate]);

  if (!room) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">{connecting ? 'Reconnecting...' : 'Connecting to room...'}</p>
      </div>
    );
  }

  const Icon = GAME_ICONS[room.gameType];
  const canAddBot = room.players.length < MAX_PLAYERS[room.gameType];
  const canStart = room.players.length >= MIN_PLAYERS[room.gameType] && room.players.length <= MAX_PLAYERS[room.gameType];

  const copyCode = () => {
    navigator.clipboard.writeText(room.roomCode);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-lg mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/20 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{GAME_TITLES[room.gameType]}</h1>
            <p className="text-xs text-gray-500">Waiting for players</p>
          </div>
        </div>
        <LeaveButton />
      </div>

      {/* Room Code */}
      <div className="glass rounded-2xl p-6 text-center space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Room Code</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-extrabold tracking-[0.3em] text-white font-mono">
            {room.roomCode}
          </span>
          <button
            onClick={copyCode}
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            title="Copy room code"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <p className="text-xs text-gray-500">Share this code with friends to invite them</p>
      </div>

      {/* Error */}
      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Players */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-400">
            Players ({room.players.length}/{MAX_PLAYERS[room.gameType]})
          </h2>
          {isHost && canAddBot && (
            <button
              onClick={addBot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Bot
            </button>
          )}
        </div>
        <PlayerList
          players={room.players}
          hostId={room.hostId}
          isHost={isHost}
          onRemoveBot={removeBot}
          onRemovePlayer={removePlayer}
        />
      </div>

      {/* Start Button (Host Only) */}
      {isHost && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={startGame}
          disabled={!canStart}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold text-lg hover:from-primary-500 hover:to-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-600/20 cursor-pointer"
        >
          <Play className="w-5 h-5" />
          Start Game
        </motion.button>
      )}

      {!isHost && (
        <div className="text-center py-4">
          <p className="text-gray-500 text-sm">Waiting for the host to start the game...</p>
        </div>
      )}

      {/* Min players notice */}
      {isHost && !canStart && (
        <p className="text-center text-xs text-gray-500">
          Need {MIN_PLAYERS[room.gameType]} players to start. Add bots to fill slots.
        </p>
      )}
    </motion.div>
  );
}
