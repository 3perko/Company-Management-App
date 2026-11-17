import { useNavigate, useParams } from "react-router-dom";
import { useDashboardCounts } from "@/components/Layout";
import { Embedded, PageHeader, Tabs } from "@/components/ui";
import { BankPage } from "./Bank";
import { BillingList } from "./Billing";
import Exports from "./Exports";
import Vat from "./Vat";

/** Financie: bank and payment matching, VAT, billing statements and exports. */
export default function Financie() {
  const { tab = "banka" } = useParams();
  const nav = useNavigate();
  const { counts } = useDashboardCounts(true);
  return (
    <div>
      <PageHeader title="Financie" sub="Banka a párovanie platieb, DPH, podklady k fakturácii a exporty." />
      <Tabs value={tab} onChange={(t) => nav(`/financie/${t}`)} items={[
        { key: "banka", label: "Banka", count: counts.bank_without_document ?? null }, { key: "dph", label: "DPH" },
        { key: "fakturacia", label: "Fakturácia" }, { key: "exporty", label: "Exporty" }]} />
      <Embedded>
        {tab === "banka" && <BankPage />}
        {tab === "dph" && <Vat />}
        {tab === "fakturacia" && <BillingList />}
        {tab === "exporty" && <Exports />}
      </Embedded>
    </div>
  );
}
