const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export function validateRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code.toUpperCase());
}

export function peerIdFromRoom(roomCode: string): string {
  return `cfg-${roomCode.toUpperCase()}`;
}

export function roomFromPeerId(peerId: string): string | null {
  if (peerId.startsWith('cfg-')) {
    return peerId.slice(4);
  }
  return null;
}
