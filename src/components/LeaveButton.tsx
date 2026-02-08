import { XCircle } from 'lucide-react';
import { useRoomContext } from '../networking/roomStore';
import { useToast } from './Toast';
import { useNavigate } from 'react-router-dom';

interface LeaveButtonProps {
  variant?: 'default' | 'icon';
}

export default function LeaveButton({ variant = 'default' }: LeaveButtonProps) {
  const { leaveRoom, isHost } = useRoomContext();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLeave = () => {
    leaveRoom();
    toast(isHost ? 'Left lobby. The lobby is closed.' : 'Left lobby.', 'info');
    navigate('/');
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleLeave}
        className="inline-flex items-center justify-center text-red-400 hover:text-red-300 transition-colors cursor-pointer"
        title="Leave Room"
      >
        <XCircle className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={handleLeave}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all duration-200 cursor-pointer"
      title="Leave Room"
    >
      <span className="text-sm font-medium">Leave</span>
    </button>
  );
}
