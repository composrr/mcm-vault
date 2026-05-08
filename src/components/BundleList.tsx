import type { BundleRowData } from "../types";
import { BundleRow } from "./BundleRow";

interface BundleListProps {
  rows: BundleRowData[];
  onRowClick?: (id: string) => void;
  onToggleDisabled?: (id: string) => void;
}

export function BundleList({
  rows,
  onRowClick,
  onToggleDisabled,
}: BundleListProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {rows.map((row) => (
        <BundleRow
          key={row.bundle.id}
          row={row}
          onClick={onRowClick ? () => onRowClick(row.bundle.id) : undefined}
          onToggleDisabled={
            onToggleDisabled
              ? () => onToggleDisabled(row.bundle.id)
              : undefined
          }
        />
      ))}
    </div>
  );
}
