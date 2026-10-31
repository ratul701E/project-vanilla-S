import React from "react";

/**
 * Highlights Bengali Unicode script (\u0980-\u09FF) in subtle golden badges
 * matching the design reference.
 */
export function renderBilingualText(text: string): React.ReactNode {
  const parts = text.split(/([\u0980-\u09FF\u0981-\u09FD]+(?:-[\w]+)?)/g);

  return parts.map((part, index) => {
    if (/[\u0980-\u09FF]/.test(part)) {
      return (
        <span key={index} className="bn-highlight">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
