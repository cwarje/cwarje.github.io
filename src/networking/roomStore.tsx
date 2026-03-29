import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import Peer from 'peerjs';
type DataConnection = ReturnType<Peer['connect']>;
import { createHostPeer, createClientPeer, connectToPeer, destroyPeer } from './peer';
import { generateRoomCode } from '../utils/roomCode';
import { getDeviceId } from '../utils/deviceId';
import type { RoomState, RoomContextValue, GameType, Player, ClientMessage, HostMessage, PlayerColor, GameStartOptions } from './types';
import { DEFAULT_PLAYER_COLOR, normalizePlayerColor } from './playerColors';
import { createInitialGameState, processGameAction, checkGameOver, runSingleBotTurn, getGameWinners } from '../games/gameEngine';
import type { HeartsState } from '../games/hearts/types';
import type { LiarsDiceState } from '../games/liars-dice/types';
import type { PokerState } from '../games/poker/types';
import type { BattleshipState } from '../games/battleship/types';
import type { YahtzeeState } from '../games/yahtzee/types';
import type { FarkleState } from '../games/farkle/types';
import type { UpRiverState } from '../games/up-and-down-the-river/types';
import { isMobilizationDevJumpAction, type MobilizationState } from '../games/mobilization/types';
import type { TwelveState } from '../games/twelve/types';
import type { SettlerState } from '../games/settler/types';
import {
  applySettlerIdleTimeout,
  reconcileSettlerTurnDeadlineAfterAction,
  getSettlerIdleActorId,
} from '../games/settler/logic';
import type { CrossCribState } from '../games/cross-crib/types';
import { cribCardsToSelect } from '../games/cross-crib/types';
import type { CasinoState } from '../games/casino/types';
import { willYahtzeeBotScore } from '../games/yahtzee/logic';
import { shouldBotBank } from '../games/farkle/logic';
import { GAME_REGISTRY } from '../games/registry';

export const BOT_NAMES = ['Pippi', 'Maja', 'Stina', 'Kajsa', 'Lotta', 'Ebba', 'Ida', 'Tova', 'Sigge', 'Nisse', 'Kalle', 'Hasse', 'Kekke', 'Challe', 'Bönne', 'Migge', 'Sune'];

function pickRandom<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

function createBots(count: number, existingPlayers: Player[]): Player[] {
  const usedNames = existingPlayers.map(p => p.name);
  const bots: Player[] = [];
  for (let i = 0; i < count; i++) {
    const available = BOT_NAMES.filter(n => !usedNames.includes(n) && !bots.some(b => b.name === n));
    const name = pickRandom(available) ?? `Bot ${existingPlayers.length + i}`;
    bots.push({
      id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      color: DEFAULT_PLAYER_COLOR,
      isBot: true,
      isHost: false,
      connected: true,
    });
  }
  return bots;
}

function isPokerHostControlAction(payload: unknown): payload is { type: 'next-hand' | 'end-session' } {
  if (typeof payload !== 'object' || payload === null) return false;
  const actionType = (payload as { type?: unknown }).type;
  return actionType === 'next-hand' || actionType === 'end-session';
}

function isCasinoStartNextRoundAction(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  return (payload as { type?: unknown }).type === 'start-next-round';
}

