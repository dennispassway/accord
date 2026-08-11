import { useCallback, useEffect, useRef, useState } from "react";
import "./toast.css";

const AUTO_DISMISS_MS = 3200;
/** U12: bulk-acties (bv. bulk-review-start) tonen soms meerdere toasts vlak na
 * elkaar; een enkel toast-slot overschreef de eerste voordat iemand hem kon
 * lezen. Een kleine stack lost dat op zonder library: max 3 zichtbaar, de
 * oudste verdwijnt eerst zodra een 4e toast binnenkomt. */
const MAX_TOASTS = 3;

export type ToastKind = "ok" | "fout";

export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

/** Voegt een toast toe aan de stack en snoeit 'm terug tot `max` door de
 * oudste(n) te laten vallen. Puur en los van React-state, dus direct
 * testbaar. */
export function pushToast(
  current: ToastItem[],
  toast: ToastItem,
  max = MAX_TOASTS,
): ToastItem[] {
  const next = [...current, toast];
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Een kleine toast-stack (max 3), onderin het venster, elke toast met een
 * eigen auto-dismiss na 3200ms (docs/design-v2/pr-cockpit-v2.dc.html, regel
 * 835-838). Een nieuwe toast stapelt bovenop de bestaande in plaats van ze te
 * vervangen; de oudste verdwijnt het eerst, zowel op tijd als bij overvol.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const showToast = useCallback((text: string, kind: ToastKind = "ok") => {
    const id = ++idRef.current;
    setToasts((current) => {
      const next = pushToast(current, { id, text, kind });
      // Bij overflow valt de oudste toast van de stack; die krijgt anders
      // nooit meer zijn eigen dismiss-timer opgeruimd (no-op setToasts later).
      for (const dropped of current) {
        if (next.includes(dropped)) continue;
        const timer = timersRef.current.get(dropped.id);
        if (timer != null) {
          clearTimeout(timer);
          timersRef.current.delete(dropped.id);
        }
      }
      return next;
    });
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  return { toasts, showToast };
}

interface ToastProps {
  toasts: ToastItem[];
}

/** Vangt geen focus en sluit niet op Escape: puur tijdelijke meldingen. */
export function Toast({ toasts }: ToastProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" role="status">
          <span className={`toast-dot toast-dot-${toast.kind}`} />
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
