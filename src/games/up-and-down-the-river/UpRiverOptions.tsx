import { useState, useEffect } from 'react';
import type { UpRiverBiddingStyle, UpRiverStartMode } from '../../networking/types';
import type { GameOptionsPanelProps } from '../registry';

export default function UpRiverOptions({ onChange, labelClass }: GameOptionsPanelProps) {
  const [mode, setMode] = useState<UpRiverStartMode>('down-up');
  const [biddingStyle, setBiddingStyle] = useState<UpRiverBiddingStyle>('sequential');
  const [allowPerfectBids, setAllowPerfectBids] = useState(true);

  useEffect(() => {
    onChange({
      upRiverStartMode: mode,
      upRiverBiddingStyle: biddingStyle,
      allowPerfectBids: biddingStyle === 'knocking' ? true : allowPerfectBids,
    });
  }, [mode, biddingStyle, allowPerfectBids, onChange]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Round order</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('up-down')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              mode === 'up-down'
                ? 'bg-teal-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            1 - 7 - 1
          </button>
          <button
            type="button"
            onClick={() => setMode('down-up')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              mode === 'down-up'
                ? 'bg-teal-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            7 - 1 - 7
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Bidding style</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setBiddingStyle('sequential')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              biddingStyle === 'sequential'
                ? 'bg-teal-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            Sequential
          </button>
          <button
            type="button"
            onClick={() => setBiddingStyle('knocking')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              biddingStyle === 'knocking'
                ? 'bg-teal-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
            }`}
          >
            Knocking
          </button>
        </div>
      </div>
      {biddingStyle === 'sequential' && (
        <div className="space-y-2">
          <p className={`text-sm font-semibold uppercase tracking-wider ${labelClass}`}>Allow perfect bids</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAllowPerfectBids(true)}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                allowPerfectBids
                  ? 'bg-teal-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setAllowPerfectBids(false)}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                !allowPerfectBids
                  ? 'bg-teal-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10'
              }`}
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
