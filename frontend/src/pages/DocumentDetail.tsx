import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Divide, FileText, MoreHorizontal, Paperclip, Plus, RotateCcw, Save, Trash2,
} from "lucide-react";
import { api, linkUrl } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import type { Option } from "@/lib/types";
import { DateInput, NumberInput, RefSelect, TimeInput } from "@/components/inputs";
import { Badge, Card, Empty, MenuButton, PageHeader, Spinner, useConfirm, useToast } from "@/components/ui";
import type { MenuEntry } from "@/components/ui";

interface Line { id?: number; tmp_id?: string; description: string | null; quantity: number | null; unit: string | null;
  unit_price: number | null; vat_rate: number | null; total_net: number | null; total_vat?: number | null; total_gross: number | null }
interface Alloc { line_ref: string | null; project_id: number | null; project_name?: string | null; amount_gross: number | null; billed?: boolean }
interface DocFull {
  id: number; status: string; doc_type: string; vat_payer: boolean; extraction_source: string; extraction_log: string | null;
  payment_status: string; paid_amount: number; duplicate_of_id: number | null; warnings: string[]; created_at: string;
  confirmed_at: string | null; mixed: boolean;
  partner_name: string | null; partner_ico: string | null; partner_dic: string | null; partner_ic_dph: string | null;
  partner_iban: string | null; partner_address: string | null; buyer_ico: string | null; customer_id: number | null;
  number: string | null; series_id: number | null; ekasa_id: string | null; issue_date: string | null; issue_time: string | null;
  due_date: string | null; tax_date: string | null; vs: string | null; currency: string; total_net: number | null;
  total_vat: number | null; total_gross: number | null; is_electronic: boolean; physical_original: boolean;
  physical_original_at: string | null; note: string | null; vat_breakdown: { rate: number | null; base: number; vat: number }[];
  lines: (Line & { id: number })[];
  allocations: { id: number; line_id: number | null; project_id: number; project_name: string; amount_gross: number; amount_net: number; billed: boolean }[];
  files: { id: number; name: string; mime: string; role: string; source: string; added_at: string }[];
  duplicates: { id: number; created_at: string }[];
  bank_matches: { id: number; transaction_id: number; amount: number; method: string; confirmed: boolean; date: string; counterparty: string }[];
}

const SRC: Record<string, string> = { ekasa: "eKasa (Finančná správa)", claude: "Claude API (čítanie obrázka)", pdf_text: "text z PDF + Claude API", manual: "ručné zadanie" };
const ROLE: Record<string, string> = { original: "originál", physical_scan: "sken fyzického originálu", duplicate: "duplicitný súbor" };
const TYPES: Record<string, string> = { receipt: "Bloček", invoice_in: "Prijatá faktúra", invoice_out: "Vystavená faktúra" };
const LIST_BY_TYPE: Record<string, string> = { receipt: "/doklady/blocky", invoice_in: "/doklady/prijate", invoice_out: "/doklady/vystavene" };
const REVIEW_LIST = "/doklady/kontrola";

/** `a.link` is styled only for anchors – the same look for buttons / summaries. */
const LINKISH = "text-brand-600 hover:underline dark:text-brand-100";

function splitEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.round(cents / n);
  const parts = Array(n).fill(base);
  parts[n - 1] = cents - base * (n - 1);
  return parts.map((c) => c / 100);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** The route component is reused when going from one document to the next (/doklad/5 → /doklad/6).
 *  Keying the page by the id guarantees a fresh mount, so no edit state of the previous document can leak. */
export default function DocumentDetail() {
  const { id } = useParams();
  return <DocumentDetailPage key={id} id={id ?? ""} />;
}

function BackLink({ to }: { to: string }) {
  return <Link className="link inline-flex items-center gap-1 text-sm" to={to}><ArrowLeft className="h-3 w-3" /> Späť na doklady</Link>;
}

