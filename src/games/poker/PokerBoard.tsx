import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ChevronUp, ChevronDown, Play, LogOut } from 'lucide-react';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, normalizePlayerColor } from '../../networking/playerColors';
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
  clubs: 'text-gray-800',
  spades: 'text-gray-800',
};

function rankLabel(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

function PokerCardDisplay({ card, faceDown = false, size = 'md', skipFlip = false }: { card?: Card; faceDown?: boolean; size?: 'sm' | 'md'; skipFlip?: boolean }) {
  if (faceDown || !card) {
    const backSizeClass = size === 'sm' ? '!w-10 !h-14' : '';
    return (
      <div className={`poker-card poker-cardBack ${backSizeClass}`} />
    );
  }

  const sizeClass = size === 'sm' ? 'poker-cardFlip--sm' : '';
  return (
    <div className={`poker-cardFlip ${sizeClass}`}>
      <motion.div
        className="poker-cardFlipInner"
        initial={skipFlip ? false : { rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={skipFlip ? undefined : { duration: 0.45, ease: 'easeInOut' }}
      >
        <div className="poker-cardFlipBack" aria-hidden="true" />
        <div className="poker-cardFlipFront">
          <div className="poker-cardCorner">
            <span className={`poker-cardRank ${SUIT_COLORS[card.suit]}`}>{rankLabel(card.rank)}</span>
            <span className={`poker-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        </div>
      </motion.div>
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

function getPlayerColorHex(player: PokerPlayer): string {
  const color = normalizePlayerColor((player as { color?: string }).color ?? null);
  return PLAYER_COLOR_HEX[color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
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
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(180);

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

  useEffect(() => {
    const element = handContainerRef.current;
    if (!element) return;

    const updateSize = () => setHandWidth(element.clientWidth);
    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

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

  const headsUpContent = useMemo((): ReactNode => {
    if (state.gameOver && state.winners.length > 0) {
      const winnerPlayers = state.winners
        .map(w => state.players.find(x => x.id === w.playerId))
        .filter((p): p is PokerPlayer => !!p);
      if (winnerPlayers.length === 1) {
        const p = winnerPlayers[0];
        if (p.id === myId) return 'You win the hand';
        return (
          <>
            <span style={{ color: getPlayerColorHex(p) }}>{p.name}</span>
            {' wins the hand'}
          </>
        );
      }
      return (
        <>
          {winnerPlayers.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ' and '}
              {p.id === myId ? 'You' : <span style={{ color: getPlayerColorHex(p) }}>{p.name}</span>}
            </span>
          ))}
          {' win the hand'}
        </>
      );
    }
    if (state.gameOver && state.sessionOver) return 'Session over';
    if (state.gameOver && !state.sessionOver) return 'Hand over — waiting for host to deal next hand';
    if (!state.gameOver && currentPlayer) {
      const streetCapitalized = state.street.charAt(0).toUpperCase() + state.street.slice(1);
      if (currentPlayer.id === myId) {
        return `${streetCapitalized} · Your turn`;
      }
      return (
        <>
          {streetCapitalized} · <span style={{ color: getPlayerColorHex(currentPlayer) }}>{currentPlayer.name}</span>'s turn
        </>
      );
    }
    return '\u00a0';
  }, [state.gameOver, state.sessionOver, state.winners, state.players, state.street, currentPlayer, myId]);

  const visibleHandCards = me?.holeCards.length ? me.holeCards : [undefined, undefined];
  const handLayout = useMemo(() => {
    const cardCount = visibleHandCards.length;
    const available = Math.max(handWidth - 8, 150);
    const maxCardWidth = 80;
    const cardWidth = Math.max(52, Math.min(available * 0.42, maxCardWidth));
    const cardHeight = Math.round(cardWidth * 1.4);
    const defaultStep = Math.round(cardWidth * 0.72);
    const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
    const step = cardCount > 1 ? Math.max(22, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;

    return {
      cardWidth,
      cardHeight,
      step,
      spreadWidth,
      hoverLift: 14,
    };
  }, [handWidth, visibleHandCards.length]);

  const renderSeatPill = (layout: PokerSeatLayout) => {
    const { player } = layout;
    const isCurrentTurn = !state.gameOver && state.players[state.currentPlayerIndex]?.id === player.id;
    const isMe = player.id === myId;
    const isDealer = state.players[state.dealerIndex]?.id === player.id;
    const color = normalizePlayerColor((player as { color?: string }).color ?? null);
    const seatColor = PLAYER_COLOR_HEX[color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(color) ? '#ffffff' : '#111827';
    const activeClass = isCurrentTurn ? (isMe ? 'poker-seatPill--activeSelf' : 'poker-seatPill--activeOther') : '';
    const foldedClass = player.folded ? 'poker-seatPill--folded' : '';

    return (
      <div
        className={`poker-seatPill ${activeClass} ${isMe ? 'poker-seatPill--me' : ''} ${foldedClass}`}
      >
        <div className="poker-seatPillTop" style={{ backgroundColor: seatColor }}>
          <span className="poker-seatPillName" style={{ color: seatTextColor }}>{isMe ? 'You' : player.name}{isDealer ? ' (Dealer)' : ''}</span>
          <div className="poker-seatPillBadges">
            {player.allIn && <span className="text-[10px] font-bold bg-red-500/30 text-red-300 rounded px-1">AI</span>}
            {player.leftGame && <span className="text-[10px] text-gray-500">left</span>}
          </div>
        </div>
        <div className="poker-seatPillBody">
          <span className="poker-seatCell poker-seatCell--label">chips</span>
          <span className="poker-seatCell poker-seatCell--chips">{player.chips}</span>
          <span className="poker-seatCell poker-seatCell--label">bet</span>
          <span className="poker-seatCell poker-seatCell--bet">{player.betThisStreet}</span>
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

  const showHandWinners = state.gameOver && state.winners.length > 0 && !state.sessionOver;

  // Main playing view: table + heads-up + contextual bottom section
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

        <div className={`poker-center ${isHandZoomed ? 'poker-center--zoom' : ''}`}>
          <div className="poker-pot">Pot {totalPot}</div>
          <div className="poker-communityCards">
            {[0, 1, 2, 3, 4].map((i) => {
              const card = state.communityCards[i];
              if (!card && state.street === 'preflop') return <PokerCardDisplay key={i} faceDown size="md" />;
              return card ? <PokerCardDisplay key={`community-${i}-${card.suit}-${card.rank}`} card={card} size="md" skipFlip={showHandWinners} /> : <div key={i} className="poker-communityPlaceholder" />;
            })}
          </div>
        </div>
      </div>

      <div className="poker-headsUp" aria-live="polite">
        <p className="poker-headsUpText">{headsUpContent ?? '\u00a0'}</p>
      </div>

      {showHandWinners ? (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Trophy className="w-5 h-5" />
              {state.winners.length === 1 ? 'Winner' : 'Winners'}
            </div>
            {state.winners.map((w) => {
              const player = state.players.find(p => p.id === w.playerId);
              return (
                <div key={w.playerId} className="flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <span className="text-white font-medium text-left block">{player?.id === myId ? 'You' : player?.name ?? w.playerId}</span>
                    <span className="text-amber-300 font-bold text-left block mt-0.5">+{w.amount} · {w.handName}</span>
                  </div>
                  {w.winningCards && w.winningCards.length > 0 && (
                    <div className="poker-winnerCards flex flex-wrap justify-end gap-1 flex-shrink-0">
                      {w.winningCards.map((card, idx) => (
                        <PokerCardDisplay
                          key={`${w.playerId}-winner-card-${idx}-${card.suit}-${card.rank}`}
                          card={card}
                          size="sm"
                          skipFlip
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
          {isHost && (
            <div className="space-y-3">
              <button
                onClick={() => sendAction({ type: 'next-hand' })}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-primary-600 text-white font-bold text-lg hover:bg-primary-500 cursor-pointer"
              >
                <Play className="w-5 h-5" />
                Deal Next Hand
              </button>
              <button
                onClick={() => sendAction({ type: 'end-session' })}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-red-600/90 text-white font-semibold hover:bg-red-500 cursor-pointer"
              >
                End Game
              </button>
            </div>
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
        </>
      ) : (
        <>
          {me && (
            <div ref={handContainerRef} className={`poker-hand ${isHandZoomed ? 'poker-hand--zoom' : ''}`}>
              <div
                className="poker-handSpread"
                style={{
                  width: `${handLayout.spreadWidth}px`,
                  height: `${handLayout.cardHeight + handLayout.hoverLift}px`,
                  transition: 'width 0.16s ease',
                }}
              >
                {visibleHandCards.map((card, i) => {
                  const isLast = i === visibleHandCards.length - 1;
                  const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

                  return (
                    <div
                      key={card ? `hole-${i}-${card.suit}-${card.rank}` : `hole-back-${i}`}
                      className="poker-handHitbox"
                      style={{
                        left: `${i * handLayout.step}px`,
                        width: `${hitboxWidth}px`,
                        height: `${handLayout.cardHeight + handLayout.hoverLift}px`,
                        zIndex: i + 1,
                      }}
                    >
                      <div
                        className="poker-handCardWrap poker-handCardWrap--active"
                        style={{
                          top: `${handLayout.hoverLift}px`,
                          width: `${handLayout.cardWidth}px`,
                          height: `${handLayout.cardHeight}px`,
                        }}
                      >
                        <PokerCardDisplay card={card} faceDown={!card} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {me && (
            <div className="poker-actionRow">
              {isMyTurn && !me.folded && !me.allIn && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'contents' }}>
                  <button type="button" onClick={() => sendAction({ type: 'fold' })} className="poker-actionButton bg-gray-700 border-black text-white hover:bg-gray-600">
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
                      <div className="poker-raiseSliderContainer">
                        <div className="poker-raiseSliderTrack">
                          <input
                            type="range"
                            min={effectiveMinRaise}
                            max={maxRaiseTotal}
                            step={state.bigBlind}
                            value={raiseAmount || effectiveMinRaise}
                            onChange={e => setRaiseAmount(Number(e.target.value))}
                            className="w-full accent-green-500"
                          />
                        </div>
                      </div>
                      <button type="button" onClick={() => setRaiseAmount(prev => Math.min(maxRaiseTotal, (prev || effectiveMinRaise) + state.bigBlind))} className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
                        <ChevronUp className="w-4 h-4 text-white" />
                      </button>
                      <button type="button" onClick={handleRaise} className="poker-actionButton poker-raiseButton bg-amber-600 border-amber-700 text-white hover:bg-amber-500">
                        Raise {raiseAmount || effectiveMinRaise}
                      </button>
                    </>
                  )}
                  {me.chips > 0 && (
                    <button type="button" onClick={() => sendAction({ type: 'raise', amount: me.betThisStreet + me.chips })} className="poker-actionButton bg-red-600 border-red-700 text-white hover:bg-red-500">
                      All In ({me.chips})
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
