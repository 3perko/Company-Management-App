import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAdd } from "@/components/AddMenu";
import { DataTable } from "@/components/DataTable";
import { Embedded, PageHeader, Tabs } from "@/components/ui";
import Profitability from "./Profitability";
import { ProjectCosts } from "./ProjectCosts";

/** Zákazky: what they cost, what they earn and how they are set up. */
export default function Zakazky() {
  const { tab = "naklady" } = useParams();
  const nav = useNavigate();
  const add = useAdd();
  return (
    <div>
      <PageHeader title="Zákazky" sub="Koľko zákazky stoja, koľko zarábajú a ako sú nastavené."
        actions={<button className="btn-primary" onClick={add.newProject}><Plus className="h-4 w-4" /> Nová zákazka</button>} />
      <Tabs value={tab} onChange={(t) => nav(`/zakazky/${t}`)} items={[
        { key: "naklady", label: "Náklady" }, { key: "ziskovost", label: "Ziskovosť" }, { key: "zoznam", label: "Zoznam a nastavenie" }]} />
      {tab === "naklady" && <Embedded><ProjectCosts /></Embedded>}
      {tab === "ziskovost" && <Embedded><Profitability /></Embedded>}
      {tab === "zoznam" && (
        <div>
          <p className="mb-3 text-sm text-slate-500">Zoznam všetkých zákaziek s ich nastavením: odberateľ, rozpočet, spôsob fakturácie, vzdialenosť. Kliknutím zákazku upravíte.</p>
          <DataTable entity="projects" />
        </div>
      )}
    </div>
  );
}
