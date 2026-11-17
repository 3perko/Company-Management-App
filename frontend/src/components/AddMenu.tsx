import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FolderPlus, Landmark, Plus, ScanLine, Timer, Truck, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEntityMeta } from "./DataTable";
import { EntityDrawer } from "./EntityDrawer";
import { Embedded, MenuButton, Modal, Spinner, useToast, type MenuEntry } from "./ui";
import { UploadBox } from "@/pages/Inbox";
import QuickCheck from "@/pages/QuickCheck";

type DocKind = "auto" | "receipt" | "invoice_in" | "invoice_out" | "bank";
type Dialog = { kind: "upload"; docKind: DocKind } | { kind: "quick" } | { kind: "manual" } | { kind: "bank" } | { kind: "project" } | null;

interface AddActions {
  upload: (kind?: DocKind) => void;
  quickCheck: () => void;
  /** with a type creates the document right away, without it asks which type */
  manualDocument: (docType?: string) => void;
  bankImport: () => void;
  newProject: () => void;
}
const Ctx = createContext<AddActions | null>(null);

/** One place for "add something new": used by the Pridať button in the header and by buttons on pages. */
export function useAdd() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AddProvider missing");
  return c;
}

const DOC_TYPES: [string, string][] = [["receipt", "Bloček"], ["invoice_in", "Prijatá faktúra"], ["invoice_out", "Vystavená faktúra"]];

export function AddProvider({ children }: { children: ReactNode }) {
  const [dlg, setDlg] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const bankInput = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setDlg(null), []);

  // following a link inside a dialog (e.g. "otvoriť doklad") closes it
  useEffect(() => setDlg(null), [loc.pathname]);

  const createManual = useCallback(async (docType: string) => {
    try {
      const r = await api.post<{ id: number }>("/api/documents/manual", { doc_type: docType });
      setDlg(null);
      void qc.invalidateQueries({ queryKey: ["data", "documents"] });
      nav(`/doklad/${r.id}`);
    } catch (e) {
      toast.error(e);
    }
  }, [nav, qc, toast]);

  const actions = useMemo<AddActions>(() => ({
    upload: (kind = "auto") => setDlg({ kind: "upload", docKind: kind }),
    quickCheck: () => setDlg({ kind: "quick" }),
    manualDocument: (docType) => (docType ? void createManual(docType) : setDlg({ kind: "manual" })),
    bankImport: () => setDlg({ kind: "bank" }),
    newProject: () => setDlg({ kind: "project" }),
  }), [createManual]);

  const importBank = async (f: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api.upload<{ message: string }>("/api/bank/import", fd);
      toast.ok(r.message);
      await qc.invalidateQueries();
      setDlg(null);
      nav("/financie/banka");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (bankInput.current) bankInput.current.value = "";
    }
  };
  const refreshDocs = () => {
    void qc.invalidateQueries({ queryKey: ["data"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["monthly-check"] });
  };

  return (
    <Ctx.Provider value={actions}>
      {children}
      {isAdmin && <>
        <Modal open={dlg?.kind === "upload"} onClose={close} title="Nahrať doklady" wide>
          {dlg?.kind === "upload" && <UploadBox kind={dlg.docKind} bare onDone={refreshDocs} />}
        </Modal>
        <Modal open={dlg?.kind === "quick"} onClose={() => { close(); refreshDocs(); }} title="Skontrolovať bloček">
          <Embedded><QuickCheck /></Embedded>
        </Modal>
        <Modal open={dlg?.kind === "manual"} onClose={close} title="Zadať doklad ručne">
          <p className="mb-3 text-sm text-slate-500">Aký doklad chcete zadať?</p>
          <div className="flex flex-col gap-2">
            {DOC_TYPES.map(([k, l]) => <button key={k} className="btn-secondary justify-start" onClick={() => void createManual(k)}>{l}</button>)}
          </div>
        </Modal>
        <Modal open={dlg?.kind === "bank"} onClose={close} title="Importovať bankový výpis">
          <p className="mb-3 text-sm text-slate-500">Podporované formáty: XML CAMT.053, CSV a XLSX podľa banky, PDF. Účet sa priradí firme podľa IBAN; výpis cudzej firmy sa odmietne.</p>
          <button className="btn-primary" disabled={busy} onClick={() => bankInput.current?.click()}>{busy ? <Spinner /> : <Upload className="h-4 w-4" />} Vybrať súbor</button>
          <input ref={bankInput} type="file" hidden accept=".xml,.csv,.xlsx,.pdf,.txt" onChange={(e) => e.target.files?.[0] && void importBank(e.target.files[0])} />
        </Modal>
        <NewProjectDrawer open={dlg?.kind === "project"} onClose={close} onSaved={(id) => nav(`/zakazka/${id}`)} />
      </>}
    </Ctx.Provider>
  );
}

function NewProjectDrawer({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: number) => void }) {
  const meta = useEntityMeta("projects");
  if (!meta.data || !open) return null;
  return <EntityDrawer meta={meta.data} id={null} open onClose={onClose} onSaved={(r) => onSaved(r.id)} />;
}

/** The Pridať button in the header. */
export function AddButton() {
  const add = useAdd();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const ic = "h-4 w-4 text-slate-500";
  const work: MenuEntry[] = [
    { label: "Zadať hodiny", icon: <Timer className={ic} />, onClick: () => nav("/praca/hodiny", { state: { openForm: Date.now() } }) },
    { label: "Zadať jazdu", icon: <Truck className={ic} />, onClick: () => nav("/praca/jazdy", { state: { openForm: Date.now() } }) },
  ];
  const items: MenuEntry[] = isAdmin ? [
    { heading: "Doklady" },
    { label: "Nahrať doklady", icon: <Upload className={ic} />, onClick: () => add.upload() },
    { label: "Skontrolovať bloček", icon: <ScanLine className={ic} />, onClick: add.quickCheck },
    { label: "Zadať doklad ručne", icon: <FilePlus2 className={ic} />, onClick: () => add.manualDocument() },
    "sep", { heading: "Práca" }, ...work,
    "sep", { heading: "Ostatné" },
    { label: "Importovať bankový výpis", icon: <Landmark className={ic} />, onClick: add.bankImport },
    { label: "Nová zákazka", icon: <FolderPlus className={ic} />, onClick: add.newProject },
  ] : work;
  return <MenuButton className="btn-primary" icon={<Plus className="h-4 w-4" />} label="Pridať" items={items} />;
}
