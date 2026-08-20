import { IconDeviceDesktopSearch } from "@tabler/icons-react";

interface NoHostAppsStateProps {
  onScanAgain: () => void;
  onGetHelp?: () => void;
}

/** Empty state, not an error state: the headline tells the user what to DO,
 *  and the thin outline glyph keeps it calm rather than alarming. */
export function NoHostAppsState({ onScanAgain, onGetHelp }: NoHostAppsStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-10 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border-strong">
        <IconDeviceDesktopSearch size={28} stroke={1.5} className="text-muted" />
      </div>
      <h2 className="mb-2 text-[17px] font-semibold leading-snug text-ink">
        Install Premiere or Resolve to get started
      </h2>
      <p className="mx-auto mb-7 max-w-[340px] text-[12.5px] leading-relaxed text-body">
        MCM Vault syncs presets into your editing apps, so it needs at least one
        of them on this computer before it has somewhere to put them.
      </p>
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
