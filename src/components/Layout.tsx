import { Gamepad2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LobbyMenu from './LobbyMenu';
import { isDoubleXpWeekend } from '../xp/progress';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isGamePage = location.pathname.startsWith('/game/');
  const showHeader = !isGamePage;
  const showDoubleXpWeekend = isDoubleXpWeekend();
  const mainClassName = isGamePage
    ? 'game-viewport-height max-w-none px-0 py-0 overflow-hidden'
    : 'max-w-7xl mx-auto px-4 sm:px-6 py-8';

  return (
    <div className="min-h-screen bg-black">
      {showHeader && (
        <header className="border-b border-white/5 bg-black sticky top-0 z-50">
          <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Link to="/" className="flex min-w-0 items-center gap-3 group">
              <div className="flex items-center justify-center shrink-0">
                <Gamepad2 className="w-8 h-8 text-white" />
              </div>
              <span className="hidden sm:inline text-lg font-bold tracking-tight text-white shrink-0">
                Cam's Fav Games
              </span>
              {showDoubleXpWeekend && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--color-primary-600)] shadow-sm text-[10px] font-bold uppercase tracking-wider text-white whitespace-nowrap shrink-0">
                  Double XP Weekend
                </span>
              )}
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
