import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FilePlus2, ScanLine, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { Filter, Row, ViewConfig } from "@/lib/types";
import { useAdd } from "@/components/AddMenu";
import { DataTable } from "@/components/DataTable";
import { useDashboardCounts } from "@/components/Layout";
import { Embedded, PageHeader, Tabs } from "@/components/ui";
import Inbox from "./Inbox";

type DocTab = "kontrola" | "blocky" | "prijate" | "vystavene" | "vsetky";
const TABLES: Record<DocTab, { viewKey: string; filters: Filter[]; initial: ViewConfig; kind?: "receipt" | "invoice_in" | "invoice_out" }> = {
  kontrola: { viewKey: "documents:review", filters: [{ field: "status", op: "in", value: ["review"] }],
    initial: { columns: ["doc_type", "issue_date", "partner_name", "total_gross", "projects", "extraction_source", "has_warnings", "file_name"], sort: [{ key: "id", dir: "asc" }] } },
  blocky: { viewKey: "documents:receipt", kind: "receipt", filters: [{ field: "doc_type", op: "in", value: ["receipt"] }],
    initial: { columns: ["issue_date", "issue_time", "partner_name", "total_gross", "projects", "status", "extraction_source", "physical_original"] } },
  prijate: { viewKey: "documents:invoice_in", kind: "invoice_in", filters: [{ field: "doc_type", op: "in", value: ["invoice_in"] }],
    initial: { columns: ["issue_date", "number", "partner_name", "due_date", "total_gross", "projects", "status", "payment_status"] } },
  vystavene: { viewKey: "documents:invoice_out", kind: "invoice_out", filters: [{ field: "doc_type", op: "in", value: ["invoice_out"] }],
    initial: { columns: ["issue_date", "number", "partner_name", "total_net", "total_gross", "projects", "status", "payment_status"] } },
  vsetky: { viewKey: "documents:all", filters: [],
    initial: { columns: ["doc_type", "issue_date", "number", "partner_name", "total_gross", "projects", "status", "payment_status"] } },
};

/** Doklady: one screen, tabs are the same list with a different filter. */
export default function Doklady() {
  const { tab = "kontrola" } = useParams();
  const nav = useNavigate();
  const add = useAdd();
  const [sub, setSub] = useState<"allocations" | "document_lines">("allocations");
  const { files, review } = useDashboardCounts(true);
  const table = TABLES[tab as DocTab];
  return (
    <div>
      <PageHeader title="Doklady" sub="Bločky a faktúry. Do prehľadov sa započítajú až potvrdené doklady."
        actions={<>
          <button className="btn-secondary" onClick={add.quickCheck}><ScanLine className="h-4 w-4" /> Skontrolovať bloček</button>
          <button className="btn-secondary" onClick={() => add.manualDocument(table?.kind)}><FilePlus2 className="h-4 w-4" /> Zadať ručne</button>
          <button className="btn-primary" onClick={() => add.upload(table?.kind ?? "auto")}><Upload className="h-4 w-4" /> Nahrať doklady</button>
        </>} />
      <Tabs value={tab} onChange={(t) => nav(`/doklady/${t}`)} items={[
        { key: "kontrola", label: "Na kontrolu", count: review }, { key: "blocky", label: "Bločky" }, { key: "prijate", label: "Prijaté faktúry" },
        { key: "vystavene", label: "Vystavené faktúry" }, { key: "vsetky", label: "Všetky" }, { key: "polozky", label: "Položky a priradenia" },
        { key: "subory", label: "Prijaté súbory", count: files || null }]} />
      {table && <DataTable entity="documents" viewKey={table.viewKey} hideCreate fixedFilters={table.filters} initial={table.initial} />}
      {tab === "polozky" && (
        <div>
          <Tabs pills value={sub} onChange={setSub} items={[{ key: "allocations", label: "Priradenia k zákazkám" }, { key: "document_lines", label: "Položky dokladov" }]} />
          <p className="mb-3 text-sm text-slate-500">{sub === "allocations" ? "Každý riadok je časť dokladu priradená k zákazke – náklad alebo výnos." : "Všetky položky zo všetkých dokladov, napríklad na hľadanie cien materiálu."}</p>
          <DataTable entity={sub} onOpen={(r) => void api.get<Row>(`/api/data/${sub}/${r.id}`).then((full) => full.document_id && nav(`/doklad/${full.document_id}`)).catch(() => undefined)} />
        </div>
      )}
      {tab === "subory" && <Embedded><Inbox /></Embedded>}
    </div>
  );
}
