import type { ReactNode } from "react";

export function Win({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const padDots = Math.max(0, 30 - title.length);
  return (
    <div className="win">
      <div className="win-title">
        <span className="dots">▓▒░ </span>
        <span className="lbl">{title}</span>
        <span
          className="dots"
          style={{ flex: 1, textAlign: "center", opacity: 0.6 }}
        >
          {"░".repeat(padDots)}
        </span>
        <span className="btns">
          <span title="Minimize">_</span>
          <span title="Maximize">▢</span>
          <span title="Close">✕</span>
        </span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  );
}
