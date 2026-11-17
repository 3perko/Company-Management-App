import { NavLink, useParams } from "react-router-dom";
import { Embedded, PageHeader } from "@/components/ui";
import { EntityListPage } from "./EntityListPage";
import { Integrations, Parameters } from "./Settings";

type Item = { key: string; label: string; entity?: string; sub?: string };
/** Things that are set up once: former Číselníky and Nastavenia in one place. */
const GROUPS: { label: string; items: Item[] }[] = [
  { label: "Firma", items: [
    { key: "firmy", label: "Firmy", entity: "companies", sub: "Každá firma má vlastné doklady, zákazky, DPH a Réžiu. Pri založení firmy sa automaticky vytvorí zákazka Réžia. V detaile firmy nastavíte aj priečinky Google Drive a e-mailové značky." },
    { key: "ucty", label: "Bankové účty", entity: "bank_accounts", sub: "Účty aktívnej firmy. Podľa IBAN-u sa importovaný výpis priradí firme." },
    { key: "rady", label: "Číselné rady faktúr", entity: "invoice_series", sub: "Predpony čísel vystavených faktúr." },
  ] },
  { label: "Ľudia", items: [
    { key: "pracovnici", label: "Pracovníci", entity: "workers", sub: "Pracovník môže pracovať pre viac firiem; jeho hodiny sa evidujú vo firme zákazky." },
    { key: "sadzby", label: "Sadzby pracovníkov", entity: "worker_rates", sub: "Použije sa najpresnejšia platná sadzba: pre zákazku → pre firmu → všeobecná sadzba pracovníka. K hodinám sa sadzba zafixuje pri zadaní." },
    { key: "pouzivatelia", label: "Používatelia a prístupy", entity: "users", sub: "Kto sa môže prihlásiť. Pracovník vidí len svoje hodiny, jazdy a výkaz; správca všetko." },
  ] },
  { label: "Partneri", items: [
    { key: "odberatelia", label: "Odberatelia", entity: "customers", sub: "Komu fakturujete." },
    { key: "opakujuce", label: "Opakujúce sa faktúry", entity: "recurring_rules", sub: "Pravidelné faktúry (telefón, energie, poistenie). Idú do Réžie; ak v mesiaci chýbajú, Prehľad na to upozorní." },
  ] },
  { label: "Systém", items: [
    { key: "parametre", label: "Predvolené hodnoty" },
    { key: "integracie", label: "Prepojenia" },
    { key: "historia", label: "História zmien", entity: "audit_log", sub: "Kto, kedy a čo zmenil." },
  ] },
];

export default function Nastavenie() {
  const { sec = "firmy" } = useParams();
  const cur = GROUPS.flatMap((g) => g.items).find((i) => i.key === sec) ?? GROUPS[0].items[0];
  return (
    <div>
      <PageHeader title="Nastavenie" sub="Veci, ktoré sa nastavia raz a menia len občas." />
      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Nastavenie" className="card h-fit p-2 lg:sticky lg:top-0">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
              {g.items.map((i) => (
                <NavLink key={i.key} to={`/nastavenie/${i.key}`}
                  className={`block rounded-md px-2 py-1.5 text-sm ${i.key === cur.key ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-700/30 dark:text-brand-100" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          <Embedded as="section">
            {cur.key === "parametre" ? <Parameters /> : cur.key === "integracie" ? <Integrations />
              : <EntityListPage key={cur.key} entity={cur.entity!} title={cur.label} sub={cur.sub} />}
          </Embedded>
        </div>
      </div>
    </div>
  );
}
