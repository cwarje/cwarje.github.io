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
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative">
        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
          placeholder="ROOM CODE"
          maxLength={4}
          className="w-36 pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono tracking-widest placeholder:text-gray-600 placeholder:tracking-wider focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={code.length !== 4 || loading}
        className="px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        {loading ? 'Joining...' : 'Join'}
      </button>
    </form>
  );
}
