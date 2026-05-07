import { IconAlertTriangle } from "@tabler/icons-react";

interface NoHostAppsStateProps {
  onScanAgain: () => void;
  onGetHelp?: () => void;
}

export function NoHostAppsState({ onScanAgain, onGetHelp }: NoHostAppsStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-start px-10 pt-14 pb-10 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-warning-bg">
        <IconAlertTriangle size={28} stroke={2} className="text-warning-fg" />
      </div>
      <div className="mb-2 text-[18px] font-semibold text-ink">
        No supported apps detected
      </div>
      <div className="mx-auto mb-6 max-w-[380px] text-[13px] leading-relaxed text-body">
        MCM Vault couldn't find Adobe Premiere Pro or DaVinci Resolve on this
        computer. Install one of them, then re-open MCM Vault.
      </div>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={onScanAgain}
          className="rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft"
        >
          Scan again
        </button>
        {onGetHelp && (
          <button
            type="button"
            onClick={onGetHelp}
            className="rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
          >
            Get help
          </button>
        )}
      </div>
    </div>
  );
}