function applyProfileToGameState(
  gameType: GameType,
  state: unknown,
  playerId: string,
  playerName: string,
  playerColor: PlayerColor
): unknown {
  if (!state) return state;

  switch (gameType) {
    case 'yahtzee': {
      const current = state as YahtzeeState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'hearts': {
      const current = state as HeartsState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'farkle': {
      const current = state as FarkleState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'up-and-down-the-river': {
      const current = state as UpRiverState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'mobilization': {
      const current = state as MobilizationState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'battleship': {
      const current = state as BattleshipState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName) return player;
        changed = true;
        return { ...player, name: playerName };
      });
      return changed ? { ...current, players } : current;
    }
    case 'liars-dice': {
      const current = state as LiarsDiceState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName) return player;
        changed = true;
        return { ...player, name: playerName };
      });
      return changed ? { ...current, players } : current;
    }
    case 'poker': {
      const current = state as PokerState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'twelve': {
      const current = state as TwelveState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'settler': {
      const current = state as SettlerState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'cross-crib': {
      const current = state as CrossCribState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    case 'casino': {
      const current = state as CasinoState;
      let changed = false;
      const players = current.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.name === playerName && player.color === playerColor) return player;
        changed = true;
        return { ...player, name: playerName, color: playerColor };
      });
      return changed ? { ...current, players } : current;
    }
    default:
      return state;
  }
}

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
                p.id === clientDeviceId ? { ...p, connected: true, name: msg.playerName, color: msg.playerColor } : p
              ),
            };
            setRoom(updatedRoom);
            broadcastRoomState(updatedRoom);

            const currentGs = gameStateRef.current;
            const updatedGs =
              currentRoom.phase !== 'lobby' && currentRoom.gameType && currentGs
                ? applyProfileToGameState(currentRoom.gameType, currentGs, clientDeviceId, msg.playerName, msg.playerColor)
                : currentGs;
            if (updatedGs && updatedGs !== currentGs) {
              setGameState(updatedGs);
              broadcastGameState(updatedGs);
            }

            // If game is in progress, send current game state to this client
            if (currentRoom.phase !== 'lobby' && updatedGs) {
              conn.send({ type: 'game-state', state: updatedGs } as HostMessage);
            }
          } else {
            // New player
            const newPlayer: Player = {
              id: clientDeviceId,
              name: msg.playerName,
              color: msg.playerColor,
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
        case 'update-profile': {
          const senderDeviceId = peerDeviceMapRef.current.get(conn.peer);
          if (!senderDeviceId || senderDeviceId !== msg.deviceId) return;

          const updatedRoom = {
            ...currentRoom,
            players: currentRoom.players.map((player) =>
              player.id === senderDeviceId ? { ...player, name: msg.playerName, color: msg.playerColor } : player
            ),
          };
          setRoom(updatedRoom);
          broadcastRoomState(updatedRoom);

          const currentGs = gameStateRef.current;
          const updatedGs =
            currentRoom.phase !== 'lobby' && currentRoom.gameType && currentGs
              ? applyProfileToGameState(currentRoom.gameType, currentGs, senderDeviceId, msg.playerName, msg.playerColor)
              : currentGs;
          if (updatedGs && updatedGs !== currentGs) {
            setGameState(updatedGs);
            broadcastGameState(updatedGs);
          }
          break;
        }
        case 'action': {
          if (!currentRoom.gameType) break;
          const allowDevMobilizationJump =
            import.meta.env.DEV &&
            currentRoom.gameType === 'mobilization' &&
            isMobilizationDevJumpAction(msg.payload);
          if (
            currentRoom.phase !== 'playing' &&
            !(allowDevMobilizationJump && currentRoom.phase === 'finished')
          ) {
            break;
          }
          const mappedDeviceId = peerDeviceMapRef.current.get(conn.peer);
          const claimedDeviceId = typeof msg.deviceId === 'string' ? msg.deviceId : null;
          const senderDeviceId = mappedDeviceId ?? claimedDeviceId;
          if (!senderDeviceId) return;
          if (mappedDeviceId && claimedDeviceId && mappedDeviceId !== claimedDeviceId) return;
          if (!mappedDeviceId) {
            const isKnownPlayer = currentRoom.players.some(player => player.id === senderDeviceId);
            if (!isKnownPlayer) return;
            peerDeviceMapRef.current.set(conn.peer, senderDeviceId);
          }
          if (
            currentRoom.gameType === 'poker'
            && isPokerHostControlAction(msg.payload)
            && senderDeviceId !== currentRoom.hostId
          ) {
            return;
          }
          if (
            currentRoom.gameType === 'casino'
            && isCasinoStartNextRoundAction(msg.payload)
            && senderDeviceId !== currentRoom.hostId
          ) {
            return;
          }
          const currentGs = gameStateRef.current;
          const wasFinished = currentRoom.phase === 'finished';
          const newGs = processGameAction(currentRoom.gameType, currentGs, msg.payload, senderDeviceId);
          if (newGs !== currentGs) {
            setGameState(newGs);
            broadcastGameState(newGs);
            let roomForPhase = roomRef.current ?? currentRoom;
            if (wasFinished && allowDevMobilizationJump) {
              roomForPhase = { ...roomForPhase, phase: 'playing' as const };
              setRoom(roomForPhase);
              broadcastRoomState(roomForPhase);
            }
            // Check for game over (poker stays in 'playing' phase for continuous play)
            if (checkGameOver(currentRoom.gameType, newGs) && currentRoom.gameType !== 'poker') {
              const finishedRoom = { ...roomForPhase, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
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
    const storedColor = normalizePlayerColor(localStorage.getItem('playerColor'));
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
          conn.send({ type: 'join', playerName: storedName, playerColor: storedColor, deviceId } as ClientMessage);
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

  // Create lobby as host (no game type — game is chosen when starting)
  const createLobby = useCallback(async (playerName: string, playerColor: PlayerColor): Promise<string> => {
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

      const roomCode = generateRoomCode();
      const peer = await createHostPeer(roomCode);

      // If another operation (e.g. joinRoom) started while we were awaiting,
      // it will have set peerRef.current to its own peer. Abort this lobby creation.
      if (peerRef.current !== null) {
        destroyPeer(peer);
        return roomCodeRef.current || roomCode;
      }

      peerRef.current = peer;
      setMyId(deviceId);

      const hostPlayer: Player = {
        id: deviceId,
        name: playerName,
        color: playerColor,
        isBot: false,
        isHost: true,
        connected: true,
      };

      const newRoom: RoomState = {
        roomCode,
        gameType: null,
        players: [hostPlayer],
        phase: 'lobby',
        hostId: deviceId,
        wins: {},
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
  const joinRoomInternal = useCallback(async (roomCode: string, playerName: string, playerColor: PlayerColor) => {
    setError(null);
    setConnecting(true);
    try {
      // If already connected, silently close the old connection first
      if (peerRef.current) {
        const currentRoom = roomRef.current;

        // Null out refs immediately so that conn.on('close') handlers from the
        // old connection won't attempt auto-reconnect to the old room.
        roomRef.current = null;
        roomCodeRef.current = '';

        if (currentRoom && currentRoom.hostId === deviceId) {
          // We're the host — notify clients that we're shutting down
          connectionsRef.current.forEach((conn) => {
            if (conn.open) {
              conn.send({ type: 'host-disconnected' } as HostMessage);
            }
          });
        } else {
          // We're a client — notify host that we're leaving
          connectionsRef.current.forEach((conn) => {
            if (conn.open) {
              conn.send({ type: 'leave' } as ClientMessage);
            }
          });
        }
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
        conn.send({ type: 'join', playerName, playerColor, deviceId } as ClientMessage);
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
  const joinRoom = useCallback(async (roomCode: string, playerName: string, playerColor: PlayerColor) => {
    await joinRoomInternal(roomCode, playerName, playerColor);
  }, [joinRoomInternal]);

  // Rejoin room (called automatically from Lobby/GamePage with stored name)
  const rejoinRoom = useCallback(async (roomCode: string) => {
    const storedName = localStorage.getItem('playerName') || `Player${Math.floor(Math.random() * 9999)}`;
    const storedColor = normalizePlayerColor(localStorage.getItem('playerColor'));
    await joinRoomInternal(roomCode, storedName, storedColor);
  }, [joinRoomInternal]);

  const updateProfile = useCallback((playerName: string, playerColor: PlayerColor) => {
    const name = playerName.trim() || `Player${Math.floor(Math.random() * 9999)}`;
    const color = normalizePlayerColor(playerColor);
    localStorage.setItem('playerName', name);
    localStorage.setItem('playerColor', color);

    const currentRoom = roomRef.current;
    if (!currentRoom || !myId) return;

    const player = currentRoom.players.find((p) => p.id === myId);
    if (!player || player.isBot) return;
    if (player.name === name && player.color === color) return;

    const updatedRoom = {
      ...currentRoom,
      players: currentRoom.players.map((p) =>
        p.id === myId ? { ...p, name, color } : p
      ),
    };
    setRoom(updatedRoom);

    const currentGs = gameStateRef.current;
    const updatedGs =
      currentRoom.phase !== 'lobby' && currentRoom.gameType && currentGs
        ? applyProfileToGameState(currentRoom.gameType, currentGs, myId, name, color)
        : currentGs;
    if (updatedGs && updatedGs !== currentGs) {
      setGameState(updatedGs);
      if (isHost) {
        broadcastGameState(updatedGs);
      }
    }

    if (isHost) {
      broadcastRoomState(updatedRoom);
      return;
    }

    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send({ type: 'update-profile', playerName: name, playerColor: color, deviceId: myId } as ClientMessage);
      }
    });
  }, [myId, isHost, broadcastGameState, broadcastRoomState]);

  // Leave room
  const leaveRoom = useCallback(() => {
    // Stop any in-progress reconnection
    reconnectingRef.current = false;
    setReconnecting(false);

    // Update refs immediately so that conn.on('close') handlers
    // (which fire synchronously when we destroy the peer below)
    // won't mistake this intentional leave for an unintentional disconnect
    // and attempt to auto-reconnect.
    roomRef.current = null;
    roomCodeRef.current = '';

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
    const botName = pickRandom(availableNames) ?? `Bot ${room.players.length}`;
    const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const bot: Player = {
      id: botId,
      name: botName,
      color: DEFAULT_PLAYER_COLOR,
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

  // Start game (host only) — gameType is chosen at start time
  const startGame = useCallback((gameType: GameType, options?: GameStartOptions) => {
    if (!isHost || !room) return;
    const gameDef = GAME_REGISTRY[gameType];
    let players = room.players;

    if (gameDef.minPlayers === gameDef.maxPlayers) {
      // Fixed-count game: auto-fill with bots
      if (players.length > gameDef.maxPlayers) return;
      if (players.length < gameDef.maxPlayers) {
        players = [...players, ...createBots(gameDef.maxPlayers - players.length, players)];
      }
    } else if (options?.botCount && options.botCount > 0) {
      const maxBots = gameDef.maxPlayers - players.length;
      const botsToAdd = Math.min(options.botCount, maxBots);
      if (botsToAdd > 0) {
        players = [...players, ...createBots(botsToAdd, players)];
      }
    }

    const totalPlayers = players.length;
    if (totalPlayers < 1 || totalPlayers > gameDef.maxPlayers) return;

    const allowed = gameDef.allowedPlayerCounts;
    if (allowed) {
      if (!allowed.includes(totalPlayers)) return;
    } else if (gameDef.minPlayers === gameDef.maxPlayers) {
      if (totalPlayers !== gameDef.maxPlayers) return;
    } else if (totalPlayers < gameDef.minPlayers) {
      return;
    }

    const gs = createInitialGameState(gameType, players, options);
    const startedRoom = { ...room, players, gameType, phase: 'playing' as const };
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
      if (!currentRoom || !currentRoom.gameType) return;
      const allowDevMobilizationJump =
        import.meta.env.DEV &&
        currentRoom.gameType === 'mobilization' &&
        isMobilizationDevJumpAction(payload);
      if (
        currentRoom.phase !== 'playing' &&
        !(allowDevMobilizationJump && currentRoom.phase === 'finished')
      ) {
        return;
      }
      if (
        currentRoom.gameType === 'poker'
        && isPokerHostControlAction(payload)
        && myId !== currentRoom.hostId
      ) {
        return;
      }
      if (
        currentRoom.gameType === 'casino'
        && isCasinoStartNextRoundAction(payload)
        && myId !== currentRoom.hostId
      ) {
        return;
      }
      const currentGs = gameStateRef.current;
      const wasFinished = currentRoom.phase === 'finished';
      const newGs = processGameAction(currentRoom.gameType, currentGs, payload, myId);
      if (newGs !== currentGs) {
        setGameState(newGs);
        broadcastGameState(newGs);
        let roomForPhase = currentRoom;
        if (wasFinished && allowDevMobilizationJump) {
          roomForPhase = { ...currentRoom, phase: 'playing' as const };
          setRoom(roomForPhase);
          broadcastRoomState(roomForPhase);
        }
        // Poker stays in 'playing' phase for continuous play
        if (checkGameOver(currentRoom.gameType, newGs) && currentRoom.gameType !== 'poker') {
          const finishedRoom = { ...roomForPhase, phase: 'finished' as const };
          setRoom(finishedRoom);
          broadcastRoomState(finishedRoom);
        }
      }
    } else {
      if (!myId) return;
      connectionsRef.current.forEach((conn) => {
        if (conn.open) {
          conn.send({ type: 'action', payload, deviceId: myId } as ClientMessage);
        }
      });
    }
  }, [isHost, myId, broadcastGameState, broadcastRoomState]);

  // Return to lobby (host only) — calculates winners, updates wins, resets to lobby
  const returnToLobby = useCallback(() => {
    if (!isHost || !room) return;

    // Calculate winners and update wins
    const updatedWins = { ...room.wins };
    if (room.gameType && gameStateRef.current) {
      const winners = getGameWinners(room.gameType, gameStateRef.current);
      for (const winnerId of winners) {
        updatedWins[winnerId] = (updatedWins[winnerId] || 0) + 1;
      }
    }

    const lobbyRoom: RoomState = {
      ...room,
      gameType: null,
      phase: 'lobby' as const,
      players: room.players.filter(p => !p.isBot),
      wins: updatedWins,
    };
    setRoom(lobbyRoom);
    setGameState(null);
    broadcastRoomState(lobbyRoom);
  }, [isHost, room, broadcastRoomState]);

  // End game without recording winners (host only) — resets to lobby, keeps wins unchanged
  const endGame = useCallback(() => {
    if (!isHost || !room) return;

    const lobbyRoom: RoomState = {
      ...room,
      gameType: null,
      phase: 'lobby' as const,
      players: room.players.filter(p => !p.isBot),
      wins: room.wins,
    };
    setRoom(lobbyRoom);
    setGameState(null);
    broadcastRoomState(lobbyRoom);
  }, [isHost, room, broadcastRoomState]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  // --- Bot turn scheduling (host only, Hearts & Liar's Dice & Poker) ---
  const BOT_PLAY_DELAY = 800;   // ms between each bot card play (Hearts)
  const BATTLESHIP_BOT_DELAY = 800; // ms before bot fires in Battleship
  const YAHTZEE_BOT_ROLL_DELAY = 2000;  // ms between each bot roll in Yahtzee
  const YAHTZEE_BOT_SCORE_DELAY = 4000; // ms to show dice before bot scores
  const FARKLE_BOT_DELAY = 900; // ms before bot banks in Farkle
  const FARKLE_BOT_CHOOSE_DELAY = 2000; // ms before bot chooses dice to keep
  const FARKLE_BOT_ROLL_DELAY = 2000; // ms before bot re-rolls
  const FARKLE_FARKLE_DISPLAY_DELAY = 5500; // ms to show farkle roll + message before advancing (animation ~1.2s + 4s message)
  const TRICK_DISPLAY_DELAY = 2000; // ms to show completed trick before collecting
  const LIARS_DICE_BOT_DELAY = 1200; // ms between bot actions in Liar's Dice
  const LIARS_DICE_REVEAL_DELAY = 2500; // ms to show reveal before revolver
  const LIARS_DICE_TRIGGER_DELAY = 1500; // ms before bot pulls trigger
  const LIARS_DICE_NEXT_ROUND_DELAY = 2000; // ms before starting next round
  const UP_RIVER_BOT_DELAY = 900; // ms between bot bid/card play
  const UP_RIVER_ROUND_END_DELAY = 5000; // ms to show bid result borders before next round
  const MOBILIZATION_BOT_DELAY = 900; // ms between Mobilization bot actions
  const MOBILIZATION_SOLITAIRE_REVEAL_DELAY = 3000; // ms to show last Solitaire play / pig pass
  const TWELVE_BOT_DELAY = 900; // ms between bot actions
  const TWELVE_ANNOUNCEMENT_DELAY = 4000; // ms to show trump/tjog announcement
  const TWELVE_ROUND_END_DELAY = 6500; // ms to show round summary before next round
  const TWELVE_FINAL_RESULTS_DELAY = 6000; // ms to hold final round summary before end screen
  const CROSS_CRIB_ROUND_END_DELAY = 10000; // ms to show round summary before next round
  const CROSS_CRIB_BOT_DELAY = 900; // ms between bot card placements
  const CROSS_CRIB_CRIB_REVEAL_STEP_MS = 750; // ms between each crib card flip
  const SETTLER_BOT_DELAY = 900; // ms between bot actions in Settler
  const CASINO_BOT_DELAY = 900; // ms between Casino bot plays
  const CASINO_CAPTURE_PREVIEW_DELAY = 1600; // ms for capture preview overlay before capture resolves
  const CASINO_ACTION_ANNOUNCEMENT_DELAY = 3000; // ms to show last play in heads-up before next turn
  const CASINO_TABLE_REMNANT_DELAY = 3000; // ms to show who takes remaining table cards before scoring
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settlerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timer when state changes
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
    if (settlerIdleTimerRef.current) {
      clearTimeout(settlerIdleTimerRef.current);
      settlerIdleTimerRef.current = null;
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

    // ── Up and Down the River bot scheduling ──
    if (room.gameType === 'up-and-down-the-river') {
      const urs = gameState as UpRiverState;
      if (urs.gameOver) return;

      if (urs.phase === 'playing' && urs.trickWinner) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as UpRiverState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'playing' || !currentGs.trickWinner) return;

          const resolved = processGameAction('up-and-down-the-river', currentGs, { type: 'resolve-trick' }, '');
          if (resolved !== currentGs) {
            setGameState(resolved);
            broadcastGameState(resolved);
            if (checkGameOver('up-and-down-the-river', resolved)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, TRICK_DISPLAY_DELAY);
        return;
      }

      if (urs.phase === 'round-end') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as UpRiverState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'round-end' || currentGs.gameOver) return;

          const next = processGameAction('up-and-down-the-river', currentGs, { type: 'start-next-round' }, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
          }
        }, UP_RIVER_ROUND_END_DELAY);
        return;
      }

      const currentPlayer = urs.players[urs.currentPlayerIndex];
      if (currentPlayer && currentPlayer.isBot) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('up-and-down-the-river', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('up-and-down-the-river', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, UP_RIVER_BOT_DELAY);
      }
      return;
    }

    // ── Mobilization bot scheduling ──
    if (room.gameType === 'mobilization') {
      const ms = gameState as MobilizationState;
      if (ms.gameOver) return;

      if (ms.phase === 'solitaire-reveal') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as MobilizationState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'solitaire-reveal') return;

          const next = processGameAction('mobilization', currentGs, { type: 'solitaire-finish-reveal' }, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('mobilization', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, MOBILIZATION_SOLITAIRE_REVEAL_DELAY);
        return;
      }

      if (ms.phase === 'playing' && ms.trickWinner) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as MobilizationState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'playing' || !currentGs.trickWinner) return;

          const resolved = processGameAction('mobilization', currentGs, { type: 'resolve-trick' }, '');
          if (resolved !== currentGs) {
            setGameState(resolved);
            broadcastGameState(resolved);
            if (checkGameOver('mobilization', resolved)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, TRICK_DISPLAY_DELAY);
        return;
      }

      if (ms.phase === 'round-depleted') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as MobilizationState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'round-depleted') return;

          const completed = processGameAction('mobilization', currentGs, { type: 'complete-trick-round-depletion' }, '');
          if (completed !== currentGs) {
            setGameState(completed);
            broadcastGameState(completed);
            if (checkGameOver('mobilization', completed)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, TRICK_DISPLAY_DELAY);
        return;
      }

      if (ms.phase === 'round-end') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as MobilizationState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'round-end' || currentGs.gameOver) return;

          const next = processGameAction('mobilization', currentGs, { type: 'start-next-round' }, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
          }
        }, UP_RIVER_ROUND_END_DELAY);
        return;
      }

      const currentPlayer = ms.players[ms.currentPlayerIndex];
      if (currentPlayer && currentPlayer.isBot) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('mobilization', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('mobilization', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, MOBILIZATION_BOT_DELAY);
      }
      return;
    }

    // ── Twelve bot scheduling ──
    if (room.gameType === 'twelve') {
      const ts = gameState as TwelveState;

      if (ts.phase === 'announcement') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as TwelveState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'announcement') return;

          const next = processGameAction('twelve', currentGs, { type: 'finish-announcement' }, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
          }
        }, TWELVE_ANNOUNCEMENT_DELAY);
        return;
      }

      if (ts.phase === 'playing' && ts.trickWinner) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as TwelveState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'playing' || !currentGs.trickWinner) return;

          const resolved = processGameAction('twelve', currentGs, { type: 'resolve-trick' }, '');
          if (resolved !== currentGs) {
            setGameState(resolved);
            broadcastGameState(resolved);
            if (checkGameOver('twelve', resolved)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, TRICK_DISPLAY_DELAY);
        return;
      }

      if (ts.phase === 'flipping') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as TwelveState | null;
          if (!currentGs || currentGs.phase !== 'flipping') return;
          const next = processGameAction('twelve', currentGs, { type: 'flip-exposed' }, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
          }
        }, 900);
        return;
      }

      if (ts.phase === 'round-end') {
        const roundEndDelay = ts.gameOver ? TWELVE_FINAL_RESULTS_DELAY : TWELVE_ROUND_END_DELAY;
        const roundEndAction = ts.gameOver
          ? ({ type: 'show-final-results' } as const)
          : ({ type: 'start-next-round' } as const);
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as TwelveState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'round-end') return;
          if (currentGs.gameOver !== ts.gameOver) return;

          const next = processGameAction('twelve', currentGs, roundEndAction, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('twelve', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, roundEndDelay);
        return;
      }

      if (ts.phase === 'game-over') {
        return;
      }

      const currentPlayer = ts.players[ts.currentPlayerIndex];
      if (currentPlayer && currentPlayer.isBot) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('twelve', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('twelve', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, TWELVE_BOT_DELAY);
      }
      return;
    }

    // ── Cross Crib bot scheduling ──
    if (room.gameType === 'cross-crib') {
      const ccs = gameState as CrossCribState;
      if (ccs.phase === 'game-over') return;

      if (ccs.phase === 'round-end') {
        const roundEndAction = ccs.gameOver
          ? ({ type: 'show-final-results' } as const)
          : ({ type: 'start-next-round' } as const);
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as CrossCribState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'round-end') return;
          if (currentGs.gameOver !== ccs.gameOver) return;

          const next = processGameAction('cross-crib', currentGs, roundEndAction, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('cross-crib', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, CROSS_CRIB_ROUND_END_DELAY);
        return;
      }

      if (ccs.phase === 'crib-reveal') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as CrossCribState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'crib-reveal') return;

          const next = processGameAction('cross-crib', currentGs, { type: 'advance-crib-reveal' }, '');
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('cross-crib', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, CROSS_CRIB_CRIB_REVEAL_STEP_MS);
        return;
      }

      if (ccs.phase === 'crib-discard') {
        const need = cribCardsToSelect(ccs.players.length);
        const botsNeedToAct = ccs.players.some((p) => {
          if (!p.isBot) return false;
          const sel = ccs.cribSelections[p.id];
          if (!sel || sel.length !== need) return true;
          return !ccs.cribConfirmed[p.id];
        });
        if (botsNeedToAct) {
          botTimerRef.current = setTimeout(() => {
            const currentGs = gameStateRef.current;
            const currentRoom = roomRef.current;
            if (!currentGs || !currentRoom) return;

            const next = runSingleBotTurn('cross-crib', currentGs);
            if (next !== currentGs) {
              setGameState(next);
              broadcastGameState(next);
            }
          }, 100);
        }
        return;
      }

      if (ccs.phase === 'playing') {
        const currentPlayer = ccs.players[ccs.currentPlayerIndex];
        if (currentPlayer?.isBot) {
          botTimerRef.current = setTimeout(() => {
            const currentGs = gameStateRef.current;
            const currentRoom = roomRef.current;
            if (!currentGs || !currentRoom) return;

            const next = runSingleBotTurn('cross-crib', currentGs);
            if (next !== currentGs) {
              setGameState(next);
              broadcastGameState(next);
              if (checkGameOver('cross-crib', next)) {
                const finishedRoom = { ...currentRoom, phase: 'finished' as const };
                setRoom(finishedRoom);
                broadcastRoomState(finishedRoom);
              }
            }
          }, CROSS_CRIB_BOT_DELAY);
        }
      }
      return;
    }

    // ── Casino bot scheduling ──
    if (room.gameType === 'casino') {
      const bs = gameState as CasinoState;

      if (bs.pendingCapturePreview) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as CasinoState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || !currentGs.pendingCapturePreview) return;

          const next = processGameAction(
            'casino',
            currentGs,
            { type: 'finalize-capture' },
            ''
          );
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
          }
        }, CASINO_CAPTURE_PREVIEW_DELAY);
        return;
      }

      if (bs.phase === 'announcement') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as CasinoState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'announcement') return;

          const next = processGameAction(
            'casino',
            currentGs,
            { type: 'finish-action-announcement' },
            ''
          );
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
          }
        }, CASINO_ACTION_ANNOUNCEMENT_DELAY);
        return;
      }

      if (bs.phase === 'table-remnant') {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as CasinoState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentGs.phase !== 'table-remnant') return;

          const next = processGameAction(
            'casino',
            currentGs,
            { type: 'finish-table-remnant' },
            ''
          );
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('casino', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, CASINO_TABLE_REMNANT_DELAY);
        return;
      }

      if (bs.phase !== 'playing' || bs.gameOver) return;

      const currentPlayer = bs.players[bs.currentPlayerIndex];
      if (currentPlayer?.isBot) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('casino', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('casino', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, CASINO_BOT_DELAY);
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
          }
        }, POKER_BOT_DELAY);
      }
    }

    // ── Battleship bot scheduling ──
    if (room.gameType === 'battleship') {
      const bs = gameState as BattleshipState;
      if (bs.phase !== 'playing') return;

      const currentPlayer = bs.players[bs.currentPlayerIndex];
      if (currentPlayer && currentPlayer.isBot) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('battleship', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('battleship', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, BATTLESHIP_BOT_DELAY);
      }
    }

    // ── Yahtzee bot scheduling ──
    if (room.gameType === 'yahtzee') {
      const ys = gameState as YahtzeeState;
      if (ys.gameOver) return;

      const currentPlayer = ys.players[ys.currentPlayerIndex];
      if (currentPlayer && currentPlayer.isBot) {
        const delay = willYahtzeeBotScore(ys) ? YAHTZEE_BOT_SCORE_DELAY : YAHTZEE_BOT_ROLL_DELAY;
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('yahtzee', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('yahtzee', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, delay);
      }
    }

    // ── Farkle bot scheduling ──
    if (room.gameType === 'farkle') {
      const fs = gameState as FarkleState;
      if (fs.gameOver) return;

      const currentPlayer = fs.players[fs.currentPlayerIndex];
      if (fs.phase === 'farkle' && currentPlayer?.isBot) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;
          const farkleState = currentGs as FarkleState;
          const player = farkleState.players[farkleState.currentPlayerIndex];
          if (!player || farkleState.phase !== 'farkle') return;

          const next = processGameAction('farkle', currentGs, { type: 'end-farkle' }, player.id);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
          }
        }, FARKLE_FARKLE_DISPLAY_DELAY);
        return;
      }

      if (currentPlayer && currentPlayer.isBot) {
        const delay =
          fs.phase === 'choose'
            ? FARKLE_BOT_CHOOSE_DELAY
            : fs.phase === 'roll-or-bank' && !shouldBotBank(fs)
              ? FARKLE_BOT_ROLL_DELAY
              : FARKLE_BOT_DELAY;
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('farkle', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('farkle', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, delay);
      }
    }

    // ── Settler bot scheduling ──
    if (room.gameType === 'settler') {
      const cs = gameState as SettlerState;
      if (cs.phase === 'finished') return;

      const idlePid = getSettlerIdleActorId(cs);
      const idlePl = idlePid ? cs.players.find((p) => p.id === idlePid) : null;
      if (idlePl && !idlePl.isBot && cs.turnDeadlineAt != null) {
        const expectedDeadline = cs.turnDeadlineAt;
        const delay = Math.max(0, expectedDeadline - Date.now());
        settlerIdleTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current as SettlerState | null;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom || currentRoom.gameType !== 'settler') return;
          if (currentGs.phase === 'finished') return;
          if (currentGs.turnDeadlineAt !== expectedDeadline) return;
          if (getSettlerIdleActorId(currentGs) !== idlePid) return;

          const nextRaw = applySettlerIdleTimeout(currentGs);
          if (nextRaw === currentGs) return;
          const next = reconcileSettlerTurnDeadlineAfterAction(currentGs, nextRaw, Date.now());
          setGameState(next);
          broadcastGameState(next);
          if (checkGameOver('settler', next)) {
            const finishedRoom = { ...currentRoom, phase: 'finished' as const };
            setRoom(finishedRoom);
            broadcastRoomState(finishedRoom);
          }
        }, delay);
      }

      // Discard uses queue order instead of currentPlayerIndex.
      if (cs.phase === 'discard') {
        const discarderId = cs.discardQueue[0];
        const discarder = discarderId ? cs.players.find((p) => p.id === discarderId) : null;
        if (discarder?.isBot) {
          botTimerRef.current = setTimeout(() => {
            const currentGs = gameStateRef.current;
            const currentRoom = roomRef.current;
            if (!currentGs || !currentRoom) return;

            const next = runSingleBotTurn('settler', currentGs);
            if (next !== currentGs) {
              setGameState(next);
              broadcastGameState(next);
              if (checkGameOver('settler', next)) {
                const finishedRoom = { ...currentRoom, phase: 'finished' as const };
                setRoom(finishedRoom);
                broadcastRoomState(finishedRoom);
              }
            }
          }, SETTLER_BOT_DELAY);
        }
        return;
      }

      const currentPlayer = cs.players[cs.currentPlayerIndex];
      if (currentPlayer?.isBot) {
        botTimerRef.current = setTimeout(() => {
          const currentGs = gameStateRef.current;
          const currentRoom = roomRef.current;
          if (!currentGs || !currentRoom) return;

          const next = runSingleBotTurn('settler', currentGs);
          if (next !== currentGs) {
            setGameState(next);
            broadcastGameState(next);
            if (checkGameOver('settler', next)) {
              const finishedRoom = { ...currentRoom, phase: 'finished' as const };
              setRoom(finishedRoom);
              broadcastRoomState(finishedRoom);
            }
          }
        }, SETTLER_BOT_DELAY);
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
      if (settlerIdleTimerRef.current) clearTimeout(settlerIdleTimerRef.current);
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
        createLobby,
        joinRoom,
        updateProfile,
        rejoinRoom,
        leaveRoom,
        removePlayer,
        addBot,
        removeBot,
        startGame,
        sendAction,
        returnToLobby,
        endGame,
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
