import { Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { DealPage } from "./pages/DealPage";
import { DealsPage } from "./pages/DealsPage";
import { DemoScreenplayPage } from "./pages/DemoScreenplayPage";
import { DisputeCourtPage } from "./pages/DisputeCourtPage";
import { DisputePage } from "./pages/DisputePage";
import { LedgerPage } from "./pages/LedgerPage";
import { MandateBuilderPage } from "./pages/MandateBuilderPage";
import { MandatePage } from "./pages/MandatePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TrustPage } from "./pages/TrustPage";
import { AppSurface, SubPageShell } from "./ui/Screen";

const wrap = (element: ReactNode) => <SubPageShell>{element}</SubPageShell>;

export function App() {
  return (
    <Routes>
      <Route element={<AppSurface />}>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="deals" element={<DealsPage />} />
          <Route path="deals/:dealId" element={wrap(<DealPage />)} />
          <Route path="mandate" element={wrap(<MandatePage />)} />
          <Route path="mandate/new" element={wrap(<MandateBuilderPage />)} />
          <Route path="disputes" element={wrap(<DisputeCourtPage />)} />
          <Route path="disputes/:disputeId" element={wrap(<DisputePage />)} />
          <Route path="ledger" element={wrap(<LedgerPage />)} />
          <Route path="trust" element={wrap(<TrustPage />)} />
          <Route path="demo/script" element={wrap(<DemoScreenplayPage />)} />
          <Route path="*" element={wrap(<NotFoundPage />)} />
        </Route>
      </Route>
    </Routes>
  );
}
