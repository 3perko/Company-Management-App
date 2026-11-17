import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Embedded, PageHeader, Tabs } from "@/components/ui";
import { HoursPage, TripsPage } from "./Work";
import WorkerStatement from "./WorkerStatement";

/** Práca: hours, trips and the worker statement. The only area a worker sees. */
export default function Praca() {
  const { tab = "hodiny" } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  return (
    <div>
      <PageHeader title={isAdmin ? "Práca" : "Moja práca"} sub={isAdmin ? "Odpracované hodiny, jazdy a výkazy pracovníkov." : "Vaše hodiny, jazdy a výkaz."} />
      <Tabs value={tab} onChange={(t) => nav(`/praca/${t}`)} items={[
        { key: "hodiny", label: "Hodiny" }, { key: "jazdy", label: "Jazdy" }, { key: "vykaz", label: isAdmin ? "Výkaz pracovníka" : "Môj výkaz" }]} />
      <Embedded>
        {tab === "hodiny" && <HoursPage />}
        {tab === "jazdy" && <TripsPage />}
        {tab === "vykaz" && <WorkerStatement />}
      </Embedded>
    </div>
  );
}
