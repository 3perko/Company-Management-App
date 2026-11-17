import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DateInput } from "@/components/inputs";
import { Badge, Card, Empty, Modal, PageHeader, Spinner, useToast } from "@/components/ui";

interface Svc {
  service: string; label: string; url: string; has_api: boolean; note: string; recorded_valid_to: string | null;
  last_check: null | { checked_at: string; result: string; valid_to: string | null; matches: boolean | null; method: string; note: string | null };
}
export interface VRow { vehicle_id: number; name: string; plate: string | null; vin: string | null; services: Svc[] }
export interface FleetAlert { vehicle_id: number; vehicle: string; kind: string; severity: string; message: string }

export function useFleetAlerts() {
  return useQuery({ queryKey: ["fleet-alerts"], queryFn: () => api.get<FleetAlert[]>("/api/fleet/alerts") });
}
export function useFleetChecks() {
  return useQuery({ queryKey: ["fleet-checks"], queryFn: () => api.get<VRow[]>("/api/fleet/checks") });
}

const SEVERITY: Record<string, [string, "red" | "amber" | "gray"]> = { error: ["po termíne", "red"], missing: ["chýba údaj", "gray"] };

/** Approaching and passed deadlines; for one vehicle or for all of them. */
export function FleetAlerts({ vehicleId }: { vehicleId?: number }) {
  const alerts = useFleetAlerts();
  const list = (alerts.data ?? []).filter((a) => vehicleId === undefined || a.vehicle_id === vehicleId);
  if (alerts.isLoading) return <Spinner />;
  if (list.length === 0) return <p className="text-sm text-slate-500">Žiadne blížiace sa ani prekročené termíny.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {list.map((a, i) => {
        const [label, color] = SEVERITY[a.severity] ?? ["blíži sa", "amber"];
        return (
          <li key={i}>
            <Badge color={color}>{label}</Badge>{" "}
            {vehicleId === undefined ? <Link className="link font-medium" to={`/vozidlo/${a.vehicle_id}`}>{a.vehicle}</Link> : <b>{a.vehicle}</b>}: {a.message}
          </li>
        );
      })}
    </ul>
  );
}

/** Verification on public sites: open the site (plate is copied), then record the result. */
export function VehicleChecksTable({ v }: { v: VRow }) {
  const [rec, setRec] = useState<Svc | null>(null);
  const toast = useToast();
  const copyPlate = () => {
    if (!v.plate) return;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(v.plate).catch(() => undefined);
      toast.info(`ŠPZ ${v.plate} skopírovaná – vložte ju na overovacej stránke.`);
    } else toast.info(`ŠPZ na overenie: ${v.plate}`);
  };
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><th className="th">Čo</th><th className="th">Platnosť v evidencii</th><th className="th">Posledné overenie</th><th className="th">Výsledok</th><th className="th" /></tr></thead>
          <tbody>
            {v.services.map((s) => (
              <tr key={s.service}>
                <td className="td">{s.label}</td>
                <td className="td">{fmtDate(s.recorded_valid_to) || <span className="text-amber-600">neevidované</span>}</td>
                <td className="td">{s.last_check ? `${fmtDateTime(s.last_check.checked_at)} (${s.last_check.method === "api" ? "automaticky" : "ručne"})` : "–"}</td>
                <td className="td">{s.last_check && <>
                  <Badge color={s.last_check.result === "valid" ? "green" : s.last_check.result === "invalid" ? "red" : "gray"}>
                    {{ valid: "platné", invalid: "neplatné", unknown: "nezistené", error: "chyba" }[s.last_check.result] ?? s.last_check.result}</Badge>
                  {s.last_check.valid_to && ` do ${fmtDate(s.last_check.valid_to)} `}
                  {s.last_check.matches === false && <Badge color="red">nesedí s evidenciou</Badge>}
                  {s.last_check.matches === true && <Badge color="green">sedí</Badge>}
                </>}</td>
                <td className="td whitespace-nowrap text-right">
                  <a className="btn-secondary btn-sm" href={s.url} target="_blank" rel="noreferrer" title={s.note || "Otvorí overovaciu stránku a skopíruje ŠPZ"} onClick={copyPlate}>
                    <ExternalLink className="h-3.5 w-3.5" /> Overiť
                  </a>{" "}
                  <button className="btn-secondary btn-sm" onClick={() => setRec(s)}><Pencil className="h-3.5 w-3.5" /> Zapísať výsledok</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rec && <RecordModal v={v} s={rec} onClose={() => setRec(null)} />}
    </>
  );
}

/** Vozidlá → Termíny a overenie: all vehicles. */
export default function VehicleCheck() {
  const q = useFleetChecks();
  return (
    <div className="space-y-4">
      <PageHeader title="Termíny a overenie" sub="Overenie údajov podľa ŠPZ na verejných stránkach. Tlačidlo „Overiť“ otvorí stránku a skopíruje ŠPZ; výsledok potom zapíšte – porovná sa s evidenciou." />
      <Card title="Blížiace sa a prekročené termíny"><FleetAlerts /></Card>
      {q.isLoading ? <Spinner /> : q.data?.length === 0 ? <Empty>Firma nemá aktívne vozidlá.</Empty> : q.data?.map((v) => (
        <Card key={v.vehicle_id} title={<Link className="link" to={`/vozidlo/${v.vehicle_id}`}>{v.name} {v.plate ? `(${v.plate})` : ""}</Link>}>
          <VehicleChecksTable v={v} />
        </Card>
      ))}
    </div>
  );
}

function RecordModal({ v, s, onClose }: { v: VRow; s: Svc; onClose: () => void }) {
  const [result, setResult] = useState("valid");
  const [validTo, setValidTo] = useState<string | null>(s.recorded_valid_to);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const save = async () => {
    try {
      const r = await api.post<{ matches: boolean | null }>("/api/data/vehicle_checks", { vehicle_id: v.vehicle_id, service: s.service, result, valid_to: validTo, note });
      toast[r.matches === false ? "error" : "ok"](r.matches === false ? "Uložené – výsledok NESEDÍ s evidenciou, skontrolujte údaje vozidla." : "Uložené");
      await qc.invalidateQueries({ queryKey: ["fleet-checks"] });
      await qc.invalidateQueries({ queryKey: ["fleet-alerts"] });
      await qc.invalidateQueries({ queryKey: ["data", "vehicle_checks"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal open onClose={onClose} title={`${s.label} – ${v.name} ${v.plate ?? ""}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Zrušiť</button><button className="btn-primary" onClick={save}>Uložiť</button></>}>
      <div className="space-y-3">
        <div><label className="label">Výsledok overenia</label>
          <select className="input" value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="valid">platné</option><option value="invalid">neplatné</option><option value="unknown">nezistené</option>
          </select></div>
        <div><label className="label">Zistená platnosť do</label><DateInput value={validTo} onChange={setValidTo} /></div>
        <div><label className="label">Poznámka</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
