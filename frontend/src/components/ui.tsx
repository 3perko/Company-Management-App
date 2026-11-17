import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Loader2, X } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} aria-label="Načítavam" />;
}

export function Card({ title, actions, children, className = "" }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const badgeColors: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  blue: "bg-brand-100 text-brand-700 dark:bg-brand-700/40 dark:text-brand-100",
};

export function Badge({ color = "gray", children }: { color?: keyof typeof badgeColors; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${badgeColors[color]}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer, wide = false }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"} shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Zavrieť"><X className="h-4 w-4" /></button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, actions }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="truncate font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            {actions}
            <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Zavrieť"><X className="h-4 w-4" /></button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

// ----------------------------------------------------------------------------- toasts
type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`card flex items-start gap-2 px-3 py-2 text-sm shadow-lg ${t.kind === "error" ? "border-red-300" : ""}`}
            role="status"
          >
            {t.kind === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
            {t.kind === "error" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
            {t.kind === "info" && <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  return {
    ok: (t: string) => push("ok", t),
    error: (t: unknown) => push("error", t instanceof Error ? t.message : String(t)),
    info: (t: string) => push("info", t),
  };
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green" }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Inside a tabbed area the area renders the page title; pages placed in a tab show only their hint text and actions. */
const EmbeddedCtx = createContext<null | "tab" | "section">(null);
export function Embedded({ as = "tab", children }: { as?: "tab" | "section"; children: ReactNode }) {
  return <EmbeddedCtx.Provider value={as}>{children}</EmbeddedCtx.Provider>;
}

export function PageHeader({ title, actions, sub, back }: {
  title: ReactNode; actions?: ReactNode; sub?: ReactNode; back?: { to: string; label: string };
}) {
  const emb = useContext(EmbeddedCtx);
  if (emb) {
    if (emb === "tab" && !sub && !actions) return null;
    return (
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {emb === "section" && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
          {sub && <p className="max-w-3xl text-sm text-slate-500">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }
  return (
    <div className="mb-4">
      {back && <Link to={back.to} className="link mb-2 inline-flex items-center gap-1 text-sm"><ArrowLeft className="h-3.5 w-3.5" /> {back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {sub && <p className="mt-0.5 max-w-3xl text-sm text-slate-500">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- tabs
export interface TabItem<T extends string> { key: T; label: ReactNode; count?: number | null }

/** Tabs of one area (underlined) or a compact switch inside a tab (pills). */
export function Tabs<T extends string>({ items, value, onChange, pills = false, className = "" }: {
  items: TabItem<T>[]; value: T; onChange: (key: T) => void; pills?: boolean; className?: string;
}) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto overflow-y-hidden ${pills ? "mb-3" : "mb-4 border-b border-slate-200 dark:border-slate-800"} ${className}`}>
      {items.map((t) => {
        const on = t.key === value;
        const cls = pills
          ? `rounded-full border px-3 py-1 text-sm ${on ? "border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-700/30 dark:text-brand-100" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`
          : `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${on ? "border-brand-600 text-brand-700 dark:text-brand-100" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} className={`whitespace-nowrap ${cls}`} onClick={() => onChange(t.key)}>
            {t.label}
            {t.count != null && <CountBadge n={t.count} className="ml-1.5" />}
          </button>
        );
      })}
    </div>
  );
}

export function CountBadge({ n, className = "", title }: { n: number; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-block min-w-[20px] rounded-full px-1.5 text-center text-xs font-bold ${n ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"} ${className}`}>
      {n}
    </span>
  );
}

// ----------------------------------------------------------------------------- dropdown menu
export type MenuEntry = { label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | "sep" | { heading: string };

export function MenuButton({ label, icon, items, className = "btn-secondary", align = "right", ariaLabel, title }: {
  label?: ReactNode; icon?: ReactNode; items: MenuEntry[]; className?: string; align?: "left" | "right"; ariaLabel?: string; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="relative inline-block">
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} title={title} onClick={() => setOpen((o) => !o)}>
        {icon}{label}
      </button>
      {open && (
        <div role="menu" className={`absolute z-40 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900 ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((it, i) => {
            if (it === "sep") return <div key={i} className="my-1 h-px bg-slate-200 dark:bg-slate-800" />;
            if ("heading" in it) return <div key={i} className="px-2.5 pb-0.5 pt-1.5 text-xs text-slate-500">{it.heading}</div>;
            return (
              <button key={i} type="button" role="menuitem" disabled={it.disabled}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800 ${it.danger ? "text-red-600" : ""}`}
                onClick={() => { setOpen(false); it.onClick(); }}>
                {it.icon}{it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------- confirmation dialog (instead of window.confirm)
type Ask = { text: ReactNode; yes: string; danger: boolean; resolve: (ok: boolean) => void };
const ConfirmCtx = createContext<(text: ReactNode, yes?: string, danger?: boolean) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirm = useCallback((text: ReactNode, yes = "Potvrdiť", danger = true) =>
    new Promise<boolean>((resolve) => setAsk({ text, yes, danger, resolve })), []);
  const done = (ok: boolean) => { ask?.resolve(ok); setAsk(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!ask} onClose={() => done(false)} title="Potvrdenie"
        footer={<><button className="btn-secondary" onClick={() => done(false)}>Zrušiť</button>
          <button className={ask?.danger ? "btn-danger" : "btn-primary"} onClick={() => done(true)} autoFocus>{ask?.yes}</button></>}>
        <p className="text-sm">{ask?.text}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/** `const confirm = useConfirm(); if (!(await confirm("Naozaj vymazať?", "Vymazať"))) return;` */
export function useConfirm() {
  return useContext(ConfirmCtx);
}
