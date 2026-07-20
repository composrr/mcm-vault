import { IconDownload, IconLoader2, IconSparkles, IconX } from "@tabler/icons-react";

interface UpdateAvailableModalProps {
  version: string;
  currentVersion: string;
  notes: string;
  downloading: boolean;
  progressPct: number | null;
  error: string | null;
  onUpdateNow: () => void;
  onLater: () => void;
  onSkip: () => void;
}

export function UpdateAvailableModal({
  version,
  currentVersion,
  notes,
  downloading,
  progressPct,
  error,
  onUpdateNow,
  onLater,
  onSkip,
}: UpdateAvailableModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={downloading ? undefined : onLater}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mcm-blue-tint">
            <IconSparkles size={20} stroke={2} className="text-mcm-blue" />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-semibold text-ink">
              Update available
            </div>
            <div className="mt-0.5 text-[12px] text-body">
              MCM Vault v{currentVersion} → <span className="font-medium text-mcm-blue">v{version}</span>
            </div>
          </div>
          {!downloading && (
            <button
              type="button"
              aria-label="Later"
              onClick={onLater}
              className="shrink-0 rounded-md p-1 text-muted hover:bg-border-soft"
            >
              <IconX size={20} stroke={2} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          <div className="mb-2 text-[11px] tracking-wide text-muted">WHAT'S NEW</div>
          <div className="max-h-[240px] overflow-auto rounded-lg border border-border bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-body whitespace-pre-wrap">
            {notes.trim() ? notes.trim() : "This update includes general improvements and fixes."}
          </div>

          {downloading && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[12px] text-body">
                <span>Downloading update…</span>
                {progressPct != null && (
                  <span className="tabular-nums text-muted">{Math.round(progressPct)}%</span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-soft">
                <div
                  className="h-full rounded-full bg-mcm-blue transition-all"
                  style={{ width: `${progressPct != null ? Math.max(4, progressPct) : 20}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-error-border bg-error-row-bg px-3.5 py-2.5 text-[12px] text-error-fg">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface px-5 py-3.5">
          <button
            type="button"
            onClick={onSkip}
            disabled={downloading}
            className="rounded-md px-3 py-2 text-[13px] text-muted hover:bg-border-soft disabled:opacity-40"
          >
            Skip this version
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onLater}
              disabled={downloading}
              className="rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft disabled:opacity-40"
            >
              Later
            </button>
            <button
              type="button"
              onClick={onUpdateNow}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? (
                <IconLoader2 size={16} stroke={2} className="animate-spin" />
              ) : (
                <IconDownload size={16} stroke={2} />
              )}
              {downloading ? "Updating…" : "Update now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
