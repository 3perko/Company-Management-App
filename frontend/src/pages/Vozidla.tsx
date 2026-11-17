import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import type { Row } from "@/lib/types";
import { DataTable, useEntityMeta } from "@/components/DataTable";
import { EntityDrawer } from "@/components/EntityDrawer";
import { Badge, Card, Embedded, Empty, PageHeader, Spinner, Stat, Tabs } from "@/components/ui";
import VehicleCheck, { FleetAlerts, VehicleChecksTable, useFleetAlerts, useFleetChecks } from "./VehicleCheck";

const RECORDS = [
  { key: "vehicle_rates", label: "Sadzby €/km" }, { key: "vehicle_insurance", label: "PZP a poistenie" },
  { key: "vehicle_vignettes", label: "Diaľničné známky" }, { key: "vehicle_services", label: "Servis" },
  { key: "vehicle_checks", label: "Overenia" },
] as const;
type RecordKey = (typeof RECORDS)[number]["key"];

/** Vozidlá: list, deadlines across the fleet, and all records of all vehicles. */
export default function Vozidla() {
  const { tab = "zoznam" } = useParams();
  const nav = useNavigate();
  const [sub, setSub] = useState<RecordKey>("vehicle_rates");
  const alerts = useFleetAlerts();
  return (
    <div>
      <PageHeader title="Vozidlá" sub="Vozidlá firmy, ich sadzby, poistenie, známky, servis a termíny." />
      <Tabs value={tab} onChange={(t) => nav(`/vozidla/${t}`)} items={[
        { key: "zoznam", label: "Vozidlá" }, { key: "terminy", label: "Termíny a overenie", count: alerts.data?.length ?? null }, { key: "zaznamy", label: "Všetky záznamy" }]} />
      {tab === "zoznam" && <DataTable entity="vehicles" />}
      {tab === "terminy" && <Embedded><VehicleCheck /></Embedded>}
      {tab === "zaznamy" && (
        <div>
          <Tabs pills value={sub} onChange={setSub} items={RECORDS.map((r) => ({ key: r.key, label: r.label }))} />
          <p className="mb-3 text-sm text-slate-500">Záznamy všetkých vozidiel na jednom mieste. Záznamy jedného vozidla nájdete aj v jeho detaile.</p>
          <DataTable entity={sub} />
        </div>
      )}
    </div>
  );
}

function daysTo(d: string) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${d}T00:00:00`).getTime() - t.getTime()) / 864e5);
}
function DateStat({ label, date }: { label: string; date: unknown }) {
  const d = typeof date === "string" && date ? date : null;
  const n = d ? daysTo(d) : null;
  return <Stat label={label} value={d ? fmtDate(d) : "–"} sub={n === null ? "neevidované" : n < 0 ? `pred ${-n} dňami` : `o ${n} dní`} tone={n !== null && n < 0 ? "red" : undefined} />;
}

/** Everything about one vehicle. */
export function VehicleDetail() {
  const { id } = useParams();
  const vid = Number(id);
  const [tab, setTab] = useState<"terminy" | RecordKey | "trips">("terminy");
  const [edit, setEdit] = useState(false);
  const meta = useEntityMeta("vehicles");
  const q = useQuery({ queryKey: ["data", "vehicles", "row", vid], queryFn: () => api.get<Row>(`/api/data/vehicles/${vid}`), retry: false });
  const alerts = useFleetAlerts();
  const checks = useFleetChecks();
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <div><PageHeader title="Vozidlo" back={{ to: "/vozidla/zoznam", label: "Späť na vozidlá" }} /><Empty>Vozidlo neexistuje alebo patrí inej firme.</Empty></div>;
  const v = q.data;
  const mine = (alerts.data ?? []).filter((a) => a.vehicle_id === vid);
  const check = checks.data?.find((c) => c.vehicle_id === vid);
  const fixed = [{ field: "vehicle_id", op: "in", value: [vid] }];
  return (
    <div>
      <PageHeader back={{ to: "/vozidla/zoznam", label: "Späť na vozidlá" }}
        title={<span className="flex flex-wrap items-center gap-2">{String(v.name ?? "")} {v.plate ? <Badge>{String(v.plate)}</Badge> : null} {v.active === false && <Badge>neaktívne</Badge>}</span>}
        sub={[v.manufacturer, v.model, v.vin ? `VIN ${v.vin}` : null].filter(Boolean).join(" · ")}
        actions={<button className="btn-secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Upraviť vozidlo</button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sadzba €/km" value={fmtMoney(v.current_rate)} sub="aktuálna" />
        <DateStat label="STK" date={v.stk_valid_to} />
        <DateStat label="EK" date={v.ek_valid_to} />
        <Stat label="Tachometer" value={v.odometer != null ? `${fmtNum(v.odometer, 0)} km` : "–"} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { key: "terminy", label: "Termíny a overenie", count: mine.length },
        ...RECORDS.map((r) => ({ key: r.key as "terminy" | RecordKey | "trips", label: r.label })),
        { key: "trips", label: "Jazdy" }]} />
      {tab === "terminy" && (
        <div className="space-y-4">
          <Card title="Upozornenia"><FleetAlerts vehicleId={vid} /></Card>
          <Card title="Overenie na verejných stránkach">
            {checks.isLoading ? <Spinner /> : check ? <VehicleChecksTable v={check} /> : <p className="text-sm text-slate-500">Overenie je dostupné len pre aktívne vozidlá.</p>}
          </Card>
        </div>
      )}
      {tab === "trips" && <DataTable entity="trips" viewKey="trips:vehicle" fixedFilters={fixed} hideCreate />}
      {tab !== "terminy" && tab !== "trips" && <DataTable entity={tab} viewKey={`${tab}:vehicle`} fixedFilters={fixed} createDefaults={{ vehicle_id: vid }} />}
      {meta.data && <EntityDrawer meta={meta.data} id={vid} open={edit} onClose={() => setEdit(false)} />}
    </div>
  );
}
