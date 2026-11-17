import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Car, FileText, Home, Landmark, LogOut, Menu, Moon, Settings, Sun, Timer, User, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AddButton, AddProvider } from "./AddMenu";
import { CountBadge, MenuButton } from "./ui";

/** Seven areas ordered by how often they are used; details live in tabs inside each area. */
const NAV = [
  { to: "/", label: "Prehľad", icon: Home, segs: [""], worker: false },
  { to: "/doklady/kontrola", label: "Doklady", icon: FileText, segs: ["doklady", "doklad"], worker: false },
  { to: "/zakazky/naklady", label: "Zákazky", icon: Briefcase, segs: ["zakazky", "zakazka"], worker: false },
  { to: "/praca/hodiny", label: "Práca", icon: Timer, segs: ["praca"], worker: true },
  { to: "/financie/banka", label: "Financie", icon: Landmark, segs: ["financie", "pohyb", "podklad"], worker: false },
  { to: "/vozidla/zoznam", label: "Vozidlá", icon: Car, segs: ["vozidla", "vozidlo"], worker: false },
  { to: "/nastavenie/firmy", label: "Nastavenie", icon: Settings, segs: ["nastavenie"], worker: false },
] as const;

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const s = localStorage.getItem("naklady.theme");
      if (s) return s === "dark";
    } catch {
      /* ignore */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("naklady.theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

/** Numbers shown next to menu items; the same query feeds Prehľad. */
export function useDashboardCounts(enabled: boolean) {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<{ counts: Record<string, number>; new_files?: number }>("/api/dashboard"), enabled, staleTime: 30_000 });
  const counts = q.data?.counts ?? {};
  return { counts, files: (counts.file_errors ?? 0) + (q.data?.new_files ?? 0), review: counts.documents_in_review ?? 0, tasks: Object.values(counts).reduce((s, n) => s + (n || 0), 0) };
}

export function Layout() {
  const { me, company, companyId, switchCompany, logout, isAdmin } = useAuth();
  const [dark, setDark] = useTheme();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  const seg = loc.pathname.split("/")[1] ?? "";
  const { review, tasks } = useDashboardCounts(isAdmin && !!companyId);

  const nav = (
    <nav className="flex h-full flex-col gap-0.5 p-3" aria-label="Hlavné menu">
      {NAV.filter((n) => isAdmin || n.worker).map((n) => {
        const on = (n.segs as readonly string[]).includes(seg);
        const Icon = n.icon;
        return (
          <NavLink key={n.to} to={n.to} aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium ${on ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-700/30 dark:text-brand-100" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {n.label}
            {n.to === "/" && tasks > 0 && <CountBadge n={tasks} className="ml-auto" title="Čo treba vybaviť" />}
            {n.to === "/doklady/kontrola" && review > 0 && <CountBadge n={review} className="ml-auto" title="Doklady na kontrolu" />}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <AddProvider>
      <div className="flex h-full flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4 dark:border-slate-800 dark:bg-slate-900">
          <button className="btn-ghost btn-sm lg:hidden" onClick={() => setMenu(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden w-[196px] shrink-0 font-bold tracking-tight lg:block">Náklady zákaziek</div>
          <select className="input min-w-0 max-w-[46vw] py-1.5 font-semibold sm:w-auto" value={companyId ?? ""} title="Aktívna firma – všetko sa týka len nej"
            onChange={(e) => switchCompany(Number(e.target.value))} aria-label="Aktívna firma">
            {me?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (neaktívna)"}</option>)}
          </select>
          {company && !company.vat_payer && <span className="hidden text-xs text-slate-500 md:inline">neplatiteľ DPH</span>}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {companyId && <AddButton />}
            <MenuButton className="btn-ghost" ariaLabel="Používateľ" icon={<User className="h-4 w-4" />} label={<span className="hidden md:inline">{me?.name}</span>} items={[
              { label: dark ? "Svetlý režim" : "Tmavý režim", icon: dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, onClick: () => setDark(!dark) },
              "sep",
              { label: "Odhlásiť", icon: <LogOut className="h-4 w-4" />, onClick: () => void logout() },
            ]} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[216px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">{nav}</aside>
          {menu && (
            <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMenu(false)}>
              <aside className="h-full w-64 overflow-y-auto bg-white dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end p-2"><button className="btn-ghost btn-sm" onClick={() => setMenu(false)} aria-label="Zavrieť"><X className="h-5 w-5" /></button></div>
                {nav}
              </aside>
            </div>
          )}
          <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:px-7 lg:py-6">
            <div className="mx-auto max-w-[1320px]">
              {companyId || (isAdmin && seg === "nastavenie") ? <Outlet /> : (
                <div className="card p-6 text-sm">
                  Zatiaľ nie je založená žiadna firma.{" "}
                  {isAdmin ? <NavLink className="link" to="/nastavenie/firmy">Založte prvú firmu v Nastavenie → Firmy.</NavLink> : "Kontaktujte administrátora."}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </AddProvider>
  );
}
