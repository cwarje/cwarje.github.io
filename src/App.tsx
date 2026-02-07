import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RoomProvider } from './networking/roomStore';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import GamePage from './pages/GamePage';

export default function App() {
  return (
    <BrowserRouter basename="/">
      <ToastProvider>
        <RoomProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/lobby/:roomCode" element={<Lobby />} />
              <Route path="/game/:roomCode" element={<GamePage />} />
            </Routes>
          </Layout>
        </RoomProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
