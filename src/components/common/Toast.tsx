import React from "react";
import { CheckCircleIcon } from "./Icons";

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="custom-toast-container">
      <div className="custom-toast">
        <CheckCircleIcon size={16} className="toast-icon" />
        <span className="toast-text">{message}</span>
      </div>
    </div>
  );
};
