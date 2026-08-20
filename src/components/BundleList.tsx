import { useMemo } from "react";
import type { BundleRowData } from "../types";
import { BundleRow } from "./BundleRow";

const CATEGORY_LABEL: Record<string, string> = {
  premiere: "Premiere Pro",
  resolve: "DaVinci Resolve",
};

interface BundleListProps {
  rows: BundleRowData[];
  onRowClick?: (id: string) => void;
  onToggleDisabled?: (id: string) => void;
  /** Install every pending bundle in one section. */
  onUpdateSection?: (category: string) => void;
  busy?: boolean;
}

export function BundleList({
  rows,
  onRowClick,
  onToggleDisabled,
  onUpdateSection,
  busy = false,
}: BundleListProps) {
  // Group into sections. Built-ins keep a fixed order; custom sections follow
  // in first-seen order, labelled by the section name their bundles carry.
  const sections = useMemo(() => {
    const out: { key: string; label: string; rows: BundleRowData[] }[] = [];
    const seen = new Set<string>();
    for (const key of ["premiere", "resolve"]) {
      const group = rows.filter((r) => r.bundle.category === key);
      if (group.length) {
        out.push({ key, label: CATEGORY_LABEL[key], rows: group });
        seen.add(key);
      }
    }
    for (const r of rows) {
      const key = r.bundle.category;
      if (seen.has(key)) continue;
      seen.add(key);
      const group = rows.filter((x) => x.bundle.category === key);
      out.push({
        key,
        label:
          group.find((x) => x.bundle.sectionLabel)?.bundle.sectionLabel ??
          CATEGORY_LABEL[key] ??
          key,
        rows: group,
      });
    }
    return out;
  }, [rows]);

  return (
    <div className="flex-1 overflow-y-auto">
      {sections.map((section) => {
        const pending = section.rows.filter(
          (r) => !r.disabled && (r.status === "update" || r.status === "notinstalled")
        ).length;
        return (
          <div key={section.key}>
            {/* Sticky section header. The bulk action lives here rather than in
                the bottom bar, so it reads as scoped to this section. */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border-soft bg-white px-5 pb-1.5 pt-2.5">
              <span className="text-[10px] font-bold uppercase tracking-[.09em] text-muted">
                {section.label}
              </span>
              {pending > 0 && onUpdateSection ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onUpdateSection(section.key)}
                  className="shrink-0 text-[11px] font-medium text-mcm-blue hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Update all ({pending})
                </button>
              ) : (
                <span className="shrink-0 text-[10px] tabular-nums text-muted">
                  {section.rows.length}
                </span>
              )}
            </div>
            {section.rows.map((row) => (
              <BundleRow
                key={row.bundle.id}
                row={row}
                onClick={onRowClick ? () => onRowClick(row.bundle.id) : undefined}
                onToggleDisabled={
                  onToggleDisabled ? () => onToggleDisabled(row.bundle.id) : undefined
                }
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
