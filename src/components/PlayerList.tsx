import { Bot, User, Crown, X, Wifi, WifiOff } from 'lucide-react';
import type { Player } from '../networking/types';
import { PLAYER_COLOR_HEX } from '../networking/playerColors';

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
    <div className="space-y-1.5">
      {players.map((player) => (
        <div
          key={player.id}
          className="flex items-center gap-2 rounded-lg glass-light px-3 py-2"
        >
          {player.isBot ? (
            <Bot
              className="h-3.5 w-3.5 flex-shrink-0"
              style={{ color: PLAYER_COLOR_HEX[player.color] }}
            />
          ) : (
            <User
              className="h-3.5 w-3.5 flex-shrink-0"
              style={{ color: PLAYER_COLOR_HEX[player.color] }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-white">{player.name}</span>
              {player.id === hostId && (
                <Crown className="h-3 w-3 text-amber-400 flex-shrink-0" />
              )}
              {wins && wins[player.id] > 0 && (
                <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-amber-400">
                  {wins[player.id]} {wins[player.id] === 1 ? 'win' : 'wins'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!player.isBot && (
              player.connected ? (
                <Wifi className="h-3 w-3 text-emerald-400" />
              ) : (
                <WifiOff className="h-3 w-3 text-red-400" />
              )
            )}
            {isHost && player.isBot && onRemoveBot && (
              <button
                onClick={() => onRemoveBot(player.id)}
                className="flex h-5 w-5 items-center justify-center rounded-md transition-colors cursor-pointer hover:bg-red-500/20"
                title="Remove bot"
              >
                <X className="h-3 w-3 text-red-400" />
              </button>
            )}
            {isHost && !player.isBot && !player.connected && player.id !== hostId && onRemovePlayer && (
              <button
                onClick={() => onRemovePlayer(player.id)}
                className="flex h-5 w-5 items-center justify-center rounded-md transition-colors cursor-pointer hover:bg-red-500/20"
                title="Remove disconnected player"
              >
                <X className="h-3 w-3 text-red-400" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
