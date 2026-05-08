import { IconRefresh } from "@tabler/icons-react";

interface StatusBarProps {
  lastChecked: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  errorMessage?: string;
  appVersion?: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never checked";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "Last checked: just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `Last checked: ${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Last checked: ${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const day = Math.floor(hr / 24);
  return `Last checked: ${day} ${day === 1 ? "day" : "days"} ago`;
}

export function StatusBar({
  lastChecked,
  onRefresh,
  refreshing = false,
  errorMessage,
  appVersion,
}: StatusBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border bg-titlebar px-5 py-2 text-[11px] text-muted">
      <span className={errorMessage ? "text-error-fg" : ""}>
        {errorMessage ?? formatRelative(lastChecked)}
      </span>
      <div className="flex items-center gap-2">
        {appVersion && (
          <span className="tabular-nums text-muted">v{appVersion}</span>
        )}
        <button
          type="button"
          aria-label="Refresh"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center justify-center rounded-md p-1 text-muted hover:bg-border-soft disabled:opacity-50"
        >
          <IconRefresh
            size={14}
            stroke={2}
            className={refreshing ? "animate-spin" : ""}
          />
        </button>
      </div>
    </div>
  );
}