function DocumentDetailPage({ id }: { id: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["doc", id], queryFn: () => api.get<DocFull>(`/api/documents/${id}/full`) });
  const [h, setH] = useState<Partial<DocFull>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [mixed, setMixed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const tmp = useRef(0);

  const load = (d: DocFull) => {
    setH(d);
    setLines(d.lines.map((l) => ({ ...l })));
    setMixed(d.allocations.some((a) => a.line_id));
    setAllocs(d.allocations.map((a) => ({ line_ref: a.line_id ? String(a.line_id) : null, project_id: a.project_id,
      project_name: a.project_name, amount_gross: a.amount_gross, billed: a.billed })));
    // keep the selected file after save / refetch; fall back to the first one
    setPreview((p) => (p !== null && d.files.some((f) => f.id === p) ? p : d.files[0]?.id ?? null));
  };
  useEffect(() => {
    if (q.data) load(q.data);
  }, [q.data]);

  const d = q.data;
  const total = Number(h.total_gross ?? 0);
  const lineKey = (l: Line) => (l.id ? String(l.id) : l.tmp_id!);
  const billed = allocs.some((a) => a.billed);

  const docAllocs = allocs.filter((a) => !a.line_ref);
  const docAllocSum = r2(docAllocs.reduce((s, a) => s + Number(a.amount_gross ?? 0), 0));
  const linesSum = r2(lines.reduce((s, l) => s + Number(l.total_gross ?? 0), 0));

  const setHeader = (k: keyof DocFull, v: unknown) => setH((o) => ({ ...o, [k]: v }));

  const lineAllocs = (l: Line) => allocs.filter((a) => a.line_ref === lineKey(l));
  const replaceLineAllocs = (l: Line, list: Alloc[]) =>
    setAllocs((all) => [...all.filter((a) => a.line_ref !== lineKey(l)), ...list]);

  const switchMode = (toMixed: boolean) => {
    if (billed) return;
    setMixed(toMixed);
    if (toMixed) {
      const proj = docAllocs[0]?.project_id ?? null;
      setAllocs(lines.map((l) => ({ line_ref: lineKey(l), project_id: proj, amount_gross: Number(l.total_gross ?? 0) })));
    } else {
      const proj = allocs[0]?.project_id ?? null;
      setAllocs(proj ? [{ line_ref: null, project_id: proj, amount_gross: total }] : []);
    }
  };

  const allocationProblems = useMemo(() => {
    const p: string[] = [];
    if (!mixed) {
      if (docAllocs.length && Math.abs(docAllocSum - total) > 0.02) p.push(`Súčet rozdelení ${fmtMoney(docAllocSum)} ≠ suma dokladu ${fmtMoney(total)}`);
    } else {
      for (const l of lines) {
        const s = r2(lineAllocs(l).reduce((x, a) => x + Number(a.amount_gross ?? 0), 0));
        if (Math.abs(s - Number(l.total_gross ?? 0)) > 0.02) p.push(`„${(l.description ?? "").slice(0, 30)}“: ${fmtMoney(s)} ≠ ${fmtMoney(l.total_gross)}`);
      }
    }
    if (!allocs.some((a) => a.project_id)) p.push("Nie je priradená žiadna zákazka.");
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocs, lines, mixed, total]);

  const payload = (confirmDoc: boolean) => ({
    header: {
      doc_type: h.doc_type, partner_name: h.partner_name, partner_ico: h.partner_ico, partner_dic: h.partner_dic,
      partner_ic_dph: h.partner_ic_dph, partner_iban: h.partner_iban, partner_address: h.partner_address, buyer_ico: h.buyer_ico,
      customer_id: h.customer_id, number: h.number, series_id: h.series_id, ekasa_id: h.ekasa_id, issue_date: h.issue_date,
      issue_time: h.issue_time, due_date: h.due_date, tax_date: h.tax_date, vs: h.vs, total_net: h.total_net,
      total_vat: h.total_vat, total_gross: h.total_gross, is_electronic: h.is_electronic, physical_original: h.physical_original,
      note: h.note,
    },
    ...(billed ? {} : {
      lines: lines.map((l) => ({ id: l.id, tmp_id: l.tmp_id, description: l.description, quantity: l.quantity, unit: l.unit,
        unit_price: l.unit_price, vat_rate: l.vat_rate, total_net: l.total_net, total_gross: l.total_gross })),
      allocations: allocs.filter((a) => a.project_id && (mixed ? a.line_ref : !a.line_ref))
        .map((a) => ({ line_ref: a.line_ref, project_id: a.project_id, amount_gross: a.amount_gross })),
    }),
    confirm: confirmDoc,
  });

  const save = async (confirmDoc: boolean, next = false) => {
    setBusy(true);
    try {
      const r = await api.put<DocFull>(`/api/documents/${id}/full`, payload(confirmDoc));
      qc.setQueryData(["doc", id], r);
      load(r);
      toast.ok(confirmDoc ? "Doklad potvrdený" : "Uložené");
      void qc.invalidateQueries({ queryKey: ["data", "documents"] });
      if (next) await goNext();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const goNext = async () => {
    const res = await api.get<{ rows: { id: number }[] }>("/api/data/documents", {
      filter: JSON.stringify([{ field: "status", op: "in", value: ["review"] }]), sort: "id:asc", columns: "status", page_size: 200,
    });
    const nextDoc = res.rows.find((r) => r.id > Number(id)) ?? res.rows.find((r) => r.id !== Number(id));
    if (nextDoc) nav(`/doklad/${nextDoc.id}`);
    else {
      toast.info("Žiadne ďalšie doklady na kontrolu.");
      nav(REVIEW_LIST);
    }
  };

  const skip = async () => {
    try {
      await goNext();
    } catch (e) {
      toast.error(e);
    }
  };

  const unconfirm = async () => {
    if (billed) return toast.error("Doklad je vyfakturovaný v uzavretom podklade a nedá sa vrátiť na kontrolu.");
    try {
      const r = await api.post<DocFull>(`/api/documents/${id}/unconfirm`);
      qc.setQueryData(["doc", id], r);
      load(r);
      void qc.invalidateQueries({ queryKey: ["data", "documents"] });
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (backTo: string) => {
    if (billed) return toast.error("Doklad je vyfakturovaný v uzavretom podklade a nedá sa vymazať.");
    if (!(await confirm("Naozaj vymazať doklad? Pôvodné súbory ostanú v prijatých súboroch a dajú sa spracovať znova.", "Vymazať"))) return;
    try {
      await api.del(`/api/data/documents/${id}`);
      toast.ok("Doklad vymazaný");
      void qc.invalidateQueries({ queryKey: ["data", "documents"] });
      nav(backTo);
    } catch (e) {
      toast.error(e);
    }
  };

  const attach = async (file: File, physical: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("physical", String(physical));
    try {
      const before = new Set((q.data?.files ?? []).map((f) => f.id));
      const r = await api.upload<DocFull>(`/api/documents/${id}/files`, fd);
      qc.setQueryData(["doc", id], r);
      load(r);
      const added = r.files.find((f) => !before.has(f.id));
      if (added) setPreview(added.id);
    } catch (e) {
      toast.error(e);
    }
  };

  const overhead = async () => {
    const opts = await api.get<Option[]>("/api/options/projects");
    const o = opts.find((x) => x.overhead);
    if (!o) return toast.error("Firma nemá zákazku Réžia.");
    setMixed(false);
    setAllocs([{ line_ref: null, project_id: o.value, project_name: o.label, amount_gross: total }]);
  };

  if (q.isLoading) return <Spinner />;
  if (!d) return <div className="space-y-4"><BackLink to={REVIEW_LIST} /><Empty>Doklad neexistuje.</Empty></div>;

  const file = d.files.find((f) => f.id === preview);
  const fileUrl = file ? linkUrl(`/api/files/${file.id}`) : null;
  const backTo = d.status === "review" ? REVIEW_LIST : LIST_BY_TYPE[d.doc_type] ?? REVIEW_LIST;
  const docType = h.doc_type ?? d.doc_type;
  const ready = allocationProblems.length === 0;

  const moreItems: MenuEntry[] = [
    ...(d.status === "confirmed"
      ? [{ label: "Vrátiť na kontrolu", icon: <RotateCcw className="h-4 w-4" />, onClick: () => void unconfirm() }]
      : []),
    { label: "Vymazať doklad", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => void remove(backTo) },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1"><BackLink to={backTo} /></div>
        <PageHeader
          title={<span className="flex flex-wrap items-center gap-2">{TYPES[docType]} {h.number || h.partner_name || `#${d.id}`}
            <Badge color={d.status === "confirmed" ? "green" : "amber"}>{d.status === "confirmed" ? "potvrdený" : "na kontrolu"}</Badge>
            {d.doc_type !== "receipt" && <Badge color={d.payment_status === "paid" ? "green" : d.payment_status === "partial" ? "amber" : "red"}>
              {d.payment_status === "paid" ? "uhradená" : d.payment_status === "partial" ? "čiastočne uhradená" : "neuhradená"}</Badge>}
            {billed && <Badge color="blue">vyfakturované</Badge>}
          </span>}
          sub={`Prijaté ${fmtDateTime(d.created_at)} · údaje: ${SRC[d.extraction_source] ?? d.extraction_source}`}
          actions={<>
            {d.status === "review" && <button className="btn-ghost" onClick={skip}>Preskočiť na ďalší <ChevronRight className="h-4 w-4" /></button>}
            <MenuButton label="Viac" icon={<MoreHorizontal className="h-4 w-4" />} items={moreItems} ariaLabel="Viac možností" />
          </>} />
      </div>

      {(d.warnings.length > 0 || d.duplicate_of_id) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
          {d.duplicate_of_id && <p>Tento doklad je duplicita k <Link className="link" to={`/doklad/${d.duplicate_of_id}`}>#{d.duplicate_of_id}</Link>.</p>}
          {d.warnings.map((w, i) => <p key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{w}</p>)}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-12">
        {/* ľavý stĺpec: náhľad a súbory */}
        <div className="min-w-0 space-y-4 xl:col-span-5">
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Náhľad</h2>
              {file && <span className="min-w-0 truncate text-xs text-slate-500">{file.name}</span>}
            </header>
            {!file && <Empty>Bez priloženého súboru</Empty>}
            {file && file.mime?.startsWith("image/") && <a href={fileUrl!} target="_blank" rel="noreferrer"><img src={fileUrl!} alt={file.name} className="max-h-[75vh] w-full object-contain" /></a>}
            {file && file.mime === "application/pdf" && <iframe title={file.name} src={fileUrl!} className="h-[75vh] w-full" />}
            {file && !file.mime?.startsWith("image/") && file.mime !== "application/pdf" &&
              <div className="p-4"><a className="link" href={linkUrl(`/api/files/${file.id}`, { download: true })}>Stiahnuť {file.name}</a></div>}
          </section>

          <Card title="Súbory">
            <div className="space-y-3 text-sm">
              {d.files.length === 0 ? <p className="text-slate-500">Žiadne súbory.</p> : (
                <ul className="space-y-1">
                  {d.files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <button type="button" className={`min-w-0 truncate text-left ${f.id === preview ? "font-semibold" : LINKISH}`}
                        aria-current={f.id === preview ? "true" : undefined} onClick={() => setPreview(f.id)}>{f.name}</button>
                      <span className="text-xs text-slate-500">{ROLE[f.role] ?? f.role} · {fmtDateTime(f.added_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="btn-secondary btn-sm cursor-pointer"><Paperclip className="h-3.5 w-3.5" /> Priložiť súbor
                  <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], false)} /></label>
                {d.doc_type === "receipt" && <label className="btn-secondary btn-sm cursor-pointer"><Paperclip className="h-3.5 w-3.5" /> Priložiť sken originálu
                  <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], true)} /></label>}
              </div>
              {d.extraction_log && (
                <details className="text-xs text-slate-600 dark:text-slate-400">
                  <summary className="cursor-pointer text-sm text-slate-500">Ako sa doklad spracoval</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans">{d.extraction_log}</pre>
                </details>
              )}
              {d.duplicates.length > 0 && (
                <div><span className="font-medium">Duplicitné záznamy:</span>{" "}
                  {d.duplicates.map((x) => <Link key={x.id} className="link mr-2" to={`/doklad/${x.id}`}>#{x.id}</Link>)}</div>
              )}
              {d.bank_matches.length > 0 && (
                <div>
                  <div className="mb-1 font-medium">Úhrady z banky</div>
                  {d.bank_matches.map((m) => (
                    <div key={m.id}><Link className="link" to={`/pohyb/${m.transaction_id}`}>{fmtDate(m.date)} {m.counterparty}</Link> – {fmtMoney(m.amount)} {!m.confirmed && <Badge color="amber">návrh</Badge>}</div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* pravý stĺpec: údaje */}
        <div className="min-w-0 space-y-4 xl:col-span-7">
          <Card title="Základné údaje">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="col-span-2 md:col-span-1">
                <label className="label">Typ dokladu</label>
                <select className="input" value={h.doc_type ?? "receipt"} onChange={(e) => setHeader("doc_type", e.target.value)} disabled={billed}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">{h.doc_type === "invoice_out" ? "Odberateľ" : "Dodávateľ / obchod"}</label>
                <input className="input" value={h.partner_name ?? ""} onChange={(e) => setHeader("partner_name", e.target.value)} />
              </div>
              <div className="col-span-2 md:col-span-1"><label className="label">{h.doc_type === "receipt" ? "Číslo bločku" : "Číslo faktúry"}</label><input className="input" value={h.number ?? ""} onChange={(e) => setHeader("number", e.target.value)} /></div>
              <div><label className="label">Dátum</label><DateInput value={h.issue_date} onChange={(v) => setHeader("issue_date", v)} /></div>
              <div><label className="label">Spolu s DPH</label><NumberInput decimals={2} suffix="€" value={h.total_gross} onChange={(v) => setHeader("total_gross", v)} /></div>
              <div><label className="label">Základ</label><NumberInput decimals={2} suffix="€" value={h.total_net} onChange={(v) => setHeader("total_net", v)} /></div>
              <div><label className="label">DPH</label><NumberInput decimals={2} suffix="€" value={h.total_vat} onChange={(v) => setHeader("total_vat", v)} /></div>
            </div>
            {d.vat_breakdown.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">DPH: {d.vat_breakdown.map((v) => `${v.rate ?? "?"} %: základ ${fmtMoney(v.base)}, daň ${fmtMoney(v.vat)}`).join(" · ")}</p>
            )}

            <details className="mt-3" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
              <summary className={`cursor-pointer select-none text-sm font-medium ${LINKISH}`}>Ďalšie údaje (IČO, IBAN, splatnosť, poznámka…)</summary>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div><label className="label">IČO partnera</label><input className="input" value={h.partner_ico ?? ""} onChange={(e) => setHeader("partner_ico", e.target.value)} /></div>
                <div><label className="label">IČ DPH partnera</label><input className="input" value={h.partner_ic_dph ?? ""} onChange={(e) => setHeader("partner_ic_dph", e.target.value)} /></div>
                <div className="col-span-2"><label className="label">IBAN partnera</label><input className="input" value={h.partner_iban ?? ""} onChange={(e) => setHeader("partner_iban", e.target.value)} /></div>
                <div><label className="label">IČO odberateľa na doklade</label><input className="input" value={h.buyer_ico ?? ""} onChange={(e) => setHeader("buyer_ico", e.target.value)} /></div>
                {h.doc_type === "receipt" ? (
                  <div className="col-span-2"><label className="label">ID dokladu eKasa</label><input className="input font-mono text-xs" value={h.ekasa_id ?? ""} onChange={(e) => setHeader("ekasa_id", e.target.value)} placeholder="O-…" /></div>
                ) : (
                  <>
                    <div><label className="label">VS (variabilný symbol)</label><input className="input" value={h.vs ?? ""} onChange={(e) => setHeader("vs", e.target.value)} /></div>
                    {h.doc_type === "invoice_out" && <>
                      <div className="col-span-2"><label className="label">Odberateľ (číselník)</label><RefSelect entity="customers" value={h.customer_id} onChange={(v) => setHeader("customer_id", v)} /></div>
                      <div className="col-span-2"><label className="label">Číselný rad</label><RefSelect entity="invoice_series" value={h.series_id} onChange={(v) => setHeader("series_id", v)} /></div>
                    </>}
                  </>
                )}
                <div><label className="label">Čas</label><TimeInput value={h.issue_time} onChange={(v) => setHeader("issue_time", v)} /></div>
                {h.doc_type !== "receipt" && <>
                  <div><label className="label">Splatnosť</label><DateInput value={h.due_date} onChange={(v) => setHeader("due_date", v)} /></div>
                  <div><label className="label">Dátum DPH</label><DateInput value={h.tax_date} onChange={(v) => setHeader("tax_date", v)} /></div>
                </>}
                <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:col-span-4">
                  {h.doc_type === "receipt" && <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-600" checked={!!h.physical_original} onChange={(e) => setHeader("physical_original", e.target.checked)} /> fyzický originál je založený</label>}
                  <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-600" checked={!!h.is_electronic} onChange={(e) => setHeader("is_electronic", e.target.checked)} /> elektronický doklad</label>
                </div>
                <div className="col-span-2 md:col-span-4"><label className="label">Poznámka</label><input className="input" value={h.note ?? ""} onChange={(e) => setHeader("note", e.target.value)} /></div>
              </div>
            </details>
          </Card>

          <Card title={`Položky (${lines.length})`} actions={!billed && (
            <button className="btn-secondary btn-sm" onClick={() => {
              tmp.current += 1;
              setLines([...lines, { tmp_id: `t${tmp.current}`, description: "", quantity: 1, unit: null, unit_price: null, vat_rate: 23, total_net: null, total_gross: null }]);
            }}><Plus className="h-3.5 w-3.5" /> Pridať položku</button>
          )}>
            {lines.length === 0 ? <p className="text-sm text-slate-500">Doklad nemá položky – priradí sa k zákazke ako celok.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="th">Názov</th><th className="th w-20 text-right">Množstvo</th><th className="th w-20 text-right">DPH %</th><th className="th w-28 text-right">Spolu s DPH</th><th className="th w-8" /></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={lineKey(l)}>
                        <td className="td"><input className="input min-w-[160px] py-1" aria-label="Názov položky" value={l.description ?? ""} disabled={billed}
                          onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></td>
                        <td className="td"><NumberInput value={l.quantity} disabled={billed} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: v } : x)))} /></td>
                        <td className="td"><NumberInput value={l.vat_rate} disabled={billed} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, vat_rate: v, total_net: null } : x)))} /></td>
                        <td className="td"><NumberInput decimals={2} value={l.total_gross} disabled={billed} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, total_gross: v, total_net: null } : x)))} /></td>
                        <td className="td">{!billed && <button className="text-slate-400 hover:text-red-600" aria-label="Odstrániť položku" onClick={() => {
                          setAllocs(allocs.filter((a) => a.line_ref !== lineKey(l)));
                          setLines(lines.filter((_, j) => j !== i));
                        }}><Trash2 className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td className="td text-right text-xs text-slate-500" colSpan={3}>Súčet položiek</td>
                    <td className={`td num font-semibold ${Math.abs(linesSum - total) > 0.02 ? "text-red-600" : ""}`}>{fmtMoney(linesSum)}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card title="Ku ktorej zákazke patrí" actions={<>
            {lines.length > 0 && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-brand-600" checked={mixed} disabled={billed} onChange={(e) => switchMode(e.target.checked)} />
                rozdeliť po položkách
              </label>
            )}
            {!billed && d.doc_type !== "invoice_out" && <button className="btn-secondary btn-sm" onClick={overhead}>Celý doklad do Réžie</button>}
          </>}>
            {!mixed ? (
              <AllocList allocs={docAllocs} total={total} disabled={billed}
                onChange={(list) => setAllocs(list.map((a) => ({ ...a, line_ref: null })))} />
            ) : (
              <div className="space-y-2">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-500">Všetky položky naraz na:</span>
                  <div className="w-64 max-w-full"><RefSelect entity="projects" value={null} placeholder="vybrať zákazku" label=""
                    onChange={(v) => v && setAllocs(lines.map((l) => ({ line_ref: lineKey(l), project_id: v, amount_gross: Number(l.total_gross ?? 0) })))} /></div>
                </div>
                {lines.map((l) => (
                  <div key={lineKey(l)} className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                    <div className="mb-1.5 flex justify-between gap-2 text-sm"><span className="min-w-0 font-semibold">{l.description || "(bez názvu)"}</span><span className="shrink-0 tabular-nums">{fmtMoney(l.total_gross)}</span></div>
                    <AllocList allocs={lineAllocs(l)} total={Number(l.total_gross ?? 0)} disabled={billed} small
                      onChange={(list) => replaceLineAllocs(l, list.map((a) => ({ ...a, line_ref: lineKey(l) })))} />
                  </div>
                ))}
              </div>
            )}
            {allocationProblems.length > 0 && (
              <ul className="mt-3 space-y-0.5 text-sm text-amber-700 dark:text-amber-400">
                {allocationProblems.map((p, i) => <li key={i}>• {p}</li>)}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">Zadávate sumy s DPH. Do nákladov zákazky sa počíta suma {d.vat_payer ? "bez DPH (firma je platiteľ DPH)" : "s DPH (firma nie je platiteľ DPH)"}. Priradiť sa dajú len zákazky aktívnej firmy.</p>
          </Card>
        </div>
      </div>

      {/* lepiaca lišta s akciami – ostáva viditeľná pri rolovaní */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-[0_-4px_14px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-900">
        <span role="status" className={`min-w-0 flex-1 basis-48 text-sm ${ready ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
          {ready ? "Pripravené na potvrdenie." : `Pred potvrdením: ${allocationProblems[0]}`}
        </span>
        <button className="btn-secondary" onClick={() => save(false)} disabled={busy}><Save className="h-4 w-4" /> Uložiť</button>
        <button className="btn-primary" onClick={() => save(true, d.status === "review")} disabled={busy}>
          {busy ? <Spinner /> : <CheckCircle2 className="h-4 w-4" />} {d.status === "review" ? "Potvrdiť a ďalší" : "Uložiť a potvrdiť"}
        </button>
      </div>
    </div>
  );
}

function AllocList({ allocs, total, onChange, disabled, small }: {
  allocs: Alloc[]; total: number; onChange: (a: Alloc[]) => void; disabled?: boolean; small?: boolean;
}) {
  const sum = r2(allocs.reduce((s, a) => s + Number(a.amount_gross ?? 0), 0));
  const even = () => {
    const parts = splitEven(total, allocs.length);
    onChange(allocs.map((a, i) => ({ ...a, amount_gross: parts[i] })));
  };
  return (
    <div className="space-y-1.5">
      {allocs.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1"><RefSelect entity="projects" value={a.project_id} label={a.project_name ?? undefined} disabled={disabled}
            onChange={(v, o) => onChange(allocs.map((x, j) => (j === i ? { ...x, project_id: v, project_name: o?.label ?? null } : x)))} /></div>
          <div className={small ? "w-28" : "w-36"}><NumberInput decimals={2} suffix="€" value={a.amount_gross} disabled={disabled}
            onChange={(v) => onChange(allocs.map((x, j) => (j === i ? { ...x, amount_gross: v } : x)))} /></div>
          <span className="w-14 text-right text-xs tabular-nums text-slate-500">{total ? `${fmtNum((Number(a.amount_gross ?? 0) / total) * 100, 1)} %` : ""}</span>
          {!disabled && <button className="text-slate-400 hover:text-red-600" aria-label="Odobrať" onClick={() => onChange(allocs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary btn-sm" onClick={() => {
            const rest = r2(total - sum);
            onChange([...allocs, { line_ref: null, project_id: null, amount_gross: allocs.length ? Math.max(rest, 0) : total }]);
          }}><Plus className="h-3.5 w-3.5" /> Pridať zákazku</button>
          {allocs.length > 1 && <button className="btn-secondary btn-sm" onClick={even}><Divide className="h-3.5 w-3.5" /> Rozdeliť rovnomerne</button>}
          <span className={`ml-auto text-xs tabular-nums ${Math.abs(sum - total) > 0.02 && allocs.length ? "text-red-600" : "text-slate-500"}`}>
            rozdelené {fmtMoney(sum)} z {fmtMoney(total)}
          </span>
        </div>
      )}
    </div>
  );
}
