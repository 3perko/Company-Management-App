import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Play, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { DataTable, useEntityMeta } from "@/components/DataTable";
import { EntityDrawer } from "@/components/EntityDrawer";
import { PageHeader, Spinner, useToast } from "@/components/ui";

interface UploadResult {
  stored: { file: string; new: boolean; requeued?: boolean; document_id: number | null }[];
  results: { file: string; status: string; document_id?: number; info?: string; source?: string }[];
}

const STATUS: Record<string, string> = { processed: "spracované", duplicate: "duplicita", error: "chyba" };
const isKnown = (s: UploadResult["stored"][number]) => !s.new && !s.requeued;

/** `bare` = without its own card and with a large drop zone (used inside the "Nahrať doklady" dialog). */
export function UploadBox({ kind = "auto", compact = false, bare = false, onDone }: { kind?: string; compact?: boolean; bare?: boolean; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [k, setK] = useState(kind);
  const [physical, setPhysical] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const send = async (files: FileList | File[]) => {
    if (!files.length) return;
    setBusy(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    fd.append("kind", k);
    fd.append("physical", String(physical));
    fd.append("note", note);
    try {
      const r = await api.upload<UploadResult>("/api/inbox/upload", fd);
      setResult(r);
      // files already known by hash that were not processed again (they still belong to an existing document)
      const known = r.stored.filter(isKnown).length;
      const taken = r.stored.length - known;
      if (!taken) toast.info(`Nič nové – ${known === 1 ? "súbor už je zaevidovaný" : `súbory už sú zaevidované (${known})`}`);
      else toast.ok(`Nahraté: ${taken}${known ? `, už zaevidované súbory: ${known}` : ""}`);
      onDone?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className={bare ? "" : `card ${compact ? "p-3" : "p-4"}`}>
      <div
        className={`flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed ${bare ? "justify-center p-6" : "p-3"} ${drag ? "border-brand-500 bg-brand-50 dark:bg-slate-800" : "border-slate-300 dark:border-slate-700"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void send(e.dataTransfer.files);
        }}>
        <button className={bare ? "btn-primary" : "btn-primary btn-sm"} onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <Upload className="h-4 w-4" />} {bare ? "Vybrať súbory" : "Nahrať doklady"}
        </button>
        <input ref={input} type="file" multiple hidden accept="image/*,application/pdf,.xml,.csv,.xlsx"
          onChange={(e) => e.target.files && send(e.target.files)} />
        <span className="text-xs text-slate-500">alebo sem potiahnite súbory (fotky, skeny, PDF)</span>
        {bare && <div className="basis-full" />}
        <select className="input w-auto py-1 text-sm" value={k} onChange={(e) => setK(e.target.value)} aria-label="Druh dokladu">
          <option value="auto">Rozpoznať automaticky</option>
          <option value="receipt">Bloček</option>
          <option value="invoice_in">Prijatá faktúra</option>
          <option value="invoice_out">Vystavená faktúra</option>
          <option value="bank">Bankový výpis</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-brand-600" checked={physical} onChange={(e) => setPhysical(e.target.checked)} /> sken fyzického originálu</label>
        {!compact && <input className="input w-56 py-1 text-sm" placeholder="Poznámka (napr. názov zákazky)" aria-label="Poznámka" value={note} onChange={(e) => setNote(e.target.value)} />}
      </div>
      {result && (result.results.length > 0 || result.stored.some(isKnown)) && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {result.stored.filter(isKnown).map((s, i) => (
            <li key={`known-${i}`}>
              <span className="font-medium">{s.file}</span>: súbor už je zaevidovaný, nič sa nezmenilo
              {s.document_id && <> – <Link className="link" to={`/doklad/${s.document_id}`}>otvoriť doklad #{s.document_id}</Link></>}
            </li>
          ))}
          {result.results.map((r, i) => (
            <li key={i}>
              <span className="font-medium">{r.file}</span>: {STATUS[r.status] ?? r.status}
              {r.document_id && <> – <Link className="link" to={`/doklad/${r.document_id}`}>otvoriť doklad #{r.document_id}</Link></>}
              {r.info && <span className="text-slate-500"> ({r.info})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Doklady → Prijaté súbory: everything that arrived from Drive, e-mail and manual upload. */
export default function Inbox() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const meta = useEntityMeta("source_files");
  const [running, setRunning] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const run = async () => {
    setRunning(true);
    try {
      const r = await api.post<{ processed: unknown[]; errors: string[]; drive: unknown; gmail: unknown }>("/api/inbox/run");
      toast.ok(`Spracované súbory: ${r.processed.length}${r.errors.length ? ` – chyby: ${r.errors.join("; ")}` : ""}`);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e);
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Prijaté súbory" sub="Sem prichádzajú súbory z Google Drive, e-mailu a ručného nahratia. Rovnaký súbor sa spracuje len raz; po vymazaní dokladu sa dá jeho súbor spracovať znova (nahrať ho ešte raz alebo označiť riadok a zvoliť „Spracovať znova“)."
        actions={<button className="btn-primary" onClick={run} disabled={running}>{running ? <Spinner /> : <Play className="h-4 w-4" />} Spracovať teraz</button>} />
      <DataTable entity="source_files" hideCreate onOpen={(r) => (r.document_id ? nav(`/doklad/${r.document_id}`) : setEdit(r.id))} />
      {meta.data && edit !== null && <EntityDrawer meta={meta.data} id={edit} open onClose={() => setEdit(null)} />}
    </div>
  );
}
