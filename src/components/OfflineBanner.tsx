import { IconWifiOff } from "@tabler/icons-react";

interface OfflineBannerProps {
  onRetry?: () => void;
}

export function OfflineBanner({ onRetry }: OfflineBannerProps) {
  return (
    <div className="flex items-center gap-2.5 border-b border-warning-border bg-warning-bg px-5 py-2.5">
      <IconWifiOff size={16} stroke={2} className="text-warning-fg" />
      <span className="flex-1 text-[12px] text-warning-text">
        Can't reach the preset repository. Showing last known state.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="px-1 py-0.5 text-[12px] font-medium text-warning-fg hover:underline"
      >
        Retry
      </button>
    </div>
  );
}
