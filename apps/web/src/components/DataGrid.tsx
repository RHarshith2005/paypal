import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  accentColor: "#34d399",
  backgroundColor: "transparent",
  borderColor: "rgba(255,255,255,0.08)",
  foregroundColor: "#e8edf5",
  headerBackgroundColor: "rgba(255,255,255,0.03)",
  headerTextColor: "#94a3b8",
  oddRowBackgroundColor: "rgba(255,255,255,0.015)",
  rowHoverColor: "rgba(52,211,153,0.08)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  headerFontSize: 11,
  wrapperBorderRadius: 12,
});

export function DataGrid<T extends object>({
  rows,
  columns,
  height = 320,
  onRowClicked,
}: {
  rows: T[];
  columns: ColDef<T>[];
  height?: number;
  onRowClicked?: (row: T) => void;
}) {
  const defaultColDef = useMemo<ColDef<T>>(
    () => ({ sortable: true, resizable: true, suppressHeaderMenuButton: true, minWidth: 96 }),
    [],
  );

  return (
    <div style={{ height }} className="w-full overflow-hidden rounded-xl border border-white/8">
      <AgGridReact<T>
        rowData={rows}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        theme={gridTheme}
        suppressCellFocus
        animateRows={false}
        rowHeight={40}
        headerHeight={36}
        rowStyle={onRowClicked ? { cursor: "pointer" } : undefined}
        onRowClicked={(event) => {
          if (onRowClicked && event.data) onRowClicked(event.data);
        }}
      />
    </div>
  );
}
