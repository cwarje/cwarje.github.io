import Peer from 'peerjs';
type DataConnection = ReturnType<Peer['connect']>;
import { peerIdFromRoom } from '../utils/roomCode';

export function createHostPeer(roomCode: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peerId = peerIdFromRoom(roomCode);
    const peer = new Peer(peerId, {
      debug: 0,
    });
    
    peer.on('open', () => resolve(peer));
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        reject(new Error('Room code already in use. Try again.'));
      } else {
        reject(new Error(`Connection error: ${err.message}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });
}

export function createClientPeer(): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = new Peer({
      debug: 0,
    });
    
    peer.on('open', () => resolve(peer));
    peer.on('error', (err) => reject(new Error(`Connection error: ${err.message}`)));
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });
}

export function connectToPeer(peer: Peer, roomCode: string): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const hostId = peerIdFromRoom(roomCode);
    const conn = peer.connect(hostId, { reliable: true });
    
    conn.on('open', () => resolve(conn));
    conn.on('error', (err) => reject(new Error(`Failed to connect: ${err.message}`)));
    setTimeout(() => reject(new Error('Connection timeout - room may not exist')), 10000);
  });
}

export function destroyPeer(peer: Peer | null) {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }
}
