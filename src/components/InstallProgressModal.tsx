import { useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";
import { pauseInstall, resumeInstall } from "../lib/tauri";
import { StatusIcon } from "./StatusIcon";
import type { BundleRuntimeState } from "../store/useAppStore";
import type { Manifest } from "../types";

interface InstallProgressModalProps {
  sessionIds: string[];
  runtime: Record<string, BundleRuntimeState>;
  manifest: Manifest | null;
  onDismiss: () => void;
  onCancel: () => void;
}

const PILL_BASE = "shrink-0 rounded px-1.5 py-px text-[9.5px] font-semibold tracking-[.02em]";

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
    (id) => runtime[id]?.completed || runtime[id]?.errorMessage
  ).length;
  const errorCount = sessionIds.filter((id) => !!runtime[id]?.errorMessage).length;
  const allDone = sessionIds.length > 0 && doneCount === sessionIds.length;

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

  const headline = allDone
    ? errorCount > 0
      ? `Finished with ${errorCount} error${errorCount === 1 ? "" : "s"}`
      : "Update complete"
    : paused
      ? "Paused"
      : cancelling
        ? "Cancelling…"
        : "Installing updates…";

  return (
    /* Backdrop */
    <div className="absolute inset-0 z-50 flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      {/* Floating panel */}
      <div
        className="relative flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{ maxHeight: "calc(100vh - 48px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              allDone && errorCount > 0
                ? "bg-error-bg text-error-fg"
                : allDone
                  ? "bg-success-bg text-success-fg"
                  : "bg-mcm-blue-tint text-mcm-blue"
            }`}
          >
            {allDone && errorCount > 0 ? (
              <IconAlertTriangle size={20} stroke={2} />
            ) : allDone ? (
              <IconCheck size={20} stroke={2.5} />
            ) : paused ? (
              <IconPlayerPause size={20} stroke={2} />
            ) : (
              <IconDownload size={20} stroke={2} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">
              {headline}
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-muted">
              {doneCount} of {sessionIds.length}{" "}
              {sessionIds.length === 1 ? "bundle" : "bundles"} complete
            </div>
          </div>
          {allDone && (
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 rounded-md p-1 text-muted hover:bg-border-soft hover:text-ink"
              aria-label="Close"
            >
              <IconX size={18} stroke={2} />
            </button>
          )}
        </div>

        {/* Bundle rows — scrollable */}
        <div className="min-h-0 flex-1 divide-y divide-border-soft overflow-y-auto">
          {bundles.map((bundle) => {
            const state = runtime[bundle.id];
            const isInstalling = !!state?.installing;
            const hasError = !!state?.errorMessage;
            const isDone = !!state?.completed;
            const progress = state?.progress;
            const pct =
              progress && progress.total > 0
                ? Math.round((progress.completed / progress.total) * 100)
                : 0;

            const iconKind = hasError
              ? "error"
              : isDone
                ? "installed"
                : isInstalling && !paused
                  ? "installing"
                  : "notinstalled";

            return (
              <div key={bundle.id} className="px-5 py-3">
                {/* Name + status row */}
                <div className="flex items-center gap-2.5">
                  <StatusIcon status={iconKind} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                    {bundle.name}
                  </span>
                  {hasError ? (
                    <span className={`${PILL_BASE} bg-error-bg text-error-fg`}>
                      failed
                    </span>
                  ) : isDone ? (
                    <span className={`${PILL_BASE} bg-success-bg text-success-fg`}>
                      done
                    </span>
                  ) : isInstalling ? (
                    <span className={`${PILL_BASE} bg-mcm-blue/15 text-mcm-blue`}>
                      {paused ? "paused" : "installing"}
                    </span>
                  ) : (
                    <span
                      className={`${PILL_BASE} bg-not-installed-bg text-muted`}
                    >
                      queued
                    </span>
                  )}
                </div>

                {/* Progress bar — active row only */}
                {isInstalling && progress && progress.total > 0 && (
                  <div className="ml-[30px] mt-2">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[10px] tabular-nums text-muted">
                      <span className="shrink-0">
                        {progress.completed}/{progress.total}
                      </span>
                      <span className="tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-border-soft">
                      <div
                        className="h-full rounded-full bg-mcm-blue transition-all duration-150"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {progress.currentFile && (
                      <div className="mt-1 truncate font-mono text-[10.5px] text-muted">
                        {progress.currentFile.split(/[/\\]/).pop()}
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {hasError && (
                  <div className="ml-[30px] mt-1.5 rounded-lg border border-error-border bg-error-row-bg px-2.5 py-1.5 text-[11px] text-error-fg">
                    {state.errorMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-surface px-5 py-3.5">
          {errorCount > 0 && (
            <div className="mb-2.5 text-[11px] tabular-nums text-error-fg">
              {errorCount} failed
            </div>
          )}

          {allDone ? (
            <button
              type="button"
              onClick={onDismiss}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
            >
              Done
            </button>
          ) : (
            <div className="flex gap-2">
              {paused ? (
                <button
                  type="button"
                  onClick={handleResume}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft"
                >
                  <IconPlayerPlay size={14} stroke={2} />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePause}
                  disabled={cancelling}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft disabled:opacity-40"
                >
                  <IconPlayerPause size={14} stroke={2} />
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-error-border bg-white px-4 py-2 text-[13px] text-error-fg hover:bg-error-row-bg disabled:opacity-40"
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
