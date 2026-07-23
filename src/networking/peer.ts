import Peer from 'peerjs';
type DataConnection = ReturnType<Peer['connect']>;
import { peerIdFromRoom } from '../utils/roomCode';

const SIGNALING_TIMEOUT_MS = 10000;
const DATA_CONNECT_TIMEOUT_MS = 12000;

export class HostUnreachableError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'HostUnreachableError';
  }
}

export class HostConnectTimeoutError extends Error {
  readonly retryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'HostConnectTimeoutError';
  }
}

export function isRetryableJoinError(err: unknown): boolean {
  return err instanceof HostConnectTimeoutError;
}

export function createHostPeer(roomCode: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peerId = peerIdFromRoom(roomCode);
    let settled = false;
    const peer = new Peer(peerId, {
      debug: 0,
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Connection timeout'));
    }, SIGNALING_TIMEOUT_MS);

    peer.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      peer.off('error', onError);
      resolve(peer);
    });

    const onError = (err: { type?: string; message?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err.type === 'unavailable-id') {
        reject(new Error('Room code already in use. Try again.'));
      } else {
        reject(new Error(`Connection error: ${err.message}`));
      }
    };
    peer.on('error', onError);
  });
}

export function createClientPeer(): Promise<Peer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const peer = new Peer({
      debug: 0,
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Connection timeout'));
    }, SIGNALING_TIMEOUT_MS);

    peer.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      peer.off('error', onError);
      resolve(peer);
    });

    const onError = (err: { type?: string; message?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Connection error: ${err.message}`));
    };
    peer.on('error', onError);
  });
}

export function connectToPeer(peer: Peer, roomCode: string): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const hostId = peerIdFromRoom(roomCode);
    let settled = false;
    const conn = peer.connect(hostId, { reliable: true });

    const cleanup = () => {
      clearTimeout(timeout);
      peer.off('error', onPeerError);
    };

    const finishResolve = (connection: DataConnection) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(connection);
    };

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!conn.open) {
        conn.close();
      }
      reject(err);
    };

    const onPeerError = (err: { type?: string; message?: string }) => {
      if (err.type === 'peer-unavailable') {
        finishReject(new HostUnreachableError(
          'No lobby found for that code. Check the code and try again.',
        ));
      }
    };
    peer.on('error', onPeerError);

    conn.on('open', () => {
      finishResolve(conn);
    });
    conn.on('error', (err) => {
      finishReject(new Error(`Failed to connect: ${err.message}`));
    });

    const timeout = setTimeout(() => {
      finishReject(new HostConnectTimeoutError(
        'Connection timed out. The host may be offline, on a slow network, or need to reopen the game page.',
      ));
    }, DATA_CONNECT_TIMEOUT_MS);
  });
}

export function destroyPeer(peer: Peer | null) {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }
}
