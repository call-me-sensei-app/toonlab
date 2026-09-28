// Floating surfaces: Tooltip, Popover, Modal, Toasts. All render into the
// normal tree (no portals needed — the HUD root is already position:fixed
// over the canvas) and use fixed positioning with viewport clamping.

import {
  useEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import { Icon } from './Icon.jsx';
import { getCopy } from '../../../../src/i18n/locales.js';

// ---- Tooltip ---------------------------------------------------------------

export function Tooltip({ children, content, delay = 600, meta = null }) {
  const [at, setAt] = useState(null);
  const timer = useRef(0);

  if (!content) return children;
  return (
    <span
      style={{ display: 'contents' }}
      onPointerEnter={(event) => {
        const rect = event.target.getBoundingClientRect();
        timer.current = window.setTimeout(() => {
          setAt({
            x: Math.min(rect.left, window.innerWidth - 280),
            y: rect.bottom + 6,
          });
        }, delay);
      }}
      onPointerLeave={() => {
        window.clearTimeout(timer.current);
        setAt(null);
      }}
    >
      {children}
      {at && (
        <div className="tk-tooltip" style={{ left: at.x, top: at.y }}>
          {content}
          {meta && <div className="tk-tooltip-meta">{meta}</div>}
        </div>
      )}
    </span>
  );
}

// ---- Popover -----------------------------------------------------------------

/**
 * Anchored floating panel. `anchor` = {x, y} in viewport px; the popover
 * clamps itself on-screen and closes on Esc or outside pointerdown.
 */
export function Popover({
  anchor, children, onClose, testId, title = null, width = 280,
}) {
  const copy = getCopy();
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose]);

  const left = Math.min(Math.max(anchor.x + 14, 12), window.innerWidth - width - 12);
  const top = Math.min(Math.max(anchor.y - 10, 12), window.innerHeight - 260);

  return (
    <div ref={ref} className="tk-popover" data-testid={testId} style={{ left, top, width }}>
      {title && (
        <div className="tk-popover-header">
          {title}
          <button type="button" className="tk-icon-button" aria-label={copy.close} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

// ---- Modal -----------------------------------------------------------------------

export function Modal({
  children, dismissible = true, onClose, testId, title, width = 560,
}) {
  const copy = getCopy();
  useEffect(() => {
    const onKey = (event) => {
      if (dismissible && event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible, onClose]);

  return (
    <div
      className="tk-scrim"
      onPointerDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-modal="true"
        className="tk-modal"
        data-testid={testId}
        role="dialog"
        style={{ width: `min(${width}px, calc(100vw - 48px))` }}
      >
        <div className="tk-popover-header">
          <span className="tk-modal-title" style={{ margin: 0 }}>{title}</span>
          {dismissible && (
            <button type="button" className="tk-icon-button" aria-label={copy.close} onClick={onClose}>
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Toasts ------------------------------------------------------------------------
// Module-level bus so engines and stores can fire toasts without React
// context plumbing: `toast('Recipe copied', { tone: 'success' })`.

let toastId = 0;
let toasts = [];
const toastListeners = new Set();

function notifyToasts() {
  for (const listener of [...toastListeners]) listener();
}

export function toast(message, { tone = 'neutral', ttl = 3200 } = {}) {
  toastId += 1;
  const entry = { id: toastId, message, tone };
  toasts = [...toasts, entry];
  notifyToasts();
  window.setTimeout(() => {
    toasts = toasts.filter((candidate) => candidate.id !== entry.id);
    notifyToasts();
  }, ttl);
}

export function ToastStack() {
  const current = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    },
    () => toasts,
  );
  return (
    <div className="tk-toast-stack">
      {current.map((entry) => (
        <div key={entry.id} className="tk-toast" data-tone={entry.tone}>
          {entry.tone === 'success' && <Icon name="check" />}
          {entry.tone === 'danger' && <Icon name="warning" />}
          {entry.message}
        </div>
      ))}
    </div>
  );
}
