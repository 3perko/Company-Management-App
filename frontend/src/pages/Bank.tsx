import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Check, Link2, RefreshCw, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtMoney } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { PeriodPicker, type Period } from "@/components/PeriodPicker";
import { NumberInput, RefSelect } from "@/components/inputs";
import { Badge, Card, Empty, PageHeader, Spinner, Tabs, useToast } from "@/components/ui";

interface Missing {
  transactions_without_document: { id: number; date: string; amount: number; counterparty: string | null; message: string | null; type: string; status: string }[];
  documents_without_payment: { id: number; doc_type: string; number: string | null; partner: string | null; issue_date: string; due_date: string | null; total_gross: number; paid_amount: number; overdue: boolean }[];
  amount_mismatches: { id: number; date: string; amount: number; matched_amount: number; counterparty: string | null }[];
}

export function BankPage() {
  const [tab, setTab] = useState<"tx" | "missing" | "statements" | "rules">("tx");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const upload = async (f: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api.upload<{ message: string }>("/api/bank/import", fd);
      toast.ok(r.message);
      await qc.invalidateQueries({ queryKey: ["data"] });
      await qc.invalidateQueries({ queryKey: ["bank-missing"] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const rematch = async () => {
    try {
      const r = await api.post<{ message: string }>("/api/bank/match");
      toast.ok(r.message);
      await qc.invalidateQueries({ queryKey: ["data"] });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Banka"
        sub="Výpisy: XML CAMT.053, CSV a XLSX podľa banky, PDF. Účet sa priradí firme podľa IBAN. Párovanie je automatické podľa variabilného symbolu, sumy, dátumu, IBAN-u a názvu; kliknutím na pohyb ho spárujete ručne."
        actions={<>
          <button className="btn-secondary" onClick={rematch}><RefreshCw className="h-4 w-4" /> Spárovať znova</button>
          <button className="btn-primary" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Spinner /> : <Upload className="h-4 w-4" />} Importovať výpis</button>
          <input ref={input} type="file" hidden accept=".xml,.csv,.xlsx,.pdf,.txt" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </>} />
      <Tabs pills value={tab} onChange={setTab} items={[
        { key: "tx", label: "Pohyby" }, { key: "missing", label: "Čo chýba" }, { key: "statements", label: "Importované výpisy" }, { key: "rules", label: "Pravidlá" }]} />
      {tab === "tx" && <DataTable entity="bank_transactions" hideCreate />}
      {tab === "missing" && <MissingReport />}
      {tab === "statements" && <DataTable entity="bank_statements" hideCreate />}
      {tab === "rules" && (
        <div>
          <p className="mb-3 text-sm text-slate-500">Pohyby, ktoré nepotrebujú doklad (poplatky, mzdy, odvody, prevody medzi vlastnými účtami), alebo ktorým sa má navrhnúť zákazka.</p>
          <DataTable entity="transaction_rules" />
        </div>
      )}
    </div>
  );
}

function MissingReport() {
  const [p, setP] = useState<Period>({ from: null, to: null });
  const q = useQuery({ queryKey: ["bank-missing", p], queryFn: () => api.get<Missing>("/api/bank/missing", { date_from: p.from, date_to: p.to }) });
  return (
    <div className="space-y-4">
      <PeriodPicker value={p} onChange={setP} />
      {q.isLoading || !q.data ? <Spinner /> : (
        <>
          <Card title={`Pohyby bez dokladu (${q.data.transactions_without_document.length})`}>
            {q.data.transactions_without_document.length === 0 ? <Empty>Všetky pohyby majú doklad.</Empty> : (
              <table className="w-full text-sm"><tbody>{q.data.transactions_without_document.map((t) => (
                <tr key={t.id}><td className="td">{fmtDate(t.date)}</td><td className="td"><Link className="link" to={`/pohyb/${t.id}`}>{t.counterparty || t.message || "—"}</Link></td>
                  <td className="td">{t.status === "suggested" ? <Badge color="amber">návrh</Badge> : t.type === "card" ? "kartou" : ""}</td>
                  <td className={`td num ${t.amount < 0 ? "text-red-600" : ""}`}>{fmtMoney(t.amount)}</td></tr>))}</tbody></table>
            )}
          </Card>
          <Card title={`Faktúry bez úhrady (${q.data.documents_without_payment.length})`}>
            {q.data.documents_without_payment.length === 0 ? <Empty>Žiadne neuhradené faktúry.</Empty> : (
              <table className="w-full text-sm"><tbody>{q.data.documents_without_payment.map((d) => (
                <tr key={d.id}><td className="td">{d.doc_type === "invoice_out" ? "vystavená" : "prijatá"}</td>
                  <td className="td"><Link className="link" to={`/doklad/${d.id}`}>{d.number ?? `#${d.id}`}</Link> {d.partner}</td>
                  <td className="td">splatnosť {fmtDate(d.due_date)} {d.overdue && <Badge color="red">po splatnosti</Badge>}</td>
                  <td className="td num">{fmtMoney(d.total_gross)}</td><td className="td num text-slate-500">uhradené {fmtMoney(d.paid_amount)}</td></tr>))}</tbody></table>
            )}
          </Card>
          <Card title={`Nezhody v sume (${q.data.amount_mismatches.length})`}>
            {q.data.amount_mismatches.length === 0 ? <Empty>Bez nezhôd.</Empty> : (
              <table className="w-full text-sm"><tbody>{q.data.amount_mismatches.map((m) => (
                <tr key={m.id}><td className="td">{fmtDate(m.date)}</td><td className="td"><Link className="link" to={`/pohyb/${m.id}`}>{m.counterparty}</Link></td>
                  <td className="td num">{fmtMoney(m.amount)}</td><td className="td num">spárované {fmtMoney(m.matched_amount)}</td></tr>))}</tbody></table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

interface TxDetail {
  id: number; booking_date: string; amount: number; currency: string; counterparty_name: string | null; counterparty_iban: string | null;
  vs: string | null; ss: string | null; ks: string | null; message: string | null; tx_type: string; status: string; matched_amount: number; note: string | null;
  matches: { id: number; document_id: number; amount: number; method: string; reason: string | null; confirmed: boolean;
    doc: { number: string | null; partner_name: string | null; doc_type: string; issue_date: string; total_gross: number } | null }[];
  candidates: { document_id: number; score: number; reason: string; number: string | null; partner_name: string | null; doc_type: string; issue_date: string; total_gross: number }[];
}

const TX_LABEL: Record<string, string> = { unmatched: "bez dokladu", suggested: "návrh párovania", matched: "spárovaný", no_document: "nepotrebuje doklad" };
const TX_COLOR: Record<string, "red" | "amber" | "green" | "gray"> = { unmatched: "red", suggested: "amber", matched: "green", no_document: "gray" };

export function BankTransactionDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["tx", id], queryFn: () => api.get<TxDetail>(`/api/bank/transactions/${id}`) });
  const [docId, setDocId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["tx", id] });
    await qc.invalidateQueries({ queryKey: ["data", "bank_transactions"] });
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.ok(msg);
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  };
  if (q.isLoading) return <Spinner />;
  const t = q.data!;
  return (
    <div className="space-y-4">
      <Link className="link inline-flex items-center gap-1 text-sm" to="/financie/banka"><ArrowLeft className="h-3 w-3" /> Späť na banku</Link>
      <PageHeader title={<span className="flex flex-wrap items-center gap-2">{fmtMoney(t.amount)} · {t.counterparty_name || t.message || "pohyb"} <Badge color={TX_COLOR[t.status] ?? "gray"}>{TX_LABEL[t.status] ?? t.status}</Badge></span>}
        sub={`${fmtDate(t.booking_date)} · VS ${t.vs ?? "–"} · ${t.counterparty_iban ?? ""}`}
        actions={<>
          <button className="btn-secondary" onClick={() => act(() => api.post(`/api/bank/transactions/${id}/no-document`, {}), "Označené – nepotrebuje doklad")}><Ban className="h-4 w-4" /> Nepotrebuje doklad</button>
          <button className="btn-secondary" onClick={() => act(() => api.post(`/api/bank/transactions/${id}/no-document`, { create_rule: true }), "Označené a uložené ako pravidlo – podobné pohyby sa nabudúce označia samy")}>…a zapamätať ako pravidlo</button>
        </>} />
      <Card title="Podrobnosti pohybu">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-4">
          <dt className="text-slate-500">Stav</dt><dd>{{ unmatched: "bez dokladu", suggested: "návrh", matched: "spárovaný", no_document: "nepotrebuje doklad" }[t.status]}</dd>
          <dt className="text-slate-500">Typ</dt><dd>{{ card: "platba kartou", transfer: "prevod", fee: "poplatok", other: "iné" }[t.tx_type]}</dd>
          <dt className="text-slate-500">Spárovaná suma</dt><dd>{fmtMoney(t.matched_amount)}</dd>
          <dt className="text-slate-500">SS / KS</dt><dd>{t.ss ?? "–"} / {t.ks ?? "–"}</dd>
          <dt className="text-slate-500">Správa</dt><dd className="col-span-3">{t.message}</dd>
        </dl>
      </Card>
      <Card title="Spárované doklady">
        {t.matches.length === 0 ? <p className="text-sm text-slate-500">Zatiaľ nespárované.</p> : (
          <table className="w-full text-sm"><tbody>{t.matches.map((m) => (
            <tr key={m.id}>
              <td className="td"><Link className="link" to={`/doklad/${m.document_id}`}>{m.doc?.number ?? `#${m.document_id}`}</Link> {m.doc?.partner_name}</td>
              <td className="td">{fmtDate(m.doc?.issue_date)}</td><td className="td num">{fmtMoney(m.amount)}</td>
              <td className="td">{m.confirmed ? <Badge color="green">{m.method === "auto" ? "automaticky" : "ručne"}</Badge> : <Badge color="amber">návrh</Badge>} <span className="text-xs text-slate-500">{m.reason}</span></td>
              <td className="td text-right whitespace-nowrap">
                {!m.confirmed && <button className="btn-secondary btn-sm" onClick={() => act(() => api.post(`/api/bank/matches/${m.id}/confirm`), "Potvrdené")}><Check className="h-3.5 w-3.5" /> Potvrdiť</button>}{" "}
                <button className="btn-ghost btn-sm text-red-600" onClick={() => act(() => api.del(`/api/bank/matches/${m.id}`), "Párovanie zrušené")}><Trash2 className="h-3.5 w-3.5" /></button>
              </td>
            </tr>))}</tbody></table>
        )}
      </Card>
      <Card title="Vhodné doklady (podľa VS, sumy, dátumu, IBAN-u a názvu)">
        {t.candidates.length === 0 ? <p className="text-sm text-slate-500">Žiadni vhodní kandidáti.</p> : (
          <table className="w-full text-sm"><tbody>{t.candidates.map((c) => (
            <tr key={c.document_id}>
              <td className="td"><Link className="link" to={`/doklad/${c.document_id}`}>{c.number ?? `#${c.document_id}`}</Link> {c.partner_name}</td>
              <td className="td">{fmtDate(c.issue_date)}</td><td className="td num">{fmtMoney(c.total_gross)}</td>
              <td className="td text-xs text-slate-500">zhoda: {c.reason} (skóre {c.score})</td>
              <td className="td text-right"><button className="btn-secondary btn-sm" onClick={() => act(() => api.post(`/api/bank/transactions/${id}/match`, { document_id: c.document_id }), "Spárované")}><Link2 className="h-3.5 w-3.5" /> Spárovať</button></td>
            </tr>))}</tbody></table>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="w-72 max-w-full"><label className="label">Iný doklad</label><RefSelect entity="documents" value={docId} onChange={setDocId} placeholder="číslo alebo dodávateľ" /></div>
          <div className="w-36"><label className="label">Suma (nepovinné)</label><NumberInput decimals={2} value={amount} onChange={setAmount} /></div>
          <button className="btn-secondary" disabled={!docId} onClick={() => act(async () => { await api.post(`/api/bank/transactions/${id}/match`, { document_id: docId, amount }); setDocId(null); }, "Spárované")}>Spárovať ručne</button>
        </div>
      </Card>
    </div>
  );
}
