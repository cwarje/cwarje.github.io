import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import Peer from 'peerjs';
type DataConnection = ReturnType<Peer['connect']>;
import { createHostPeer, createClientPeer, connectToPeer, destroyPeer } from './peer';
import { generateRoomCode } from '../utils/roomCode';
import { getDeviceId } from '../utils/deviceId';
import type { RoomState, RoomContextValue, GameType, Player, ClientMessage, HostMessage } from './types';
import { createInitialGameState, processGameAction, checkGameOver, runSingleBotTurn } from '../games/gameEngine';
import type { HeartsState } from '../games/hearts/types';
import type { LiarsDiceState } from '../games/liars-dice/types';
import type { PokerState } from '../games/poker/types';

const BOT_NAMES = ['Nova', 'Pixel', 'Byte', 'Chip', 'Blaze', 'Echo', 'Neon', 'Volt'];

const RoomContext = createContext<RoomContextValue | null>(null);

export function useRoomContext(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoomContext must be inside RoomProvider');
  return ctx;
}

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [myId, setMyId] = useState<string>('');

  const peerRef = useRef<Peer | null>(null);
  // deviceId -> DataConnection (for host tracking clients)
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  // conn.peer -> deviceId (reverse lookup for incoming messages)
  const peerDeviceMapRef = useRef<Map<string, string>>(new Map());
  const roomRef = useRef<RoomState | null>(null);
  const gameStateRef = useRef<unknown>(null);
  const reconnectingRef = useRef(false);
  const roomCodeRef = useRef<string>('');
  // Host: grace period timers for disconnected clients (deviceId -> timer)
  const disconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const deviceId = getDeviceId();

  // Keep refs in sync
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { roomCodeRef.current = room?.roomCode ?? ''; }, [room?.roomCode]);
  useEffect(() => { reconnectingRef.current = reconnecting; }, [reconnecting]);

  const isHost = room?.hostId === myId;

  const myPlayer = room?.players.find(p => p.id === myId) ?? null;

  // Broadcast to all connected clients
  const broadcast = useCallback((msg: HostMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }, []);

  const broadcastRoomState = useCallback((rs: RoomState) => {
    broadcast({ type: 'room-state', state: rs });
  }, [broadcast]);

  const broadcastGameState = useCallback((gs: unknown) => {
    broadcast({ type: 'game-state', state: gs });
  }, [broadcast]);

  // Host: handle incoming connection
  const handleConnection = useCallback((conn: DataConnection) => {
    conn.on('data', (data) => {
      const msg = data as ClientMessage;
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      switch (msg.type) {
        case 'join': {
          const clientDeviceId = msg.deviceId;
          peerDeviceMapRef.current.set(conn.peer, clientDeviceId);

          const existingPlayer = currentRoom.players.find(p => p.id === clientDeviceId);

          if (existingPlayer) {
            // Reconnecting player — cancel any pending grace period disconnect timer
            const pendingTimer = disconnectTimersRef.current.get(clientDeviceId);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              disconnectTimersRef.current.delete(clientDeviceId);
            }
            // Update connection and mark connected
            connectionsRef.current.set(clientDeviceId, conn);
            const updatedRoom = {
              ...currentRoom,
              players: currentRoom.players.map(p =>
                p.id === clientDeviceId ? { ...p, connected: true, name: msg.playerName } : p
              ),
            };
            setRoom(updatedRoom);
            broadcastRoomState(updatedRoom);

            // If game is in progress, send current game state to this client
            if (currentRoom.phase !== 'lobby' && gameStateRef.current) {
              conn.send({ type: 'game-state', state: gameStateRef.current } as HostMessage);
            }
          } else {
            // New player
            const newPlayer: Player = {
              id: clientDeviceId,
              name: msg.playerName,
              isBot: false,
              isHost: false,
              connected: true,
            };
            connectionsRef.current.set(clientDeviceId, conn);
            const updatedRoom = {
              ...currentRoom,
              players: [...currentRoom.players, newPlayer],
            };
            setRoom(updatedRoom);
            broadcastRoomState(updatedRoom);
          }
          break;
        }
        case 'action': {
          if (currentRoom.phase === 'playing') {
            const senderDeviceId = peerDeviceMapRef.current.get(conn.peer);
            if (!senderDeviceId) return;
            const currentGs = gameStateRef.current;
            const newGs = processGameAction(currentRoom.gameType, currentGs, msg.payload, senderDeviceId);
            if (newGs !== currentGs) {
              setGameState(newGs);
              broadcastGameState(newGs);
              // Check for game over (poker stays in 'playing' phase for continuous play)
              if (checkGameOver(currentRoom.gameType, newGs) && currentRoom.gameType !== 'poker') {
                const finishedRoom = { ...roomRef.current!, phase: 'finished' as const };
                setRoom(finishedRoom);
                broadcastRoomState(finishedRoom);
              }
            }
          }
          break;
        }
        case 'leave': {
          const leavingDeviceId = peerDeviceMapRef.current.get(conn.peer);
          if (!leavingDeviceId) return;

          // For poker during play, process leave-table action to fold/remove from game state
          if (currentRoom.gameType === 'poker' && currentRoom.phase === 'playing' && gameStateRef.current) {
            const newGs = processGameAction('poker', gameStateRef.current, { type: 'leave-table' }, leavingDeviceId);
            if (newGs !== gameStateRef.current) {
              setGameState(newGs);
              broadcastGameState(newGs);
            }
          }

          const updatedRoom2 = {
            ...currentRoom,
            players: currentRoom.players.filter(p => p.id !== leavingDeviceId),
          };
          setRoom(updatedRoom2);
          broadcastRoomState(updatedRoom2);
          connectionsRef.current.delete(leavingDeviceId);
          peerDeviceMapRef.current.delete(conn.peer);
          break;
        }
      }
    });

    conn.on('close', () => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      const disconnectedDeviceId = peerDeviceMapRef.current.get(conn.peer);
      if (!disconnectedDeviceId) return;

      // Remove stale connection refs immediately (reconnection will re-add them)
      connectionsRef.current.delete(disconnectedDeviceId);
      peerDeviceMapRef.current.delete(conn.peer);

      // Start grace period — give client time to reconnect before marking disconnected
      const GRACE_PERIOD_MS = 15_000;
      const timer = setTimeout(() => {
        disconnectTimersRef.current.delete(disconnectedDeviceId);
        const latestRoom = roomRef.current;
        if (!latestRoom) return;
        // Only mark disconnected if the player hasn't already reconnected
        const player = latestRoom.players.find(p => p.id === disconnectedDeviceId);
        if (player && player.connected) {
          const updatedRoom = {
            ...latestRoom,
            players: latestRoom.players.map(p =>
              p.id === disconnectedDeviceId ? { ...p, connected: false } : p
            ),
          };
          setRoom(updatedRoom);
          broadcastRoomState(updatedRoom);
        }
      }, GRACE_PERIOD_MS);
      disconnectTimersRef.current.set(disconnectedDeviceId, timer);
    });

    // Don't add to connectionsRef here — wait for the 'join' message which has the deviceId
  }, [broadcastRoomState, broadcastGameState]);

  // Client: auto-reconnect on disconnect with exponential backoff
  const attemptReconnect = useCallback(async () => {
    if (reconnectingRef.current) return;
    const currentRoomCode = roomCodeRef.current;
    if (!currentRoomCode) return;

    reconnectingRef.current = true;
    setReconnecting(true);

    const storedName = localStorage.getItem('playerName') || 'Player';
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [1000, 2000, 4000];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));

      // Abort if user left the room while waiting
      if (!reconnectingRef.current) return;

      try {
        // Clean up old peer
        destroyPeer(peerRef.current);
        peerRef.current = null;
        connectionsRef.current.clear();
        peerDeviceMapRef.current.clear();

        const peer = await createClientPeer();
        if (!reconnectingRef.current) { destroyPeer(peer); return; }
        peerRef.current = peer;

        const conn = await connectToPeer(peer, currentRoomCode);
        if (!reconnectingRef.current) { destroyPeer(peer); return; }

        // Wait for room-state to confirm reconnection succeeded
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
          let done = false;

          conn.on('data', (data) => {
            const msg = data as HostMessage;
            switch (msg.type) {
              case 'room-state':
                setRoom(msg.state);
                if (!done) { done = true; clearTimeout(timeout); resolve(); }
                break;
              case 'game-state':
                setGameState(msg.state);
                break;
              case 'error':
                if (!done) { done = true; clearTimeout(timeout); reject(new Error(msg.message)); }
                break;
              case 'host-disconnected':
                roomRef.current = null;
                setError('Host disconnected');
                setRoom(null);
                setGameState(null);
                connectionsRef.current.clear();
                peerDeviceMapRef.current.clear();
                destroyPeer(peerRef.current);
                peerRef.current = null;
                if (!done) { done = true; clearTimeout(timeout); reject(new Error('Host disconnected')); }
                break;
            }
          });

          conn.on('close', () => {
            if (!done) {
              done = true;
              clearTimeout(timeout);
              reject(new Error('Connection closed'));
              return;
            }
            // Disconnected again after successful reconnection — retry
            if (roomRef.current && !reconnectingRef.current) {
              attemptReconnectRef.current();
            } else if (!reconnectingRef.current) {
              setError('Disconnected from host');
              setRoom(null);
              setGameState(null);
            }
          });

          connectionsRef.current.set(conn.peer, conn);
          conn.send({ type: 'join', playerName: storedName, deviceId } as ClientMessage);
        });

        // Reconnection succeeded
        reconnectingRef.current = false;
        setReconnecting(false);
        return;
      } catch {
        // If host disconnected, don't retry
        if (!roomRef.current) {
          reconnectingRef.current = false;
          setReconnecting(false);
          return;
        }
        // Otherwise continue to next attempt
      }
    }

    // All attempts failed
    reconnectingRef.current = false;
    setReconnecting(false);
    setError('Lost connection to host');
    setRoom(null);
    setGameState(null);
    destroyPeer(peerRef.current);
    peerRef.current = null;
  }, [deviceId]);

  const attemptReconnectRef = useRef(attemptReconnect);
  useEffect(() => { attemptReconnectRef.current = attemptReconnect; }, [attemptReconnect]);

  // Create room as host
  const createRoom = useCallback(async (gameType: GameType, playerName: string): Promise<string> => {
    setError(null);
    setConnecting(true);
    try {
      const roomCode = generateRoomCode();
      const peer = await createHostPeer(roomCode);
      peerRef.current = peer;
      setMyId(deviceId);

      const hostPlayer: Player = {
        id: deviceId,
        name: playerName,
        isBot: false,
        isHost: true,
        connected: true,
      };

      const newRoom: RoomState = {
        roomCode,
        gameType,
        players: [hostPlayer],
        phase: 'lobby',
        hostId: deviceId,
      };

      setRoom(newRoom);
      peer.on('connection', handleConnection);

      peer.on('disconnected', () => {
        peer.reconnect();
      });

      return roomCode;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [handleConnection, deviceId]);

  // Shared logic for joining a room (used by joinRoom and rejoinRoom)
  const joinRoomInternal = useCallback(async (roomCode: string, playerName: string) => {
    setError(null);
    setConnecting(true);
    try {
      // If already connected, clean up first
      if (peerRef.current) {
        connectionsRef.current.forEach(conn => conn.close());
        connectionsRef.current.clear();
        peerDeviceMapRef.current.clear();
        destroyPeer(peerRef.current);
        peerRef.current = null;
      }

      const peer = await createClientPeer();
      peerRef.current = peer;
      setMyId(deviceId);

      const conn = await connectToPeer(peer, roomCode);

      // Wait for the first room-state from the host before resolving,
      // so that room is populated before we navigate to the lobby page.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for room state')), 10000);
        let resolved = false;

        conn.on('data', (data) => {
          const msg = data as HostMessage;
          switch (msg.type) {
            case 'room-state':
              setRoom(msg.state);
              if (!resolved) { resolved = true; clearTimeout(timeout); resolve(); }
              break;
            case 'game-state':
              setGameState(msg.state);
              break;
            case 'error':
              setError(msg.message);
              if (!resolved) { resolved = true; clearTimeout(timeout); reject(new Error(msg.message)); }
              break;
            case 'host-disconnected':
              roomRef.current = null; // Update ref immediately so close handler won't attempt reconnect
              setError('Host disconnected');
              setRoom(null);
              setGameState(null);
              connectionsRef.current.clear();
              peerDeviceMapRef.current.clear();
              destroyPeer(peerRef.current);
              peerRef.current = null;
              if (!resolved) { resolved = true; clearTimeout(timeout); reject(new Error('Host disconnected')); }
              break;
          }
        });

        conn.on('close', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(new Error('Disconnected from host'));
            return;
          }
          // After initial join, attempt auto-reconnection instead of instant disconnect
          if (roomRef.current && !reconnectingRef.current) {
            attemptReconnectRef.current();
          } else if (!reconnectingRef.current) {
            setError('Disconnected from host');
            setRoom(null);
            setGameState(null);
          }
        });

        connectionsRef.current.set(conn.peer, conn);
        conn.send({ type: 'join', playerName, deviceId } as ClientMessage);
      });
    } catch (err) {
      setError((err as Error).message);
      destroyPeer(peerRef.current);
      peerRef.current = null;
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [deviceId]);

  // Join room as client (called from Home page with user-provided name)
  const joinRoom = useCallback(async (roomCode: string, playerName: string) => {
    await joinRoomInternal(roomCode, playerName);
  }, [joinRoomInternal]);

  // Rejoin room (called automatically from Lobby/GamePage with stored name)
  const rejoinRoom = useCallback(async (roomCode: string) => {
    const storedName = localStorage.getItem('playerName') || `Player${Math.floor(Math.random() * 9999)}`;
    await joinRoomInternal(roomCode, storedName);
  }, [joinRoomInternal]);

  // Leave room
  const leaveRoom = useCallback(() => {
    // Stop any in-progress reconnection
    reconnectingRef.current = false;
    setReconnecting(false);

    if (isHost) {
      broadcast({ type: 'host-disconnected' });
    } else {
      // Send leave message to host
      connectionsRef.current.forEach((conn) => {
        if (conn.open) {
          conn.send({ type: 'leave' } as ClientMessage);
        }
      });
    }
    connectionsRef.current.clear();
    peerDeviceMapRef.current.clear();
    destroyPeer(peerRef.current);
    peerRef.current = null;
    setRoom(null);
    setGameState(null);
    setMyId('');
    setError(null);
  }, [isHost, broadcast]);

  // Remove player (host only — works for bots and disconnected humans)
  const removePlayer = useCallback((playerId: string) => {
    if (!isHost || !room) return;
    const updatedRoom = {
      ...room,
      players: room.players.filter(p => p.id !== playerId),
    };
    setRoom(updatedRoom);
    broadcastRoomState(updatedRoom);
    // Clean up connection if it exists
    connectionsRef.current.delete(playerId);
    // Clean up reverse map
    for (const [peerKey, devId] of peerDeviceMapRef.current.entries()) {
      if (devId === playerId) {
        peerDeviceMapRef.current.delete(peerKey);
        break;
      }
    }
  }, [isHost, room, broadcastRoomState]);

  // Add bot (host only)
  const addBot = useCallback(() => {
    if (!isHost || !room) return;
    const usedNames = room.players.map(p => p.name);
    const availableNames = BOT_NAMES.filter(n => !usedNames.includes(n));
    const botName = availableNames[0] || `Bot ${room.players.length}`;
    const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const bot: Player = {
      id: botId,
      name: botName,
      isBot: true,
      isHost: false,
      connected: true,
    };

    const updatedRoom = { ...room, players: [...room.players, bot] };
    setRoom(updatedRoom);
    broadcastRoomState(updatedRoom);
  }, [isHost, room, broadcastRoomState]);

  // Remove bot (host only) — kept for backward compatibility, delegates to removePlayer
  const removeBot = useCallback((botId: string) => {
    removePlayer(botId);
  }, [removePlayer]);

  // Start game (host only)
  const startGame = useCallback(() => {
    if (!isHost || !room) return;
    const gs = createInitialGameState(room.gameType, room.players);
    const startedRoom = { ...room, phase: 'playing' as const };
    setRoom(startedRoom);
    setGameState(gs);
    broadcastRoomState(startedRoom);
    broadcastGameState(gs);
  }, [isHost, room, broadcastRoomState, broadcastGameState]);

  // Send action (client)
  const sendAction = useCallback((payload: unknown) => {
    if (isHost) {
      // Host processes directly
      const currentRoom = roomRef.current;
      if (!currentRoom || currentRoom.phase !== 'playing') return;
      const currentGs = gameStateRef.current;
      const newGs = processGameAction(currentRoom.gameType, currentGs, payload, myId);
      if (newGs !== currentGs) {
        setGameState(newGs);
        broadcastGameState(newGs);
        // Poker stays in 'playing' phase for continuous play
        if (checkGameOver(currentRoom.gameType, newGs) && currentRoom.gameType !== 'poker') {
          const finishedRoom = { ...currentRoom, phase: 'finished' as const };
          setRoom(finishedRoom);
          broadcastRoomState(finishedRoom);
        }
      }
    } else {
      connectionsRef.current.forEach((conn) => {
        if (conn.open) {
          conn.send({ type: 'action', payload } as ClientMessage);
        }
      });
    }
  }, [isHost, myId, broadcastGameState, broadcastRoomState]);

  // Play again (host only)
  const playAgain = useCallback(() => {
    if (!isHost || !room) return;
    const gs = createInitialGameState(room.gameType, room.players);
    const resetRoom = { ...room, phase: 'playing' as const };
    setRoom(resetRoom);
    setGameState(gs);
    broadcastRoomState(resetRoom);
    broadcastGameState(gs);
  }, [isHost, room, broadcastRoomState, broadcastGameState]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  // --- Bot turn scheduling (host only, Hearts & Liar's Dice & Poker) ---
  const BOT_PLAY_DELAY = 800;   // ms between each bot card play
  const TRICK_DISPLAY_DELAY = 2000; // ms to show completed trick before collecting
  const LIARS_DICE_BOT_DELAY = 1200; // ms between bot actions in Liar's Dice
  const LIARS_DICE_REVEAL_DELAY = 2500; // ms to show reveal before revolver
  const LIARS_DICE_TRIGGER_DELAY = 1500; // ms before bot pulls trigger
  const LIARS_DICE_NEXT_ROUND_DELAY = 2000; // ms before starting next round
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timer when state changes
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }

    if (!isHost || !room || room.phase !== 'playing' || !gameState) return;

    // ── Hearts bot scheduling ──
    if (room.gameType === 'hearts') {
      const hs = gameState as HeartsState;
      if (hs.gameOver) return;

      // If trick is complete (trickWinner set), schedule resolve-trick after delay
      if (hs.trickWinner) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as HeartsState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || !currentGs.trickWinner) return;

          const resolved = processGameAction('hearts', currentGs, { type: 'resolve-trick' }, '');
          if (resolved !== currentGs) {
            setGameState(resolved);
            broadcastGameState(resolved);
            if (checkGameOver('hearts', resolved)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, TRICK_DISPLAY_DELAY);
        return;
      }

      // During passing phase, run bot selections (bots pass simultaneously, no visible delay needed)
      if (hs.phase === 'passing') {
        const botsNeedToAct = hs.players.some(p => p.isBot && (!hs.passSelections[p.id] || hs.passSelections[p.id].length < 3 || !hs.passConfirmed[p.id]));
        if (botsNeedToAct) {
          botTimerRef.current = setTimeout(() => {
            const currentGs = gameStateRef.current;
            const currentRoom = roomRef.current;
            if (!currentGs || !currentRoom) return;

            const next = runSingleBotTurn('hearts', currentGs);
            if (next !== currentGs) {
              setGameState(next);
              broadcastGameState(next);
            }
          }, 100); // Short delay for passing — it's simultaneous and hidden
        }
        return;
      }

      // During playing phase, schedule bot card play if it's a bot's turn
      if (hs.phase === 'playing') {
        const currentPlayer = hs.players[hs.currentPlayerIndex];
        if (currentPlayer && currentPlayer.isBot) {
          botTimerRef.current = setTimeout(() => {
            const currentGs = gameStateRef.current;
            const currentRoom = roomRef.current;
            if (!currentGs || !currentRoom) return;

            const next = runSingleBotTurn('hearts', currentGs);
            if (next !== currentGs) {
              setGameState(next);
              broadcastGameState(next);
              if (checkGameOver('hearts', next)) {
                const finishedRoom = { ...currentRoom, phase: 'finished' as const };
                setRoom(finishedRoom);
                broadcastRoomState(finishedRoom);
              }
            }
          }, BOT_PLAY_DELAY);
        }
      }
      return;
    }

    // ── Liar's Dice bot scheduling ──
    if (room.gameType === 'liars-dice') {
      const lds = gameState as LiarsDiceState;
      if (lds.phase === 'gameOver') return;

      const runBotStep = (delay: number) => {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('liars-dice', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('liars-dice', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, delay);
      };

      // Rolling phase — bot starter auto-rolls
      if (lds.phase === 'rolling') {
        const starter = lds.players[lds.roundStarterIndex];
        if (starter && starter.isBot) {
          runBotStep(500);
        }
        return;
      }

      // Bidding phase — bot makes bid, calls liar, or spot on
      if (lds.phase === 'bidding') {
        const currentPlayer = lds.players[lds.currentPlayerIndex];
        if (currentPlayer && currentPlayer.isBot && currentPlayer.alive) {
          runBotStep(LIARS_DICE_BOT_DELAY);
        }
        return;
      }

      // Revealing phase — auto-transition to revolver after delay
      if (lds.phase === 'revealing') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as LiarsDiceState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'revealing') return;

          // Transition to revolver phase
          const next = { ...currentGs, phase: 'revolver' as const };
          setGameState(next);
          broadcastGameState(next);
        }, LIARS_DICE_REVEAL_DELAY);
        return;
      }

      // Revolver phase — bots pull trigger, then advance to next round
      if (lds.phase === 'revolver' && lds.roundResult) {
        // Check if a bot needs to pull the trigger
        const botNeedsTrigger = lds.roundResult.triggerPlayerIds.find(pid => {
          if (lds.roundResult!.pulledTrigger[pid]) return false;
          const player = lds.players.find(p => p.id === pid);
          return player && player.isBot;
        });

        if (botNeedsTrigger) {
          runBotStep(LIARS_DICE_TRIGGER_DELAY);
          return;
        }

        // All triggers pulled — advance to next round
        const allPulled = lds.roundResult.triggerPlayerIds.every(
          id => lds.roundResult!.pulledTrigger[id]
        );
        if (allPulled) {
          runBotStep(LIARS_DICE_NEXT_ROUND_DELAY);
        }
      }
    }

    // ── Poker bot scheduling ──
    if (room.gameType === 'poker') {
      const ps = gameState as PokerState;
      if (ps.gameOver || ps.street === 'showdown') return;

      const currentPlayer = ps.players[ps.currentPlayerIndex];
      if (currentPlayer && currentPlayer.isBot && !currentPlayer.folded && !currentPlayer.allIn) {
        const POKER_BOT_DELAY = 1000;
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('poker', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            // Poker stays in 'playing' phase — continuous play handled by PokerBoard
          }
        }, POKER_BOT_DELAY);
      }
    }
  }, [gameState, isHost, room, broadcastGameState, broadcastRoomState]);

  // Cleanup on unmount
  useEffect(() => {
    const connections = connectionsRef.current;
    const peerDeviceMap = peerDeviceMapRef.current;
    const disconnectTimers = disconnectTimersRef.current;
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      disconnectTimers.forEach(timer => clearTimeout(timer));
      disconnectTimers.clear();
      reconnectingRef.current = false;
      connections.forEach(conn => conn.close());
      connections.clear();
      peerDeviceMap.clear();
      destroyPeer(peerRef.current);
    };
  }, []);

  return (
    <RoomContext.Provider
      value={{
        room,
        gameState,
        isHost,
        myId,
        myPlayer,
        createRoom,
        joinRoom,
        rejoinRoom,
        leaveRoom,
        removePlayer,
        addBot,
        removeBot,
        startGame,
        sendAction,
        playAgain,
        error,
        clearError,
        connecting,
        reconnecting,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}
