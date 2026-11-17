import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import Prehlad from "@/pages/Prehlad";
import Doklady from "@/pages/Doklady";
import DocumentDetail from "@/pages/DocumentDetail";
import Zakazky from "@/pages/Zakazky";
import { ProjectDetail } from "@/pages/ProjectCosts";
import Praca from "@/pages/Praca";
import Financie from "@/pages/Financie";
import { BankTransactionDetail } from "@/pages/Bank";
import { BillingDetail } from "@/pages/Billing";
import Vozidla, { VehicleDetail } from "@/pages/Vozidla";
import Nastavenie from "@/pages/Nastavenie";

/** Old addresses (bookmarks, links in e-mails) keep working. */
const MOVED: [string, string][] = [
  ["zakazky-naklady", "/zakazky/naklady"], ["ziskovost", "/zakazky/ziskovost"],
  ["vozovy-park/vozidla", "/vozidla/zoznam"], ["vozovy-park/sadzby", "/vozidla/zaznamy"], ["vozovy-park/poistenie", "/vozidla/zaznamy"],
  ["vozovy-park/znamky", "/vozidla/zaznamy"], ["vozovy-park/servis", "/vozidla/zaznamy"], ["vozovy-park/overenie", "/vozidla/terminy"],
  ["vystupy/fakturacia", "/financie/fakturacia"], ["vystupy/exporty", "/financie/exporty"], ["vystupy/pracovnik", "/praca/vykaz"],
  ["ciselniky/firmy", "/nastavenie/firmy"], ["ciselniky/ucty", "/nastavenie/ucty"], ["ciselniky/rady", "/nastavenie/rady"],
  ["ciselniky/odberatelia", "/nastavenie/odberatelia"], ["ciselniky/zakazky", "/zakazky/zoznam"], ["ciselniky/pracovnici", "/nastavenie/pracovnici"],
  ["ciselniky/sadzby", "/nastavenie/sadzby"], ["ciselniky/opakujuce", "/nastavenie/opakujuce"],
  ["nastavenia/pouzivatelia", "/nastavenie/pouzivatelia"], ["nastavenia/parametre", "/nastavenie/parametre"],
  ["nastavenia/integracie", "/nastavenie/integracie"], ["nastavenia/audit", "/nastavenie/historia"],
];
/** Old tab names inside areas that still exist under a new name. */
const DOC_TABS: Record<string, string> = { "na-kontrolu": "/doklady/kontrola", "rychla-kontrola": "/doklady/kontrola", inbox: "/doklady/subory" };
const FIN_TABS: Record<string, string> = { "mesacna-kontrola": "/", pravidla: "/financie/banka" };

function MovedDetail({ to }: { to: string }) {
  const { id } = useParams();
  return <Navigate to={`${to}/${id}`} replace />;
}
/** `/doklady/123` was the old document address; `/doklady/blocky` is a tab of the new screen. */
function DokladyRoute() {
  const { tab = "" } = useParams();
  if (/^\d+$/.test(tab)) return <Navigate to={`/doklad/${tab}`} replace />;
  if (DOC_TABS[tab]) return <Navigate to={DOC_TABS[tab]} replace />;
  return <Doklady />;
}
function FinancieRoute() {
  const { tab = "" } = useParams();
  return FIN_TABS[tab] ? <Navigate to={FIN_TABS[tab]} replace /> : <Financie />;
}

function Protected() {
  const { me, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  if (!me) return <Navigate to="/prihlasenie" replace />;
  return (
    <Routes>
      <Route element={<Layout />}>
        {isAdmin ? (
          <>
            <Route index element={<Prehlad />} />
            <Route path="prehlad" element={<Navigate to="/" replace />} />
            <Route path="doklady" element={<Navigate to="/doklady/kontrola" replace />} />
            <Route path="doklady/:tab" element={<DokladyRoute />} />
            <Route path="doklad/:id" element={<DocumentDetail />} />
            <Route path="zakazky" element={<Navigate to="/zakazky/naklady" replace />} />
            <Route path="zakazky/:tab" element={<Zakazky />} />
            <Route path="zakazka/:id" element={<ProjectDetail />} />
            <Route path="financie" element={<Navigate to="/financie/banka" replace />} />
            <Route path="financie/:tab" element={<FinancieRoute />} />
            <Route path="pohyb/:id" element={<BankTransactionDetail />} />
            <Route path="podklad/:id" element={<BillingDetail />} />
            <Route path="vozidla" element={<Navigate to="/vozidla/zoznam" replace />} />
            <Route path="vozidla/:tab" element={<Vozidla />} />
            <Route path="vozidlo/:id" element={<VehicleDetail />} />
            <Route path="nastavenie" element={<Navigate to="/nastavenie/firmy" replace />} />
            <Route path="nastavenie/:sec" element={<Nastavenie />} />
            {MOVED.map(([from, to]) => <Route key={from} path={from} element={<Navigate to={to} replace />} />)}
            <Route path="zakazky-naklady/:id" element={<MovedDetail to="/zakazka" />} />
            <Route path="financie/banka/pohyb/:id" element={<MovedDetail to="/pohyb" />} />
            <Route path="vystupy/fakturacia/:id" element={<MovedDetail to="/podklad" />} />
          </>
        ) : (
          <>
            <Route index element={<Navigate to="/praca/hodiny" replace />} />
            <Route path="vystupy/pracovnik" element={<Navigate to="/praca/vykaz" replace />} />
          </>
        )}
        <Route path="praca" element={<Navigate to="/praca/hodiny" replace />} />
        <Route path="praca/:tab" element={<Praca />} />
        <Route path="*" element={isAdmin ? <div className="text-sm text-slate-500">Stránka neexistuje.</div> : <Navigate to="/praca/hodiny" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/prihlasenie" element={<Login />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  );
}
