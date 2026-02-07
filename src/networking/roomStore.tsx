import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import Peer from 'peerjs';
type DataConnection = ReturnType<Peer['connect']>;
import { createHostPeer, createClientPeer, connectToPeer, destroyPeer } from './peer';
import { generateRoomCode } from '../utils/roomCode';
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
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const roomRef = useRef<RoomState | null>(null);
  const gameStateRef = useRef<unknown>(null);

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
    conn.on('data', (data) => {
      const msg = data as ClientMessage;
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      switch (msg.type) {
        case 'join': {
          const newPlayer: Player = {
            id: conn.peer,
            name: msg.playerName,
            isBot: false,
            isHost: false,
            connected: true,
          };
          const updatedRoom = {
            ...currentRoom,
            players: [...currentRoom.players, newPlayer],
          };
          setRoom(updatedRoom);
          broadcastRoomState(updatedRoom);
          break;
        }
        case 'action': {
          if (currentRoom.phase === 'playing') {
            const currentGs = gameStateRef.current;
            const newGs = processGameAction(currentRoom.gameType, currentGs, msg.payload, conn.peer);
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
          const updatedRoom2 = {
            ...currentRoom,
            players: currentRoom.players.filter(p => p.id !== conn.peer),
          };
          setRoom(updatedRoom2);
          broadcastRoomState(updatedRoom2);
          connectionsRef.current.delete(conn.peer);
          break;
        }
      }
    });

    conn.on('close', () => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      const updatedRoom = {
        ...currentRoom,
        players: currentRoom.players.map(p =>
          p.id === conn.peer ? { ...p, connected: false } : p
        ),
      };
      setRoom(updatedRoom);
      broadcastRoomState(updatedRoom);
      connectionsRef.current.delete(conn.peer);
    });

    connectionsRef.current.set(conn.peer, conn);
  }, [broadcastRoomState, broadcastGameState]);

  // Create room as host
  const createRoom = useCallback(async (gameType: GameType, playerName: string): Promise<string> => {
    setError(null);
    setConnecting(true);
    try {
      const roomCode = generateRoomCode();
      const peer = await createHostPeer(roomCode);
      peerRef.current = peer;
      setMyId(peer.id);

      const hostPlayer: Player = {
        id: peer.id,
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
        hostId: peer.id,
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
  }, [handleConnection]);

  // Join room as client
  const joinRoom = useCallback(async (roomCode: string, playerName: string) => {
    setError(null);
    setConnecting(true);
    try {
      const peer = await createClientPeer();
      peerRef.current = peer;
      setMyId(peer.id);

      const conn = await connectToPeer(peer, roomCode);

      conn.on('data', (data) => {
        const msg = data as HostMessage;
        switch (msg.type) {
          case 'room-state':
            setRoom(msg.state);
            break;
          case 'game-state':
            setGameState(msg.state);
            break;
          case 'error':
            setError(msg.message);
            break;
          case 'host-disconnected':
            setError('Host disconnected');
            setRoom(null);
            setGameState(null);
            destroyPeer(peerRef.current);
            peerRef.current = null;
            break;
        }
      });

      conn.on('close', () => {
        setError('Disconnected from host');
        setRoom(null);
        setGameState(null);
      });

      connectionsRef.current.set(conn.peer, conn);

      // Send join message
      conn.send({ type: 'join', playerName } as ClientMessage);
    } catch (err) {
      setError((err as Error).message);
      destroyPeer(peerRef.current);
      peerRef.current = null;
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

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
    destroyPeer(peerRef.current);
    peerRef.current = null;
    setRoom(null);
    setGameState(null);
    setMyId('');
    setError(null);
  }, [isHost, broadcast]);

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

  // Remove bot (host only)
  const removeBot = useCallback((botId: string) => {
    if (!isHost || !room) return;
    const updatedRoom = {
      ...room,
      players: room.players.filter(p => p.id !== botId),
    };
    setRoom(updatedRoom);
    broadcastRoomState(updatedRoom);
  }, [isHost, room, broadcastRoomState]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(conn => conn.close());
      connectionsRef.current.clear();
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
        leaveRoom,
        addBot,
        removeBot,
        startGame,
        sendAction,
        playAgain,
        error,
        connecting,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}
