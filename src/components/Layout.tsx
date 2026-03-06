import { Gamepad2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LobbyMenu from './LobbyMenu';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isGamePage = location.pathname.startsWith('/game/');
  const showHeader = !isGamePage;
  const mainClassName = isGamePage
    ? 'game-viewport-height max-w-none px-0 py-0 overflow-hidden'
    : 'max-w-7xl mx-auto px-4 sm:px-6 py-8';

  return (
    <div className="min-h-screen bg-black">
      {showHeader && (
        <header className="border-b border-white/5 bg-black sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between relative">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="flex items-center justify-center">
                <Gamepad2 className="w-8 h-8 text-white" />
              </div>
              <span className="hidden sm:inline text-lg font-bold tracking-tight text-white">
                Cam's Fav Games
              </span>
            </Link>
            <LobbyMenu />
          </div>
        </header>
      )}
      <main className={mainClassName}>
        {children}
      </main>
    </div>
  );
}
