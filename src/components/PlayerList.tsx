import { Bot, User, Crown, X, Wifi, WifiOff } from 'lucide-react';
import type { Player } from '../networking/types';
import { DEFAULT_PLAYER_COLOR, normalizePlayerColor, PLAYER_COLOR_HEX } from '../networking/playerColors';

interface PlayerListProps {
  players: Player[];
  hostId: string;
  isHost: boolean;
  onRemoveBot?: (botId: string) => void;
  onRemovePlayer?: (playerId: string) => void;
  wins?: Record<string, number>;
}

export default function PlayerList({ players, hostId, isHost, onRemoveBot, onRemovePlayer, wins }: PlayerListProps) {
  return (
    <div className="space-y-1">
      {players.map((player) => {
        const iconColor = PLAYER_COLOR_HEX[normalizePlayerColor(player.color)] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
        return (
        <div
          key={player.id}
          className="flex items-center gap-2 px-3 py-2 rounded-xl glass-light"
        >
          <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
            {player.isBot ? (
              <Bot className="w-3.5 h-3.5" style={{ color: iconColor }} />
            ) : (
              <User className="w-3.5 h-3.5" style={{ color: iconColor }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">{player.name}</span>
              {player.id === hostId && (
                <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              )}
              {wins && wins[player.id] > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 tracking-wider">
                  {wins[player.id]} {wins[player.id] === 1 ? 'win' : 'wins'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 w-6 flex-shrink-0 justify-end">
            {!player.isBot && (
              <div className="w-6 h-6 flex items-center justify-center">
                {player.connected ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                )}
              </div>
            )}
            {isHost && player.isBot && onRemoveBot && (
              <button
                onClick={() => onRemoveBot(player.id)}
                className="w-6 h-6 rounded-md hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove bot"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
            {isHost && !player.isBot && !player.connected && player.id !== hostId && onRemovePlayer && (
              <button
                onClick={() => onRemovePlayer(player.id)}
                className="w-6 h-6 rounded-md hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove disconnected player"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        </div>
      );
      })}
    </div>
  );
}
