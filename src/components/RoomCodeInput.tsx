import { useState } from 'react';
import { Users } from 'lucide-react';

interface RoomCodeInputProps {
  onJoin: (code: string) => void;
  loading?: boolean;
  variant?: 'default' | 'large';
}

export default function RoomCodeInput({ onJoin, loading, variant = 'default' }: RoomCodeInputProps) {
  const [code, setCode] = useState('');
  const isLarge = variant === 'large';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 4) {
      onJoin(trimmed);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={isLarge ? 'flex w-full flex-col gap-3 sm:flex-row' : 'flex items-center gap-2'}
    >
      <div className={`relative ${isLarge ? 'flex-1' : ''}`}>
        <Users
          className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 ${isLarge ? 'h-5 w-5' : 'h-4 w-4'}`}
        />
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
          placeholder={isLarge ? 'ENTER ROOM CODE' : 'ROOM CODE'}
          maxLength={4}
          className={`rounded-xl border border-white/10 bg-white/5 font-mono text-white tracking-widest placeholder:text-gray-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all ${
            isLarge
              ? 'w-full py-4 pl-12 pr-4 text-base sm:text-lg'
              : 'w-36 py-2.5 pl-10 pr-3 text-sm placeholder:tracking-wider'
          }`}
        />
      </div>
      <button
        type="submit"
        disabled={code.length !== 4 || loading}
        className={`rounded-xl bg-primary-600 font-medium text-white hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ${
          isLarge
            ? 'w-full px-6 py-4 text-base sm:w-auto sm:min-w-[140px] sm:text-lg'
            : 'px-4 py-2.5 text-sm'
        }`}
      >
        {loading ? 'Joining...' : 'Join'}
      </button>
    </form>
  );
}
