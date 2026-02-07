import Peer from 'peerjs';
type DataConnection = ReturnType<Peer['connect']>;
import { peerIdFromRoom } from '../utils/roomCode';

// #region agent log
const _dbg = (loc: string, msg: string, data?: Record<string, unknown>) => {
  console.log('[DEBUG]', JSON.stringify({ location: loc, message: msg, data, timestamp: Date.now() }));
};
// #endregion

export function createHostPeer(roomCode: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peerId = peerIdFromRoom(roomCode);
    // #region agent log
    _dbg('peer.ts:createHostPeer', 'Creating host peer', { roomCode, peerId, hypothesisId: 'C' });
    // #endregion
    const peer = new Peer(peerId, {
      debug: 0,
    });
    
    peer.on('open', (id) => {
      // #region agent log
      _dbg('peer.ts:createHostPeer', 'Host peer opened', { id, hypothesisId: 'C' });
      // #endregion
      resolve(peer);
    });
    peer.on('error', (err) => {
      // #region agent log
      _dbg('peer.ts:createHostPeer', 'Host peer error', { type: err.type, message: err.message, hypothesisId: 'E' });
      // #endregion
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
  // #region agent log
  const startTime = Date.now();
  _dbg('peer.ts:createClientPeer', 'Creating client peer', { startTime, hypothesisId: 'B' });
  // #endregion
  return new Promise((resolve, reject) => {
    const peer = new Peer({
      debug: 0,
    });
    
    peer.on('open', (id) => {
      // #region agent log
      _dbg('peer.ts:createClientPeer', 'Client peer opened', { id, elapsed: Date.now() - startTime, hypothesisId: 'B' });
      // #endregion
      resolve(peer);
    });
    peer.on('error', (err) => {
      // #region agent log
      _dbg('peer.ts:createClientPeer', 'Client peer error', { type: err.type, message: err.message, elapsed: Date.now() - startTime, hypothesisId: 'B,E' });
      // #endregion
      reject(new Error(`Connection error: ${err.message}`));
    });
    setTimeout(() => {
      // #region agent log
      _dbg('peer.ts:createClientPeer', 'Client peer TIMEOUT', { elapsed: Date.now() - startTime, hypothesisId: 'B' });
      // #endregion
      reject(new Error('Connection timeout'));
    }, 10000);
  });
}

export function connectToPeer(peer: Peer, roomCode: string): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const hostId = peerIdFromRoom(roomCode);
    // #region agent log
    const startTime = Date.now();
    _dbg('peer.ts:connectToPeer', 'Connecting to host peer', { roomCode, hostId, localPeerId: peer.id, hypothesisId: 'A,C' });
    // #endregion
    const conn = peer.connect(hostId, { reliable: true });

    // #region agent log
    // Monitor ICE connection state on the underlying RTCPeerConnection
    const pollIce = setInterval(() => {
      const pc = (conn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      if (pc) {
        clearInterval(pollIce);
        _dbg('peer.ts:connectToPeer', 'RTCPeerConnection found', {
          iceConnectionState: pc.iceConnectionState,
          connectionState: pc.connectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingState: pc.signalingState,
          hypothesisId: 'G,H',
        });
        pc.addEventListener('iceconnectionstatechange', () => {
          _dbg('peer.ts:connectToPeer', 'ICE connection state changed', {
            iceConnectionState: pc.iceConnectionState,
            elapsed: Date.now() - startTime,
            hypothesisId: 'G,H',
          });
        });
        pc.addEventListener('connectionstatechange', () => {
          _dbg('peer.ts:connectToPeer', 'Connection state changed', {
            connectionState: pc.connectionState,
            elapsed: Date.now() - startTime,
            hypothesisId: 'G',
          });
        });
        pc.addEventListener('icegatheringstatechange', () => {
          _dbg('peer.ts:connectToPeer', 'ICE gathering state changed', {
            iceGatheringState: pc.iceGatheringState,
            elapsed: Date.now() - startTime,
            hypothesisId: 'G',
          });
        });
        let candidateCount = 0;
        pc.addEventListener('icecandidate', (e) => {
          candidateCount++;
          _dbg('peer.ts:connectToPeer', 'ICE candidate', {
            candidateCount,
            hasCandidate: !!e.candidate,
            candidateType: e.candidate?.type,
            protocol: e.candidate?.protocol,
            elapsed: Date.now() - startTime,
            hypothesisId: 'G',
          });
        });
      }
    }, 50);
    setTimeout(() => clearInterval(pollIce), 12000);
    // #endregion
    
    conn.on('open', () => {
      // #region agent log
      _dbg('peer.ts:connectToPeer', 'Connection OPENED to host', { hostId, elapsed: Date.now() - startTime, hypothesisId: 'A' });
      // #endregion
      resolve(conn);
    });
    conn.on('error', (err) => {
      // #region agent log
      _dbg('peer.ts:connectToPeer', 'Connection ERROR', { message: err.message, elapsed: Date.now() - startTime, hypothesisId: 'A,E' });
      // #endregion
      reject(new Error(`Failed to connect: ${err.message}`));
    });
    setTimeout(() => {
      // #region agent log
      const pc = (conn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      _dbg('peer.ts:connectToPeer', 'Connection TIMEOUT', {
        hostId,
        elapsed: Date.now() - startTime,
        finalIceState: pc?.iceConnectionState,
        finalConnState: pc?.connectionState,
        finalGatherState: pc?.iceGatheringState,
        hypothesisId: 'A,G',
      });
      // #endregion
      reject(new Error('Connection timeout - room may not exist'));
    }, 10000);
  });
}

export function destroyPeer(peer: Peer | null) {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }
}
