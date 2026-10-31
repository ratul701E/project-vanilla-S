import React from "react";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="error-banner">
      <span>⚠️ {message}</span>
      <button className="error-close-btn" onClick={onDismiss} title="Dismiss">
        ✕
      </button>
    </div>
  );
};
