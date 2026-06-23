import { useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleDashed,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";
import { pauseInstall, resumeInstall } from "../lib/tauri";
import type { BundleRuntimeState } from "../store/useAppStore";
import type { Manifest } from "../types";

interface InstallProgressModalProps {
  sessionIds: string[];
  runtime: Record<string, BundleRuntimeState>;
  manifest: Manifest | null;
  onDismiss: () => void;
  onCancel: () => void;
}

export function InstallProgressModal({
  sessionIds,
  runtime,
  manifest,
  onDismiss,
  onCancel,
}: InstallProgressModalProps) {
  const [paused, setPaused] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const bundles = sessionIds
    .map((id) => manifest?.bundles.find((b) => b.id === id))
    .filter(Boolean) as NonNullable<Manifest["bundles"][number]>[];

  const doneCount = sessionIds.filter(
    (id) => !runtime[id]?.installing && (runtime[id]?.progress || runtime[id]?.errorMessage)
  ).length;
  const errorCount = sessionIds.filter((id) => !!runtime[id]?.errorMessage).length;
  const allDone = sessionIds.length > 0 && sessionIds.every((id) => !runtime[id]?.installing);

  const handlePause = async () => {
    setPaused(true);
    await pauseInstall().catch(() => {});
  };

  const handleResume = async () => {
    setPaused(false);
    await resumeInstall().catch(() => {});
  };

  const handleCancel = async () => {
    setCancelling(true);
    setPaused(false);
    onCancel();
  };

  return (
    /* Backdrop */
    <div className="absolute inset-0 z-50 flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      {/* Floating panel */}
      <div className="relative flex w-full max-w-[400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "calc(100vh - 48px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3">
          {allDone ? (
            errorCount > 0 ? (
              <IconAlertTriangle size={15} stroke={2} className="shrink-0 text-error-fg" />
            ) : (
              <IconCheck size={15} stroke={2} className="shrink-0 text-success-fg" />
            )
          ) : paused ? (
            <IconPlayerPause size={15} stroke={2} className="shrink-0 text-muted" />
          ) : (
            <IconLoader2 size={15} stroke={2} className="shrink-0 animate-spin text-mcm-blue" />
          )}
          <span className="flex-1 text-[13px] font-medium text-ink">
            {allDone
              ? errorCount > 0
                ? `Finished with ${errorCount} error${errorCount === 1 ? "" : "s"}`
                : "Update complete"
              : paused
              ? "Paused"
              : cancelling
              ? "Cancelling…"
              : "Installing updates…"}
          </span>
          {allDone && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-1 text-muted hover:bg-border-soft hover:text-ink"
              aria-label="Close"
            >
              <IconX size={15} stroke={2} />
            </button>
          )}
        </div>

        {/* Bundle rows — scrollable */}
        <div className="flex-1 divide-y divide-border-soft overflow-y-auto">
          {bundles.map((bundle) => {
            const state = runtime[bundle.id];
            const isInstalling = !!state?.installing;
            const hasError = !!state?.errorMessage;
            const isDone = !isInstalling && (!!state?.progress || hasError);
            const progress = state?.progress;
            const pct =
              progress && progress.total > 0
                ? Math.round((progress.completed / progress.total) * 100)
                : 0;

            return (
              <div key={bundle.id} className="px-4 py-3">
                {/* Name + icon row */}
                <div className="flex items-center gap-2">
                  <div className="shrink-0">
                    {isInstalling && !paused ? (
                      <IconLoader2 size={14} stroke={2} className="animate-spin text-mcm-blue" />
                    ) : isInstalling && paused ? (
                      <IconPlayerPause size={14} stroke={2} className="text-muted" />
                    ) : hasError ? (
                      <IconAlertTriangle size={14} stroke={2} className="text-error-fg" />
                    ) : isDone ? (
                      <IconCheck size={14} stroke={2} className="text-success-fg" />
                    ) : (
                      <IconCircleDashed size={14} stroke={2} className="text-muted" />
                    )}
                  </div>
                  <span className="flex-1 truncate text-[12.5px] font-medium text-ink">
                    {bundle.name}
                  </span>
                  {isInstalling && progress && (
                    <span className="shrink-0 tabular-nums text-[11px] text-muted">
                      {progress.completed}/{progress.total}
                    </span>
                  )}
                  {isDone && !hasError && (
                    <span className="shrink-0 text-[11px] text-success-fg">Done</span>
                  )}
                </div>

                {/* Progress bar */}
                {isInstalling && progress && progress.total > 0 && (
                  <div className="mt-2 ml-5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-border-soft">
                      <div
                        className="h-full rounded-full bg-mcm-blue transition-all duration-150"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {progress.currentFile && (
                      <div className="mt-1 truncate font-mono text-[10px] text-muted">
                        {progress.currentFile.split(/[/\\]/).pop()}
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {hasError && (
                  <div className="mt-1.5 ml-5 rounded border border-error-border bg-error-row-bg px-2 py-1.5 text-[11px] text-error-fg">
                    {state.errorMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between text-[11.5px] text-muted">
            <span>
              {doneCount} of {sessionIds.length}{" "}
              {sessionIds.length === 1 ? "bundle" : "bundles"} complete
            </span>
            {errorCount > 0 && (
              <span className="text-error-fg">{errorCount} failed</span>
            )}
          </div>

          {allDone ? (
            <button
              type="button"
              onClick={onDismiss}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
            >
              Done
            </button>
          ) : (
            <div className="flex gap-2">
              {paused ? (
                <button
                  type="button"
                  onClick={handleResume}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-white px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-border-soft"
                >
                  <IconPlayerPlay size={14} stroke={2} />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePause}
                  disabled={cancelling}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-white px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-border-soft disabled:opacity-40"
                >
                  <IconPlayerPause size={14} stroke={2} />
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-error-border bg-white px-3 py-2 text-[12.5px] font-medium text-error-fg hover:bg-error-row-bg disabled:opacity-40"
              >
                <IconX size={14} stroke={2} />
                {cancelling ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
