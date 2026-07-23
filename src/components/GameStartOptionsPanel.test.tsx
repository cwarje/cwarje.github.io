import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import GameStartOptionsPanel from './GameStartOptionsPanel';
import { DEFAULT_BOT_NAMES, writeCustomBots } from '../networking/favoriteBots';

describe('GameStartOptionsPanel bot picker', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => `uuid-${Math.random().toString(36).slice(2, 8)}`,
    });
    writeCustomBots([
      { id: 'bot-1', name: 'R2-D2', color: 'red' },
      { id: 'bot-2', name: 'C-3PO', color: 'green' },
    ]);
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('lists only custom bots in the game settings area', () => {
    render(
      <GameStartOptionsPanel
        gameType="hearts"
        playerCount={1}
        isHost
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'R2-D2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'C-3PO' })).toBeInTheDocument();
    for (const name of DEFAULT_BOT_NAMES) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('auto-fills defaults at start when custom bots are not enough', () => {
    const onStart = vi.fn();
    render(
      <GameStartOptionsPanel
        gameType="hearts"
        playerCount={1}
        isHost
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        botCount: 3,
        selectedBots: expect.arrayContaining([
          expect.objectContaining({ name: 'R2-D2' }),
          expect.objectContaining({ name: 'C-3PO' }),
        ]),
      }),
    );
    const selectedBots = onStart.mock.calls[0][0].selectedBots as { name: string }[];
    expect(selectedBots).toHaveLength(3);
    expect(selectedBots.some((b) => DEFAULT_BOT_NAMES.includes(b.name))).toBe(true);
  });

  it('shows no bot chips when there are no custom bots', () => {
    writeCustomBots([]);
    render(
      <GameStartOptionsPanel
        gameType="hearts"
        playerCount={1}
        isHost
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'R2-D2' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).not.toBeDisabled();
  });

  it('lets the host adjust bot count with the stepper', () => {
    const onStart = vi.fn();
    render(
      <GameStartOptionsPanel
        gameType="hearts"
        playerCount={1}
        isHost
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More bots' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        botCount: 4,
      }),
    );
  });
});
