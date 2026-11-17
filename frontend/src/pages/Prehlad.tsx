import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNum, fmtPct, MONTHS } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { MonthPicker } from "@/components/PeriodPicker";
import { Card, CountBadge, Empty, PageHeader, Spinner, Stat } from "@/components/ui";

interface Dash {
  counts: Record<string, number>;
  projects?: { project_id: number; project_name: string; total: number; budget: number | null; remaining: number | null;
    budget_used_pct: number | null; labor: number; material: number; transport: number; hours: number; month_total: number; unconfirmed: number }[];
  new_files?: number;
}
type Any = Record<string, unknown>;
type MC = Record<string, Any[]>;

/** "10.11.2026 HORNBACH – 86,90 €", or "Doklad č. 7 – údaje treba doplniť" for a document nobody filled in yet. */
function docText(x: Any) {
  const who = [fmtDate(x.date), x.partner].filter(Boolean).join(" ");
  if (!who) return `Doklad č. ${x.id} – údaje treba doplniť`;
  return x.total_gross == null ? who : `${who} – ${fmtMoney(x.total_gross)}`;
}

/** The ten checks that used to live on Dashboard, Mesačná kontrola, Banka → Čo chýba, Overenie vozidla and Inbox. */
const CHECKS: { key: string; label: string; to: string; item: (x: Any) => { text: ReactNode; to?: string } }[] = [
  { key: "documents_in_review", label: "Doklady čakajúce na kontrolu", to: "/doklady/kontrola", item: (x) => ({ text: docText(x), to: `/doklad/${x.id}` }) },
  { key: "missing_recurring", label: "Chýbajúce povinné faktúry", to: "/nastavenie/opakujuce", item: (x) => ({ text: String(x.message) }) },
  { key: "receipts_without_original", label: "Bločky bez fyzického originálu", to: "/doklady/blocky", item: (x) => ({ text: docText(x), to: `/doklad/${x.id}` }) },
  { key: "material_without_document", label: "Nahlásený nákup materiálu bez dokladu", to: "/praca/hodiny", item: (x) => ({ text: String(x.message) }) },
  { key: "incomplete_timesheets", label: "Neúplné záznamy hodín", to: "/praca/hodiny", item: (x) => ({ text: `${fmtDate(x.date)} ${String(x.worker ?? "")} – chýba zákazka alebo čas`, to: "/praca/hodiny" }) },
  { key: "bank_without_document", label: "Bankové pohyby bez dokladu", to: "/financie/banka", item: (x) => ({ text: `${fmtDate(x.date)} ${String(x.counterparty ?? x.message ?? "")} ${fmtMoney(x.amount)}`, to: `/pohyb/${x.id}` }) },
  { key: "documents_without_payment", label: "Faktúry po splatnosti bez úhrady", to: "/financie/banka", item: (x) => ({ text: `${x.number ?? `#${x.id}`} ${x.partner ?? ""} – splatnosť ${fmtDate(x.due_date)}, ${fmtMoney(x.total_gross)}`, to: `/doklad/${x.id}` }) },
  { key: "amount_mismatches", label: "Nezhody v sume (banka)", to: "/financie/banka", item: (x) => ({ text: `${fmtDate(x.date)} ${String(x.counterparty ?? "")}: ${fmtMoney(x.amount)} vs. spárované ${fmtMoney(x.matched_amount)}`, to: x.id ? `/pohyb/${x.id}` : undefined }) },
  { key: "fleet_alerts", label: "Upozornenia na vozidlá", to: "/vozidla/terminy", item: (x) => ({ text: <><b>{String(x.vehicle)}</b>: {String(x.message)}</>, to: x.vehicle_id ? `/vozidlo/${x.vehicle_id}` : undefined }) },
  { key: "file_errors", label: "Chyby pri spracovaní súborov", to: "/doklady/subory", item: (x) => ({ text: `${String(x.name)}: ${String(x.error ?? "")}`, to: "/doklady/subory" }) },
];

export default function Prehlad() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { company } = useAuth();
  const nav = useNavigate();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dash>("/api/dashboard") });
  const mc = useQuery({ queryKey: ["monthly-check", ym], queryFn: () => api.get<MC>("/api/reports/monthly-check", { year: ym.y, month: ym.m }) });
  const projects = dash.data?.projects ?? [];
  const lists = CHECKS.map((c) => ({ ...c, items: mc.data?.[c.key] ?? [] }));
  const todo = lists.filter((c) => c.items.length > 0);
  const fine = lists.filter((c) => c.items.length === 0);
  const total = todo.reduce((s, c) => s + c.items.length, 0);
  const waiting = dash.data?.new_files ?? 0;
  return (
    <div>
      <PageHeader title="Prehľad" sub={`Čo treba vybaviť a ako sú na tom rozpracované zákazky firmy ${company?.name ?? ""}.`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Rozpracované zákazky" value={dash.isLoading ? "…" : projects.length} sub={<Link className="link" to="/zakazky/naklady">všetky zákazky</Link>} />
        <Stat label="Náklady rozpracovaných zákaziek" value={fmtMoney(projects.reduce((s, p) => s + p.total, 0))} />
        <Stat label="Náklady tento mesiac" value={fmtMoney(projects.reduce((s, p) => s + p.month_total, 0))} />
        <Stat label="Súbory čakajúce na spracovanie" value={waiting} sub={waiting ? <Link className="link" to="/doklady/subory">spracovať</Link> : "všetko spracované"} />
      </div>
      <div className="space-y-4">
        <Card title={<span className="flex items-center gap-2">Čo treba vybaviť {!mc.isLoading && <CountBadge n={total} />}</span>}
          actions={<MonthPicker year={ym.y} month={ym.m} onChange={(y, m) => setYm({ y, m })} />} className="[&>div:last-child]:p-0">
          {mc.isLoading ? <div className="p-4"><Spinner /></div> : (
            <>
              {todo.length === 0 && <Empty>Za {MONTHS[ym.m - 1]} {ym.y} je všetko vybavené.</Empty>}
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {todo.map((c) => (
                  <li key={c.key}>
                    <button type="button" aria-expanded={!!open[c.key]} onClick={() => setOpen({ ...open, [c.key]: !open[c.key] })}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span className="flex-1 font-medium">{c.label}</span>
                      <CountBadge n={c.items.length} />
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open[c.key] ? "rotate-180" : ""}`} />
                    </button>
                    {open[c.key] && (
                      <div className="space-y-1.5 px-4 pb-3 pl-11 text-sm">
                        {c.items.map((x, i) => {
                          const it = c.item(x);
                          return <div key={i}>{it.to ? <Link className="link" to={it.to}>{it.text}</Link> : it.text}</div>;
                        })}
                        <Link className="inline-block text-xs text-slate-500 hover:underline" to={c.to}>Otvoriť celý zoznam →</Link>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {fine.length > 0 && (
                <p className="flex items-start gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>V poriadku: {fine.map((c) => c.label.toLowerCase()).join(", ")}.</span>
                </p>
              )}
            </>
          )}
        </Card>
        <Card title="Rozpracované zákazky" actions={<Link className="link text-sm" to="/zakazky/naklady">Všetky zákazky →</Link>} className="[&>div:last-child]:p-0">
          {dash.isLoading ? <div className="p-4"><Spinner /></div> : projects.length === 0 ? <Empty>Žiadne rozpracované zákazky.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className="th">Zákazka</th><th className="th num">Hodiny</th><th className="th num">Práca</th><th className="th num">Materiál</th><th className="th num">Doprava</th>
                  <th className="th num">Spolu</th><th className="th num">Rozpočet</th><th className="th">Čerpanie</th><th className="th num">Tento mesiac</th>
                </tr></thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.project_id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => nav(`/zakazka/${p.project_id}`)}>
                      <td className="td"><Link className="link font-medium" to={`/zakazka/${p.project_id}`} onClick={(e) => e.stopPropagation()}>{p.project_name}</Link>
                        {p.unconfirmed > 0 && <div className="text-xs text-amber-600">+ {fmtMoney(p.unconfirmed)} v dokladoch na kontrolu</div>}</td>
                      <td className="td num">{fmtNum(p.hours)}</td><td className="td num">{fmtMoney(p.labor)}</td><td className="td num">{fmtMoney(p.material)}</td>
                      <td className="td num">{fmtMoney(p.transport)}</td><td className="td num font-semibold">{fmtMoney(p.total)}</td><td className="td num">{fmtMoney(p.budget)}</td>
                      <td className="td">{p.budget ? <BudgetBar pct={p.budget_used_pct ?? 0} /> : "–"}</td>
                      <td className="td num">{fmtMoney(p.month_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function BudgetBar({ pct }: { pct: number }) {
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full ${pct > 100 ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums">{fmtPct(pct)}</span>
    </div>
  );
}
