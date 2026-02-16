import { Gamepad2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LobbyMenu from './LobbyMenu';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isGamePage = location.pathname.startsWith('/game/');
  const showHeader = !isGamePage;
  const mainClassName = isGamePage
    ? 'h-screen max-w-none px-0 py-0 overflow-hidden'
    : 'max-w-7xl mx-auto px-4 sm:px-6 py-8';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-primary-950">
      {showHeader && (
        <header className="border-b border-white/5 bg-gray-950/60 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between relative">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/20 group-hover:shadow-primary-600/40 transition-shadow">
                <Gamepad2 className="w-5 h-5 text-white" />
              </div>
              <span className="hidden sm:inline text-lg font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Cam's Games
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
