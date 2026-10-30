import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DealPage } from "./pages/DealPage";
import { DisputePage } from "./pages/DisputePage";
import { LedgerPage } from "./pages/LedgerPage";
import { MandatePage } from "./pages/MandatePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="mandate" element={<MandatePage />} />
        <Route path="deals/:dealId" element={<DealPage />} />
        <Route path="disputes/:disputeId" element={<DisputePage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
