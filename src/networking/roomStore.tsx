import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import Peer from 'peerjs';
type DataConnection = ReturnType<Peer['connect']>;
import { createHostPeer, createClientPeer, connectToPeer, destroyPeer } from './peer';
import { generateRoomCode } from '../utils/roomCode';
import { getDeviceId } from '../utils/deviceId';
import type { RoomState, RoomContextValue, GameType, Player, ClientMessage, HostMessage } from './types';
import { createInitialGameState, processGameAction, checkGameOver } from '../games/gameEngine';

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
  const [myId, setMyId] = useState<string>('');

  const peerRef = useRef<Peer | null>(null);
  // deviceId -> DataConnection (for host tracking clients)
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  // conn.peer -> deviceId (reverse lookup for incoming messages)
  const peerDeviceMapRef = useRef<Map<string, string>>(new Map());
  const roomRef = useRef<RoomState | null>(null);
  const gameStateRef = useRef<unknown>(null);

  const deviceId = getDeviceId();

  // Keep refs in sync
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

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
    // #region agent log
    const _hdbg = (msg: string, data?: Record<string, unknown>) => {
      console.log('[DEBUG]', JSON.stringify({ location: 'roomStore.tsx:handleConnection', message: msg, data, timestamp: Date.now() }));
    };
    _hdbg('Incoming connection from peer', { connPeer: conn.peer, connOpen: conn.open, hypothesisId: 'A,D' });
    // #endregion
    conn.on('data', (data) => {
      const msg = data as ClientMessage;
      // #region agent log
      _hdbg('Host received data', { msgType: msg.type, connPeer: conn.peer, hypothesisId: 'D' });
      // #endregion
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      switch (msg.type) {
        case 'join': {
          const clientDeviceId = msg.deviceId;
          peerDeviceMapRef.current.set(conn.peer, clientDeviceId);

          const existingPlayer = currentRoom.players.find(p => p.id === clientDeviceId);

          if (existingPlayer) {
            // Reconnecting player — update connection and mark connected
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
              // Check for game over
              if (checkGameOver(currentRoom.gameType, newGs)) {
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
      const updatedRoom = {
        ...currentRoom,
        players: currentRoom.players.map(p =>
          p.id === disconnectedDeviceId ? { ...p, connected: false } : p
        ),
      };
      setRoom(updatedRoom);
      broadcastRoomState(updatedRoom);
      connectionsRef.current.delete(disconnectedDeviceId);
      peerDeviceMapRef.current.delete(conn.peer);
    });

    // Don't add to connectionsRef here — wait for the 'join' message which has the deviceId
  }, [broadcastRoomState, broadcastGameState]);

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
    // #region agent log
    const _dbg = (msg: string, data?: Record<string, unknown>) => {
      console.log('[DEBUG]', JSON.stringify({ location: 'roomStore.tsx:joinRoomInternal', message: msg, data, timestamp: Date.now() }));
    };
    const joinStart = Date.now();
    _dbg('joinRoomInternal START', { roomCode, playerName, deviceId, hypothesisId: 'C,D' });
    // #endregion
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
      // #region agent log
      _dbg('Client peer created', { peerId: peer.id, elapsed: Date.now() - joinStart, hypothesisId: 'B' });
      // #endregion
      peerRef.current = peer;
      setMyId(deviceId);

      const conn = await connectToPeer(peer, roomCode);
      // #region agent log
      _dbg('connectToPeer resolved', { connPeer: conn.peer, connOpen: conn.open, elapsed: Date.now() - joinStart, hypothesisId: 'A' });
      // #endregion

      // Wait for the first room-state from the host before resolving,
      // so that room is populated before we navigate to the lobby page.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          // #region agent log
          _dbg('TIMEOUT waiting for room-state', { elapsed: Date.now() - joinStart, hypothesisId: 'D' });
          // #endregion
          reject(new Error('Timeout waiting for room state'));
        }, 10000);
        let resolved = false;

        conn.on('data', (data) => {
          const msg = data as HostMessage;
          // #region agent log
          _dbg('Received data from host', { msgType: msg.type, elapsed: Date.now() - joinStart, hypothesisId: 'D' });
          // #endregion
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
          // #region agent log
          _dbg('Connection CLOSED by host', { elapsed: Date.now() - joinStart, hypothesisId: 'D' });
          // #endregion
          setError('Disconnected from host');
          setRoom(null);
          setGameState(null);
          if (!resolved) { resolved = true; clearTimeout(timeout); reject(new Error('Disconnected from host')); }
        });

        connectionsRef.current.set(conn.peer, conn);
        // #region agent log
        _dbg('Sending join message', { connPeer: conn.peer, playerName, deviceId, hypothesisId: 'D' });
        // #endregion
        conn.send({ type: 'join', playerName, deviceId } as ClientMessage);
      });
      // #region agent log
      _dbg('joinRoomInternal SUCCESS', { elapsed: Date.now() - joinStart });
      // #endregion
    } catch (err) {
      // #region agent log
      _dbg('joinRoomInternal FAILED', { error: (err as Error).message, elapsed: Date.now() - joinStart });
      // #endregion
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
        if (checkGameOver(currentRoom.gameType, newGs)) {
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

  // Cleanup on unmount
  useEffect(() => {
    const connections = connectionsRef.current;
    const peerDeviceMap = peerDeviceMapRef.current;
    return () => {
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
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}
