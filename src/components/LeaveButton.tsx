import { PhoneOff } from 'lucide-react';
import { useRoomContext } from '../networking/roomStore';
import { useNavigate } from 'react-router-dom';

export default function LeaveButton() {
  const { leaveRoom } = useRoomContext();
  const navigate = useNavigate();

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <button
      onClick={handleLeave}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all duration-200 cursor-pointer"
      title="Leave Room"
    >
      <PhoneOff className="w-4 h-4" />
      <span className="text-sm font-medium">Leave</span>
    </button>
  );
}
