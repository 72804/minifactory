"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="mf-overlay" role="presentation" onClick={onClose}>
      <div
        className="mf-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function BottomSheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="mf-overlay" role="presentation" onClick={onClose}>
      <div
        className="mf-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function UpgradeSheet({
  open,
  remaining,
  onClose,
}: {
  open: boolean;
  remaining: number;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} title="Upgrade" onClose={onClose}>
      <p style={{ color: "var(--mf-muted)" }}>
        {remaining <= 0
          ? "You have used today's free allowance."
          : `${remaining} free actions remaining today.`}
      </p>
      <p>Paid unlocks and ad bonuses will be configured per Mini App.</p>
    </BottomSheet>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div className="mf-toast" role="status">
      {message}
    </div>
  );
}
