import {
  IconAlertTriangle,
  IconBrandGithub,
  IconCheck,
  IconCloudUpload,
  IconX,
} from "@tabler/icons-react";
import { StatusIcon } from "./StatusIcon";

interface PublishProgressModalProps {
  planIds: string[];
  names: Record<string, string>;
  phases: Record<string, string>;
  commitPhase: "idle" | "committing" | "complete";
  done: boolean;
  error: string | null;
  onDismiss: () => void;
}

const PILL_BASE = "shrink-0 rounded px-1.5 py-px text-[9.5px] font-semibold tracking-[.02em]";

export function PublishProgressModal({
  planIds,
  names,
  phases,
  commitPhase,
  done,
  error,
  onDismiss,
}: PublishProgressModalProps) {
  const doneCount = planIds.filter((id) => phases[id] === "done").length;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      <div
        className="relative flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{ maxHeight: "calc(100vh - 48px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              done && error
                ? "bg-error-bg text-error-fg"
                : done
                  ? "bg-success-bg text-success-fg"
                  : "bg-mcm-blue-tint text-mcm-blue"
            }`}
          >
            {done && error ? (
              <IconAlertTriangle size={20} stroke={2} />
            ) : done ? (
              <IconCheck size={20} stroke={2.5} />
            ) : (
              <IconCloudUpload size={20} stroke={2} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">
              {done ? (error ? "Publish failed" : "Publish complete") : "Publishing…"}
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-muted">
              {doneCount} of {planIds.length}{" "}
              {planIds.length === 1 ? "bundle" : "bundles"} copied
            </div>
          </div>
          {done && (
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

        {/* Bundle rows + commit row — scrollable */}
        <div className="min-h-0 flex-1 divide-y divide-border-soft overflow-y-auto">
          {planIds.map((id) => {
            const phase = phases[id] ?? "queued";
            const isCopying = phase === "copying";
            const isDone = phase === "done";
            return (
              <div key={id} className="flex items-center gap-2.5 px-5 py-3">
                <StatusIcon
                  status={isDone ? "installed" : isCopying ? "installing" : "notinstalled"}
                  size={20}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                  {names[id] ?? id}
                </span>
                {isDone ? (
                  <span className={`${PILL_BASE} bg-success-bg text-success-fg`}>
                    done
                  </span>
                ) : isCopying ? (
                  <span className={`${PILL_BASE} bg-mcm-blue/15 text-mcm-blue`}>
                    copying
                  </span>
                ) : (
                  <span className={`${PILL_BASE} bg-not-installed-bg text-muted`}>
                    queued
                  </span>
                )}
              </div>
            );
          })}

          {/* Git push row */}
          <div className="flex items-center gap-2.5 px-5 py-3">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                commitPhase === "complete"
                  ? "bg-success-bg text-success-fg"
                  : commitPhase === "committing"
                    ? "bg-mcm-blue-tint text-mcm-blue"
                    : "bg-not-installed-bg text-not-installed-fg"
              }`}
            >
              <IconBrandGithub size={12} stroke={2.5} />
            </div>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
              Push to GitHub
            </span>
            {commitPhase === "complete" ? (
              <span className={`${PILL_BASE} bg-success-bg text-success-fg`}>done</span>
            ) : commitPhase === "committing" ? (
              <span className={`${PILL_BASE} bg-mcm-blue/15 text-mcm-blue`}>
                pushing
              </span>
            ) : (
              <span className={`${PILL_BASE} bg-not-installed-bg text-muted`}>
                queued
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-1 mt-2.5 shrink-0 rounded-lg border border-error-border bg-error-row-bg px-3 py-2 text-[11px] text-error-fg">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-surface px-5 py-3.5">
          {done ? (
            <button
              type="button"
              onClick={onDismiss}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
            >
              Done
            </button>
          ) : (
            <div className="flex items-center justify-center py-1 text-[11px] text-muted">
              Publishing in progress…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
