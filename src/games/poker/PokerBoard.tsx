import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ChevronUp, ChevronDown, Play, LogOut } from 'lucide-react';
import { DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, normalizePlayerColor } from '../../networking/playerColors';
import type { PokerState, PokerAction, Card, PokerPlayer } from './types';

// ────────────────────────────────────────────
// Card display helpers
// ────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: 'text-red-500',
  diamonds: 'text-red-500',
  clubs: 'text-white',
  spades: 'text-white',
};

function rankLabel(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

function PokerCardDisplay({ card, faceDown = false, size = 'md' }: { card?: Card; faceDown?: boolean; size?: 'sm' | 'md' }) {
  if (faceDown || !card) {
    return (
      <div className={`poker-card ${size === 'sm' ? '!w-10 !h-14' : ''} bg-gradient-to-br from-blue-800 to-blue-950 border-2 border-blue-700/50 flex items-center justify-center shadow-md`}>
        <div className="w-3/4 h-3/4 rounded border border-blue-600/30 bg-blue-900/50" />
      </div>
    );
  }

  return (
    <div className={`poker-card ${size === 'sm' ? '!w-10 !h-14' : ''}`}>
      <span className={`poker-cardRank ${SUIT_COLORS[card.suit]}`}>{rankLabel(card.rank)}</span>
      <span className={`poker-cardSuit text-xs leading-none ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}

// ────────────────────────────────────────────
// Layout: ellipse radii per player count (percent)
// ────────────────────────────────────────────

function getPokerLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount >= 6) return { seatRadiusX: 42, seatRadiusY: 36 };
  if (playerCount === 5) return { seatRadiusX: 38, seatRadiusY: 32 };
  if (playerCount === 4) return { seatRadiusX: 36, seatRadiusY: 30 };
  if (playerCount === 3) return { seatRadiusX: 32, seatRadiusY: 28 };
  return { seatRadiusX: 28, seatRadiusY: 24 }; // 2
}

interface PokerSeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: PokerPlayer;
  seatLeft: number;
  seatTop: number;
}

// ────────────────────────────────────────────
// Main Board component
// ────────────────────────────────────────────

interface PokerBoardProps {
  state: PokerState;
  myId: string;
  onAction: (action: unknown) => void;
  isHost: boolean;
  onLeave?: () => void;
  isHandZoomed?: boolean;
}

export default function PokerBoard({ state, myId, onAction, isHost, onLeave, isHandZoomed = false }: PokerBoardProps) {
  const [raiseAmount, setRaiseAmount] = useState<number>(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const me = state.players.find(p => p.id === myId);
  const myIndex = state.players.findIndex(p => p.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId && !state.gameOver;
  const currentPlayer = state.players[state.currentPlayerIndex];

  const toCall = me ? state.currentBet - me.betThisStreet : 0;
  const canCheck = toCall === 0;
  const minRaiseTotal = state.currentBet + state.minRaise;
  const maxRaiseTotal = me ? me.betThisStreet + me.chips : 0;
  const effectiveMinRaise = Math.min(minRaiseTotal, maxRaiseTotal);

  const totalPot = state.players.reduce((sum, p) => sum + p.totalContrib, 0);

  const sendAction = (action: PokerAction) => {
    onAction(action);
  };

  const handleRaise = () => {
    const amount = Math.max(effectiveMinRaise, Math.min(raiseAmount, maxRaiseTotal));
    sendAction({ type: 'raise', amount });
  };

  const seatLayouts = useMemo<PokerSeatLayout[]>(() => {
    const playerCount = state.players.length;
    if (playerCount === 0) return [];
    const radii = getPokerLayoutRadii(playerCount);
    return Array.from({ length: playerCount }, (_, relativeIndex) => {
      const playerIndex = (anchorIndex + relativeIndex) % playerCount;
      const player = state.players[playerIndex];
      const angle = 90 + (360 * relativeIndex) / playerCount;
      const angleInRadians = (angle * Math.PI) / 180;
      return {
        relativeIndex,
        playerIndex,
        player,
        seatLeft: 50 + radii.seatRadiusX * Math.cos(angleInRadians),
        seatTop: 50 + radii.seatRadiusY * Math.sin(angleInRadians),
      };
    });
  }, [state.players, anchorIndex]);

  const headsUpMessage = useMemo(() => {
    if (state.gameOver && state.winners.length > 0) {
      const names = state.winners.map(w => {
        const p = state.players.find(x => x.id === w.playerId);
        return p?.id === myId ? 'You' : (p?.name ?? w.playerId);
      });
      return names.length === 1 ? `${names[0]} wins the hand` : `${names.join(' and ')} win the hand`;
    }
    if (state.gameOver && state.sessionOver) return 'Session over';
    if (state.gameOver && !state.sessionOver) return 'Hand over — waiting for host to deal next hand';
    if (!state.gameOver && currentPlayer) {
      const name = currentPlayer.id === myId ? 'Your' : `${currentPlayer.name}'s`;
      return `${state.street.charAt(0).toUpperCase() + state.street.slice(1)} · ${name} turn`;
    }
    return '\u00a0';
  }, [state.gameOver, state.sessionOver, state.winners, state.players, state.street, currentPlayer, myId]);

  const renderSeatPill = (layout: PokerSeatLayout) => {
    const { player } = layout;
    const isCurrentTurn = !state.gameOver && state.players[state.currentPlayerIndex]?.id === player.id;
    const isMe = player.id === myId;
    const isDealer = state.players[state.dealerIndex]?.id === player.id;
    const color = normalizePlayerColor((player as { color?: string }).color ?? null);
    const seatColor = PLAYER_COLOR_HEX[color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const activeClass = isCurrentTurn ? (isMe ? 'poker-seatPill--activeSelf' : 'poker-seatPill--activeOther') : '';
    const foldedClass = player.folded ? 'poker-seatPill--folded' : '';

    return (
      <div
        className={`poker-seatPill ${activeClass} ${isMe ? 'poker-seatPill--me' : ''} ${foldedClass}`}
      >
        <div className="poker-seatPillColor" style={{ backgroundColor: seatColor }} />
        <div className="poker-seatPillBody">
          <span className="poker-seatPillName">{isMe ? 'You' : player.name}</span>
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {isDealer && <span className="text-[10px] font-bold bg-amber-500/30 text-amber-300 rounded px-1">D</span>}
            {player.allIn && <span className="text-[10px] font-bold bg-red-500/30 text-red-300 rounded px-1">AI</span>}
            {player.leftGame && <span className="text-[10px] text-gray-500">left</span>}
          </div>
          <span className="poker-seatPillChips">{player.chips} chips</span>
          {player.betThisStreet > 0 && <span className="text-[10px] text-amber-400">bet {player.betThisStreet}</span>}
        </div>
      </div>
    );
  };

  // Between-hands / session-over / winners (full-screen overlays when game over)
  if (state.gameOver && state.sessionOver) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="poker-board h-full flex flex-col items-center justify-center space-y-6 text-center p-6">
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-2xl font-bold text-white">Session Over</h2>
        <p className="text-sm text-white/80">Final standings</p>
        <div className="space-y-2 w-full max-w-xs">
          {[...state.players].filter(p => !p.leftGame).sort((a, b) => b.chips - a.chips).map((p, i) => (
            <div key={p.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2">
              <span className="font-medium text-white text-left">{i === 0 && p.chips > 0 ? '👑 ' : ''}{p.id === myId ? 'You' : p.name}</span>
              <span className={`font-bold text-right ${p.chips > 0 ? 'text-green-400' : 'text-red-400'}`}>{p.chips} chips</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (state.gameOver && state.winners.length > 0 && !state.sessionOver) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="poker-board space-y-4">
        <div ref={tableRef} className={`poker-table poker-table--players-${state.players.length}`}>
          {seatLayouts.map((layout) => (
            <div
              key={layout.player.id}
              className={`poker-seat ${layout.relativeIndex === 0 ? 'poker-seat--self' : ''}`}
              style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
            >
              {renderSeatPill(layout)}
            </div>
          ))}
          <div className="poker-center">
            <div className="poker-pot">Pot {totalPot}</div>
            <div className="poker-communityCards">
              {state.communityCards.map((card, i) => <PokerCardDisplay key={i} card={card} size="md" />)}
            </div>
          </div>
        </div>
        <div className="poker-headsUp" aria-live="polite">
          <p className="poker-headsUpText">{headsUpMessage || '\u00a0'}</p>
        </div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <Trophy className="w-5 h-5" />
            {state.winners.length === 1 ? 'Winner' : 'Winners'}
          </div>
          {state.winners.map((w) => {
            const player = state.players.find(p => p.id === w.playerId);
            return (
              <div key={w.playerId} className="flex justify-between gap-4 text-sm">
                <span className="text-white font-medium text-left">{player?.id === myId ? 'You' : player?.name ?? w.playerId}</span>
                <span className="text-amber-300 font-bold text-right">+{w.amount} · {w.handName}</span>
              </div>
            );
          })}
        </motion.div>
        {isHost && (
          <button
            onClick={() => sendAction({ type: 'next-hand' })}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-primary-600 text-white font-bold text-lg hover:bg-primary-500 cursor-pointer"
          >
            <Play className="w-5 h-5" />
            Deal Next Hand
          </button>
        )}
        {!isHost && (
          <div className="space-y-3">
            <p className="text-center text-sm text-white/70">Waiting for host to deal next hand...</p>
            {onLeave && (
              <button onClick={onLeave} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-pointer font-medium">
                <LogOut className="w-4 h-4" />
                Leave Table
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // Main playing view: table + heads-up + hand + action row
  return (
    <div className="poker-board space-y-3 sm:space-y-4">
      <div ref={tableRef} className={`poker-table poker-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={layout.player.id}
            className={`poker-seat ${layout.relativeIndex === 0 ? 'poker-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            {renderSeatPill(layout)}
          </div>
        ))}

        <div className="poker-center">
          <div className="poker-pot">Pot {totalPot}{state.handNumber > 0 ? ` · Hand #${state.handNumber}` : ''}</div>
          <div className="poker-communityCards">
            {[0, 1, 2, 3, 4].map((i) => {
              const card = state.communityCards[i];
              if (!card && state.street === 'preflop') return <PokerCardDisplay key={i} faceDown size="md" />;
              return card ? <PokerCardDisplay key={i} card={card} size="md" /> : <div key={i} className="w-14 h-20 rounded-lg border-2 border-white/10 bg-white/5" />;
            })}
          </div>
        </div>
      </div>

      <div className="poker-headsUp" aria-live="polite">
        <p className="poker-headsUpText">{headsUpMessage || '\u00a0'}</p>
      </div>

      {me && (
        <div className={`poker-hand ${isHandZoomed ? 'poker-hand--zoom' : ''}`}>
          {me.holeCards.length > 0 ? (
            me.holeCards.map((c, i) => <PokerCardDisplay key={i} card={c} size="sm" />)
          ) : (
            [0, 1].map((i) => <PokerCardDisplay key={i} faceDown size="sm" />)
          )}
        </div>
      )}

      {isMyTurn && me && !me.folded && !me.allIn && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="poker-actionRow">
          <button type="button" onClick={() => sendAction({ type: 'fold' })} className="poker-actionButton border-white/20 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white">
            Fold
          </button>
          {canCheck ? (
            <button type="button" onClick={() => sendAction({ type: 'check' })} className="poker-actionButton bg-primary-600 border-primary-700 text-white hover:bg-primary-500">
              Check
            </button>
          ) : (
            <button type="button" onClick={() => sendAction({ type: 'call' })} className="poker-actionButton bg-primary-600 border-primary-700 text-white hover:bg-primary-500">
              Call {Math.min(toCall, me.chips)}
            </button>
          )}
          {me.chips > toCall && (
            <>
              <button type="button" onClick={() => setRaiseAmount(prev => Math.max(effectiveMinRaise, prev - state.bigBlind))} className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
                <ChevronDown className="w-4 h-4 text-white" />
              </button>
              <div className="flex flex-col items-center min-w-[80px]">
                <input
                  type="range"
                  min={effectiveMinRaise}
                  max={maxRaiseTotal}
                  step={state.bigBlind}
                  value={raiseAmount || effectiveMinRaise}
                  onChange={e => setRaiseAmount(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <span className="text-xs text-white/80">{raiseAmount || effectiveMinRaise}</span>
              </div>
              <button type="button" onClick={() => setRaiseAmount(prev => Math.min(maxRaiseTotal, (prev || effectiveMinRaise) + state.bigBlind))} className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
                <ChevronUp className="w-4 h-4 text-white" />
              </button>
              <button type="button" onClick={handleRaise} className="poker-actionButton bg-amber-600 border-amber-700 text-white hover:bg-amber-500">
                Raise
              </button>
            </>
          )}
          {me.chips > 0 && (
            <button type="button" onClick={() => sendAction({ type: 'raise', amount: me.betThisStreet + me.chips })} className="poker-actionButton border-red-500/30 text-red-300 hover:bg-red-500/20">
              All In ({me.chips})
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
