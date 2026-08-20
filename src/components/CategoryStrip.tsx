import type { Category } from "../types";

export type CategoryFilter = "all" | Category;

interface CategoryStripProps {
  filter: CategoryFilter;
  onFilterChange: (next: CategoryFilter) => void;
  bundleCount: number;
  /** Count per filter, so each chip can show how much it holds. */
  counts?: Partial<Record<CategoryFilter, number>>;
  /** Extra sections beyond the built-ins, as [value, label]. */
  extraFilters?: { value: string; label: string }[];
}

/** Filter chips. Chips beat a dropdown here: every option stays visible and one
 *  click away, and the counts are readable without opening anything. */
export function CategoryStrip({
  filter,
  onFilterChange,
  bundleCount,
  counts,
  extraFilters = [],
}: CategoryStripProps) {
  const chips: { value: CategoryFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "premiere", label: "Premiere" },
    { value: "resolve", label: "Resolve" },
    ...extraFilters.map((f) => ({ value: f.value as CategoryFilter, label: f.label })),
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-5 py-2">
      {chips.map((chip) => {
        const active = filter === chip.value;
        const count = chip.value === "all" ? bundleCount : counts?.[chip.value];
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onFilterChange(chip.value)}
            aria-pressed={active}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
              active
                ? "bg-ink font-medium text-white"
                : "border border-border-strong text-body hover:bg-border-soft"
            }`}
          >
            {chip.label}
            {typeof count === "number" && (
              <span
                className={`ml-1 tabular-nums ${active ? "opacity-60" : "text-muted"}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
