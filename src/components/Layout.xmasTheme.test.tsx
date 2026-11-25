import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

vi.mock('../siteTheme', () => ({
  SITE_XMAS_THEME_ENABLED: true,
  SITE_HEADER_TITLE: "Santa's Fav Games",
}));

vi.mock('./LobbyMenu', () => ({
  default: () => <div data-testid="lobby-menu-stub" />,
}));

import Layout from './Layout';

describe('Layout christmas theme', () => {
  it('renders header Christmas lights when SITE_XMAS_THEME_ENABLED is true', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Layout>
          <div>Home</div>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('header-christmas-lights')).toBeInTheDocument();
  });

  it('renders viewport-top Christmas lights on game routes without the homepage header', () => {
    render(
      <MemoryRouter initialEntries={['/game/TEST']}>
        <Layout>
          <div>Game</div>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('header-christmas-lights')).toBeInTheDocument();
    expect(screen.getByTestId('header-christmas-lights')).toHaveClass(
      'header-christmas-lights--viewport-top',
    );
    expect(screen.queryByText("Santa's Fav Games")).not.toBeInTheDocument();
    expect(screen.queryByTestId('lobby-menu-stub')).not.toBeInTheDocument();
  });
});