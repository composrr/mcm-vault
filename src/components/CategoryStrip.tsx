import { IconChevronDown } from "@tabler/icons-react";
import type { Category } from "../types";

export type CategoryFilter = "all" | Category;

const FILTER_LABELS: Record<CategoryFilter, string> = {
  all: "All preset bundles",
  premiere: "Premiere Pro",
  resolve: "DaVinci Resolve",
};

interface CategoryStripProps {
  filter: CategoryFilter;
  onFilterChange: (next: CategoryFilter) => void;
  bundleCount: number;
}

export function CategoryStrip({ filter, onFilterChange, bundleCount }: CategoryStripProps) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-surface px-5 py-3">
      <span className="text-[12px] text-body">Category</span>
      <div className="relative flex-1">
        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as CategoryFilter)}
          className="w-full appearance-none rounded-md border border-border-strong bg-white px-3 py-1.5 pr-8 text-[13px] text-ink focus:border-mcm-blue focus:outline-none"
          aria-label="Filter by category"
        >
          {(Object.keys(FILTER_LABELS) as CategoryFilter[]).map((key) => (
            <option key={key} value={key}>
              {FILTER_LABELS[key]}
            </option>
          ))}
        </select>
        <IconChevronDown
          size={16}
          stroke={2}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
      <div className="text-[12px] text-muted whitespace-nowrap">
        {bundleCount} {bundleCount === 1 ? "bundle" : "bundles"}
      </div>
    </div>
  );
}
