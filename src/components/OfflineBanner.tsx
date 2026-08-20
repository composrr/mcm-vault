import { IconWifiOff } from "@tabler/icons-react";

interface OfflineBannerProps {
  onRetry?: () => void;
}

/** Compact warning strip. Sits above the list, never wraps to two rows in a
 *  520px window — the message truncates before the retry action gives ground. */
export function OfflineBanner({ onRetry }: OfflineBannerProps) {
  return (
    <div className="flex items-center gap-2 border-b border-warning-border bg-warning-bg px-5 py-2">
      <IconWifiOff size={14} stroke={2} className="shrink-0 text-warning-fg" />
      <span className="min-w-0 flex-1 truncate text-[11.5px] leading-tight text-warning-text">
        Can't reach the preset repository. Showing last known state.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded px-1 py-0.5 text-[11.5px] font-semibold text-warning-fg hover:underline"
      >
        Retry
      </button>
    </div>
  );
}
