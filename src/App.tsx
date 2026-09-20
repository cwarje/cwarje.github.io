import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RoomProvider } from './networking/roomStore';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import GamePage from './pages/GamePage';

export default function App() {
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
