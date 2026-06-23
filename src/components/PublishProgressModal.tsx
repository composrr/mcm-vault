import {
  IconAlertTriangle,
  IconCheck,
  IconCircleDashed,
  IconCloudUpload,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";

interface PublishProgressModalProps {
  planIds: string[];
  names: Record<string, string>;
  phases: Record<string, string>;
  commitPhase: "idle" | "committing" | "complete";
  done: boolean;
  error: string | null;
  onDismiss: () => void;
}

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
        className="relative flex w-full max-w-[400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "calc(100vh - 48px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3">
          {done ? (
            error ? (
              <IconAlertTriangle size={15} stroke={2} className="shrink-0 text-error-fg" />
            ) : (
              <IconCheck size={15} stroke={2} className="shrink-0 text-success-fg" />
            )
          ) : (
            <IconLoader2 size={15} stroke={2} className="shrink-0 animate-spin text-mcm-blue" />
          )}
          <span className="flex-1 text-[13px] font-medium text-ink">
            {done
              ? error
                ? "Publish failed"
                : "Publish complete"
              : "Publishing…"}
          </span>
          {done && (
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

        {/* Bundle rows + commit row — scrollable */}
        <div className="flex-1 divide-y divide-border-soft overflow-y-auto">
          {planIds.map((id) => {
            const phase = phases[id] ?? "queued";
            const isCopying = phase === "copying";
            const isDone = phase === "done";
            return (
              <div key={id} className="flex items-center gap-2 px-4 py-3">
                <div className="shrink-0">
                  {isCopying ? (
                    <IconLoader2 size={14} stroke={2} className="animate-spin text-mcm-blue" />
                  ) : isDone ? (
                    <IconCheck size={14} stroke={2} className="text-success-fg" />
                  ) : (
                    <IconCircleDashed size={14} stroke={2} className="text-muted" />
                  )}
                </div>
                <span className="flex-1 truncate text-[12.5px] font-medium text-ink">
                  {names[id] ?? id}
                </span>
                {isCopying && (
                  <span className="shrink-0 text-[11px] text-muted">Copying files…</span>
                )}
                {isDone && (
                  <span className="shrink-0 text-[11px] text-success-fg">Done</span>
                )}
              </div>
            );
          })}

          {/* Git push row */}
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="shrink-0">
              {commitPhase === "complete" ? (
                <IconCheck size={14} stroke={2} className="text-success-fg" />
              ) : commitPhase === "committing" ? (
                <IconLoader2 size={14} stroke={2} className="animate-spin text-mcm-blue" />
              ) : (
                <IconCircleDashed size={14} stroke={2} className="text-muted" />
              )}
            </div>
            <span className="flex-1 text-[12.5px] font-medium text-ink">Push to GitHub</span>
            {commitPhase === "committing" && (
              <span className="shrink-0 text-[11px] text-muted">Pushing…</span>
            )}
            {commitPhase === "complete" && (
              <span className="shrink-0 text-[11px] text-success-fg">Done</span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-1 mt-2 rounded border border-error-border bg-error-row-bg px-2.5 py-2 text-[11px] text-error-fg">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border bg-surface px-4 py-3">
          <div className="mb-2.5 text-[11.5px] text-muted">
            {doneCount} of {planIds.length}{" "}
            {planIds.length === 1 ? "bundle" : "bundles"} copied
          </div>
          {done ? (
            <button
              type="button"
              onClick={onDismiss}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
            >
              <IconCloudUpload size={15} stroke={2} />
              Done
            </button>
          ) : (
            <div className="flex items-center justify-center py-0.5 text-[11.5px] text-muted">
              Publishing in progress…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
