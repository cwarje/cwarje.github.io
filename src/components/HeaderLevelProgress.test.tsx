import { render, screen } from '@testing-library/react';
import type { RoomContextValue } from '../networking/types';
import HeaderLevelProgress from './HeaderLevelProgress';

const mockUseRoomContext = vi.fn();

vi.mock('../networking/roomStore', () => ({
  useRoomContext: () => mockUseRoomContext(),
}));

function createRoomContext(overrides: Partial<RoomContextValue> = {}): RoomContextValue {
  return {
    room: null,
    gameState: null,
    isHost: true,
    myId: 'player-1',
    myPlayer: { id: 'player-1', name: 'Cam', color: 'blue', isBot: false, isHost: true, connected: true, xp: 250 },
    createLobby: vi.fn(),
    joinRoom: vi.fn(),
    updateProfile: vi.fn(),
    rejoinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    removePlayer: vi.fn(),
    addBot: vi.fn(),
    removeBot: vi.fn(),
    startGame: vi.fn(),
    sendAction: vi.fn(),
    returnToLobby: vi.fn(),
    endGame: vi.fn(),
    setDealerSpeed: vi.fn(),
    updatePlayerXp: vi.fn(),
    updateSelectedHat: vi.fn(),
    error: null,
    clearError: vi.fn(),
    connecting: false,
    reconnecting: false,
    ...overrides,
  };
}

describe('HeaderLevelProgress', () => {
  it('shows level progress from player XP', () => {
    mockUseRoomContext.mockReturnValue(createRoomContext());

    render(<HeaderLevelProgress variant="menu" />);

    expect(screen.getByText('Lv 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Level 3 progress' })).toBeInTheDocument();
    expect(screen.getByText('50 / 100 XP')).toBeInTheDocument();
  });
});
