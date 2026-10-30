import { formatUsd, type LedgerEntry } from "@handshake/shared";
import type { ColDef } from "ag-grid-community";
import { useNavigate } from "react-router-dom";
import { DataGrid } from "../components/DataGrid";
import { EmptyState, ErrorPanel, LinkButton, LoadingPanel, PageHeader, Panel, StatusPill } from "../components/ui";
import { api } from "../lib/api";
import { formatDateTime, shortHash } from "../lib/format";
import { useResource } from "../lib/useResource";

export function LedgerPage() {
  const navigate = useNavigate();
  const ledger = useResource(() => api.ledger(), []);
  const entries = ledger.state.status === "success" ? ledger.state.data.entries : [];

  const columns: ColDef<LedgerEntry>[] = [
    {
      headerName: "Entry",
      valueGetter: (params) => (params.data ? shortHash(params.data.id, 16) : ""),
      width: 190,
    },
    {
      headerName: "Amount",
      valueGetter: (params) => (params.data ? formatUsd(params.data.amountMinor) : ""),
      width: 120,
    },
    {
      headerName: "Status",
      valueGetter: (params) => params.data?.status ?? "",
      cellRenderer: (params: { value?: string }) => (params.value ? <StatusPill status={params.value} /> : null),
      width: 130,
    },
    {
      headerName: "Deal",
      valueGetter: (params) => (params.data ? shortHash(params.data.dealId, 18) : ""),
      flex: 1,
      minWidth: 200,
    },
    {
      headerName: "Mandate",
      valueGetter: (params) => (params.data ? shortHash(params.data.mandateId, 16) : ""),
      width: 190,
    },
    {
      headerName: "Recorded",
      valueGetter: (params) => (params.data ? formatDateTime(params.data.createdAt) : ""),
      width: 150,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Money movement"
        title="Settlement ledger"
        description="Reservations are written before a PayPal order is created, then settled or voided. Reserved funds count against the mandate, which prevents two concurrent deals from overdrawing one budget."
      />

      <Panel
        title="Entries"
        description="Select a row to open the deal behind it."
        actions={
          <LinkButton to="/mandate" tone="ghost">
            View mandate
          </LinkButton>
        }
      >
        {ledger.state.status === "loading" && <LoadingPanel label="Loading ledger entries…" />}
        {ledger.state.status === "error" && <ErrorPanel message={ledger.state.error} onRetry={ledger.reload} />}
        {ledger.state.status === "success" &&
          (entries.length === 0 ? (
            <EmptyState
              title="No ledger entries yet"
              description="A deal writes a RESERVED entry when it passes the mandate check, then moves it to SETTLED after the PayPal capture completes."
            />
          ) : (
            <DataGrid
              rows={entries}
              columns={columns}
              height={Math.min(560, 44 + entries.length * 40)}
              onRowClicked={(entry) => navigate(`/deals/${entry.dealId}`)}
            />
          ))}
      </Panel>
    </div>
  );
}
