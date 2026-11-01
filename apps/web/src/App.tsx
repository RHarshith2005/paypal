import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DealPage } from "./pages/DealPage";
import { DemoScreenplayPage } from "./pages/DemoScreenplayPage";
import { DisputeCourtPage } from "./pages/DisputeCourtPage";
import { DisputePage } from "./pages/DisputePage";
import { LedgerPage } from "./pages/LedgerPage";
import { MandateBuilderPage } from "./pages/MandateBuilderPage";
import { MandatePage } from "./pages/MandatePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TrustPage } from "./pages/TrustPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="mandate" element={<MandatePage />} />
        <Route path="mandate/new" element={<MandateBuilderPage />} />
        <Route path="deals/:dealId" element={<DealPage />} />
        <Route path="disputes" element={<DisputeCourtPage />} />
        <Route path="disputes/:disputeId" element={<DisputePage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="trust" element={<TrustPage />} />
        <Route path="demo/script" element={<DemoScreenplayPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
