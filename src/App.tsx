import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RoomProvider } from './networking/roomStore';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import GamePage from './pages/GamePage';
import { BIRTHDAY_MODE, partyHatUrl } from './birthdayMode';

export default function App() {
  useEffect(() => {
    document.documentElement.classList.toggle('birthday-mode', BIRTHDAY_MODE);
    if (BIRTHDAY_MODE) {
      document.documentElement.style.setProperty('--seat-pill-party-hat-url', `url(${partyHatUrl})`);
    } else {
      document.documentElement.style.removeProperty('--seat-pill-party-hat-url');
    }
  }, []);

  return (
    <BrowserRouter basename="/">
      <ToastProvider>
        <RoomProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/game/:roomCode" element={<GamePage />} />
              {/* Redirect old lobby URLs to homepage */}
              <Route path="/lobby/*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </RoomProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
