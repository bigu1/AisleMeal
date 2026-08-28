"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export function DialogSheet({
  title,
  titleId,
  onClose,
  children,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      [...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.tabIndex !== -1 &&
          !el.closest("[hidden]"),
      );
    const first = focusables()[0];
    (first ?? panel)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={() => onCloseRef.current()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[80vh] max-w-md flex-col bg-[var(--color-surface)] outline-none"
        style={{
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -16px 40px rgba(26,36,32,0.20)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="border-b px-4 py-3"
          style={{ borderColor: "var(--color-line)" }}
        >
          <h2 id={titleId} className="text-base font-semibold text-[var(--color-text)]">
            {title}
          </h2>
        </div>
        {children}
      </div>
    </div>
  );
}
