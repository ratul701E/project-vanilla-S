import React from "react";

/**
 * Configuration for each bar in the waveform.
 * Heights form a diamond envelope (peaking in the center at 96px).
 */
interface BarConfig {
  id: number;
  height: number; // Max reference height in px
  delay: string; // Fallback animation delay
  weight: number; // Responsiveness weighting (0.3 - 1.0) for dynamic audio modulation
}

const BARS: BarConfig[] = [
  { id: 1, height: 16, delay: "0.10s", weight: 0.35 },
  { id: 2, height: 28, delay: "0.25s", weight: 0.50 },
  { id: 3, height: 44, delay: "0.40s", weight: 0.68 },
  { id: 4, height: 60, delay: "0.15s", weight: 0.82 },
  { id: 5, height: 76, delay: "0.35s", weight: 0.95 },
  { id: 6, height: 90, delay: "0.05s", weight: 1.00 },
  { id: 7, height: 96, delay: "0.20s", weight: 1.00 }, // center peak
  { id: 8, height: 90, delay: "0.45s", weight: 1.00 },
  { id: 9, height: 76, delay: "0.10s", weight: 0.95 },
  { id: 10, height: 60, delay: "0.30s", weight: 0.82 },
  { id: 11, height: 44, delay: "0.50s", weight: 0.68 },
  { id: 12, height: 28, delay: "0.20s", weight: 0.50 },
  { id: 13, height: 16, delay: "0.35s", weight: 0.35 },
];

export interface WaveformProps {
  /** Optional className override */
  className?: string;
  /** Pause the animation / recording */
  paused?: boolean;
  isPaused?: boolean;
  /** Real-time normalized RMS level from audio capture (0.0 to 1.0) */
  audioLevel?: number;
  /** Input track states */
  micEnabled?: boolean;
  systemAudioEnabled?: boolean;
  elapsed?: number;
}

export const Waveform: React.FC<WaveformProps> = ({
  className = "",
  paused = false,
  isPaused = false,
  audioLevel,
  micEnabled = true,
  systemAudioEnabled = true,
}) => {
  const isAnimationPaused = paused || isPaused;
  const isAllTracksMuted = !micEnabled && !systemAudioEnabled;
  const isLive = typeof audioLevel === "number";

  // Effective clamped level (0.0 if paused or all tracks muted)
  const effectiveLevel = isAnimationPaused || isAllTracksMuted ? 0 : Math.max(0, Math.min(1, audioLevel ?? 0));

  const containerClasses = [
    "waveform-container",
    isLive ? "live-regulated" : "css-animated",
    isAllTracksMuted ? "muted-tracks" : "",
    isAnimationPaused ? "is-paused" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={containerClasses}
      aria-hidden="true"
      role="img"
      aria-label="Audio waveform animation"
    >
      {BARS.map((bar) => {
        if (isLive) {
          // Calculate dynamic scale factor with resting baseline
          // When level is 0, resting baseline is ~0.10 (small pill dot)
          // When speech occurs, scale rises proportionally to volume
          const scale = isAllTracksMuted || isAnimationPaused
            ? 0.08
            : Math.max(0.10, Math.min(1.0, 0.10 + effectiveLevel * bar.weight * 0.90));

          const opacity = isAllTracksMuted || isAnimationPaused
            ? 0.25
            : Math.max(0.40, Math.min(1.0, 0.40 + effectiveLevel * 0.60));

          return (
            <div
              key={bar.id}
              className="wave-bar"
              style={{
                height: `${bar.height}px`,
                transform: `scaleY(${scale.toFixed(3)})`,
                opacity,
              }}
            />
          );
        }

        // Fallback CSS keyframe mode if no live telemetry stream is connected
        return (
          <div
            key={bar.id}
            className="wave-bar"
            style={{
              height: `${bar.height}px`,
              animationDelay: bar.delay,
              animationPlayState: isAnimationPaused ? "paused" : "running",
            }}
          />
        );
      })}
    </div>
  );
};

export default Waveform;
