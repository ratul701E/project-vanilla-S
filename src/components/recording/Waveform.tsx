import React from "react";

interface WaveformProps {
  elapsed: number;
  isPaused: boolean;
}

const WAVEFORM_HEIGHTS = [
  12, 18, 26, 38, 52, 68, 86, 98, 106, 98, 86, 68, 52, 38, 26, 18, 12,
];

export const Waveform: React.FC<WaveformProps> = ({ elapsed, isPaused }) => {
  return (
    <div className="diamond-waveform">
      {WAVEFORM_HEIGHTS.map((h, i) => {
        const heightVariance = isPaused
          ? 6
          : Math.max(
              6,
              h + (i % 2 === 0 ? Math.sin(elapsed * 2 + i) * 14 : -Math.cos(elapsed * 2 + i) * 10)
            );

        return (
          <div
            key={i}
            className="waveform-bar"
            style={{ height: `${heightVariance}px` }}
          />
        );
      })}
    </div>
  );
};
