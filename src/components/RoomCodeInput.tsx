import { useState } from 'react';
import { Users } from 'lucide-react';

interface RoomCodeInputProps {
  onJoin: (code: string) => void;
  loading?: boolean;
}

export default function RoomCodeInput({ onJoin, loading }: RoomCodeInputProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 4) {
      onJoin(trimmed);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center justify-center gap-3 w-full">
      <div className="relative">
        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
          placeholder="ROOM CODE"
          maxLength={4}
          className="w-52 sm:w-64 pl-12 pr-4 py-4 rounded-2xl bg-white/10 border border-white/20 text-white text-lg font-mono tracking-[0.35em] placeholder:text-gray-500 placeholder:tracking-[0.2em] focus:outline-none focus:border-primary-400/70 focus:ring-2 focus:ring-primary-500/30 transition-all shadow-lg shadow-black/20"
        />
      </div>
      <button
        type="submit"
        disabled={code.length !== 4 || loading}
        className="px-7 py-4 rounded-2xl bg-primary-600 text-white text-base font-semibold hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-lg shadow-primary-900/40"
      >
        {loading ? 'Joining...' : 'Join'}
      </button>
    </form>
  );
}
