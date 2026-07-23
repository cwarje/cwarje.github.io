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
    <div className="space-y-0.5">
      {players.map((player) => {
        const iconColor = PLAYER_COLOR_HEX[normalizePlayerColor(player.color)] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
        return (
        <div
          key={player.id}
          className="flex items-center gap-1.5 px-2 py-1 min-h-[32px] rounded-md bg-surface-50 border border-surface-200"
        >
          {player.isBot ? (
            <Bot className="w-3.5 h-3.5 flex-shrink-0" style={{ color: iconColor }} />
          ) : (
            <User className="w-3.5 h-3.5 flex-shrink-0" style={{ color: iconColor }} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs font-medium text-surface-900 truncate">{player.name}</span>
              {player.id === hostId && (
                <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />
              )}
              {wins && wins[player.id] > 0 && (
                <span className="text-[9px] font-medium px-1 py-px rounded bg-amber-100 text-amber-700 flex-shrink-0">
                  {wins[player.id]}W
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {!player.isBot && (
              player.connected ? (
                <Wifi className="w-3 h-3 text-emerald-600" />
              ) : (
                <WifiOff className="w-3 h-3 text-red-500" />
              )
            )}
            {isHost && player.isBot && onRemoveBot && (
              <button
                onClick={() => onRemoveBot(player.id)}
                className="w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove bot"
              >
                <X className="w-3 h-3 text-red-500" />
              </button>
            )}
            {isHost && !player.isBot && !player.connected && player.id !== hostId && onRemovePlayer && (
              <button
                onClick={() => onRemovePlayer(player.id)}
                className="w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove disconnected player"
              >
                <X className="w-3 h-3 text-red-500" />
              </button>
            )}
          </div>
        </div>
      );
      })}
    </div>
  );
}
