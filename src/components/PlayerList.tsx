import { Bot, User, Crown, X, Wifi, WifiOff } from 'lucide-react';
import type { Player } from '../networking/types';

interface PlayerListProps {
  players: Player[];
  hostId: string;
  isHost: boolean;
  onRemoveBot?: (botId: string) => void;
}

export default function PlayerList({ players, hostId, isHost, onRemoveBot }: PlayerListProps) {
  return (
    <div className="space-y-2">
      {players.map((player) => (
        <div
          key={player.id}
          className="flex items-center gap-3 px-4 py-3 rounded-xl glass-light"
        >
          <div className="w-8 h-8 rounded-lg bg-primary-600/20 flex items-center justify-center">
            {player.isBot ? (
              <Bot className="w-4 h-4 text-primary-400" />
            ) : (
              <User className="w-4 h-4 text-primary-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">{player.name}</span>
              {player.id === hostId && (
                <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              )}
              {player.isBot && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary-600/20 text-primary-400 uppercase tracking-wider">Bot</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!player.isBot && (
              player.connected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )
            )}
            {isHost && player.isBot && onRemoveBot && (
              <button
                onClick={() => onRemoveBot(player.id)}
                className="w-6 h-6 rounded-md hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
