import { monthRange, yearRange } from "@/lib/format";
import { DateInput } from "./inputs";

export type Period = { from: string | null; to: string | null };

export function PeriodPicker({ value, onChange, allowAll = true }: {
  value: Period; onChange: (p: Period) => void; allowAll?: boolean;
}) {
  // the common periods first (one click), exact dates next to them
  const presets: [string, [string | null, string | null]][] = [["Tento mesiac", monthRange(0)], ["Minulý mesiac", monthRange(-1)], ["Tento rok", yearRange()]];
  if (allowAll) presets.push(["Celé obdobie", [null, null]]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700" role="group" aria-label="Obdobie">
        {presets.map(([label, r]) => {
          const on = (r[0] ?? null) === (value.from ?? null) && (r[1] ?? null) === (value.to ?? null);
          return (
            <button key={label} type="button" aria-pressed={on} onClick={() => onChange({ from: r[0], to: r[1] })}
              className={`border-r border-slate-300 px-2.5 py-1.5 text-sm last:border-r-0 dark:border-slate-700 ${on ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-700/30 dark:text-brand-100" : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
              {label}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-slate-500">alebo od</span>
      <div className="w-36"><DateInput value={value.from} onChange={(v) => onChange({ ...value, from: v })} /></div>
      <span className="text-xs text-slate-500">do</span>
      <div className="w-36"><DateInput value={value.to} onChange={(v) => onChange({ ...value, to: v })} /></div>
    </div>
  );
}

export function MonthPicker({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const shift = (d: number) => {
    const dt = new Date(year, month - 1 + d, 1);
    onChange(dt.getFullYear(), dt.getMonth() + 1);
  };
  const MONTHS = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
  return (
    <div className="flex items-center gap-2">
      <button className="btn-secondary btn-sm" onClick={() => shift(-1)} aria-label="Predchádzajúci mesiac">‹</button>
      <select className="input w-auto py-1" value={month} onChange={(e) => onChange(year, Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <input className="input w-20 py-1" type="number" value={year} onChange={(e) => onChange(Number(e.target.value), month)} />
      <button className="btn-secondary btn-sm" onClick={() => shift(1)} aria-label="Nasledujúci mesiac">›</button>
    </div>
  );
}
