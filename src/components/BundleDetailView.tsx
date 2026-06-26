import { useState } from "react";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCircle,
  IconExternalLink,
  IconFile,
  IconFolder,
  IconLoader2,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import type { Bundle, BundleStatusKind, InstalledBundleState } from "../types";

interface BundleDetailViewProps {
  bundle: Bundle;
  status: BundleStatusKind;
  installed?: InstalledBundleState;
  installing?: boolean;
  errorMessage?: string;
  onBack: () => void;
  onReinstall: () => void;
  onRemove: () => void;
  onReveal: () => void;
  onRestore?: () => void;
}

const PRESET_LABEL: Record<string, string> = {
  export: "Export",
  effect: "Effect",
  lumetri: "Lumetri",
  lut: "LUT",
  audio: "Audio",
  sequence: "Sequence",
  caption: "Caption",
  mogrt: "MOGRT",
  workspace: "Workspace",
  keyboard: "Keyboard",
  "project-template": "Project Template",
  fusion: "Fusion",
  fairlight: "Audio",
  powergrade: "PowerGrade",
  timeline: "Timeline",
  project: "Project",
  render: "Render",
};

function statusLabel(status: BundleStatusKind, installing?: boolean): string {
  if (installing) return "Installing…";
  switch (status) {
    case "installed":
      return "Up to date";
    case "update":
      return "Update available";
    case "notinstalled":
      return "Not installed";
    case "error":
      return "Install failed";
    default:
      return "";
  }
}

function StatusIconLarge({
  status,
  installing,
}: {
  status: BundleStatusKind;
  installing?: boolean;
}) {
  const dim = "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center";
  if (installing)
    return (
      <div className={`${dim} bg-mcm-blue-tint text-mcm-blue`}>
        <IconLoader2 size={22} stroke={2.25} className="animate-spin" />
      </div>
    );
  switch (status) {
    case "installed":
      return (
        <div className={`${dim} bg-success-bg text-success-fg`}>
          <IconCheck size={22} stroke={2.25} />
        </div>
      );
    case "update":
      return (
        <div className={`${dim} bg-mcm-blue text-white`}>
          <IconArrowUp size={22} stroke={2.25} />
        </div>
      );
    case "error":
      return (
        <div className={`${dim} bg-error-bg text-error-fg`}>
          <IconAlertTriangle size={22} stroke={2.25} />
        </div>
      );
    default:
      return (
        <div className={`${dim} bg-not-installed-bg text-not-installed-fg`}>
          <IconCircle size={22} stroke={2.25} />
        </div>
      );
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const FILES_PREVIEW = 10;

export function BundleDetailView({
  bundle,
  status,
  installed,
  installing,
  errorMessage,
  onBack,
  onReinstall,
  onRemove,
  onReveal,
  onRestore,
}: BundleDetailViewProps) {
  const [filesExpanded, setFilesExpanded] = useState(false);

  const previous = installed?.previousInstall;
  const canRestore = !!onRestore && !!previous;
  const categoryLabel =
    bundle.category === "premiere" ? "Premiere Pro" : "DaVinci Resolve";
  const presetLabel = PRESET_LABEL[bundle.presetType] ?? bundle.presetType;
  const installedFiles = installed?.files ?? [];
  const installPath =
    installedFiles[0] ? installedFiles[0].replace(/[\\/][^\\/]+$/, "") : null;

  const allFiles = bundle.files;
  const hasMore = allFiles.length > FILES_PREVIEW;
  const visibleFiles = filesExpanded ? allFiles : allFiles.slice(0, FILES_PREVIEW);
  const hiddenCount = allFiles.length - FILES_PREVIEW;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Sticky header */}
      <div className="flex-none flex items-center gap-2.5 border-b border-border bg-surface px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md p-1 text-[13px] text-mcm-blue hover:bg-border-soft"
        >
          <IconArrowLeft size={16} stroke={2} />
          Back
        </button>
        <div className="flex-1 text-center text-[13px] text-body">Bundle details</div>
        <div className="w-12" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pb-4 pt-6">
          <div className="mb-4 flex items-start gap-3.5">
            <StatusIconLarge status={status} installing={installing} />
            <div className="flex-1">
              <div className="text-[17px] font-semibold text-ink">{bundle.name}</div>
              <div className="mt-0.5 text-[12px] text-body">
                {categoryLabel} · {presetLabel} · {statusLabel(status, installing)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] tracking-wide text-muted">VERSION</div>
              <div className="text-[16px] font-medium tabular-nums text-ink">
                {bundle.version}
              </div>
            </div>
          </div>

          {bundle.description && (
            <div className="rounded-lg border border-border bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-body">
              {bundle.description}
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="mx-5 mb-3 rounded-lg border border-error-border bg-error-row-bg px-3.5 py-2.5 text-[12px] text-error-fg">
            {errorMessage}
          </div>
        )}

        <section className="px-5 pb-3">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[11px] tracking-wide text-muted">FILES ({allFiles.length})</div>
            {bundle.updatedAt && (
              <div className="text-[11px] text-muted">
                Published {formatDate(bundle.updatedAt)}
              </div>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {visibleFiles.map((file) => (
              <div
                key={file}
                className="flex items-center gap-2.5 border-b border-border px-3.5 py-2 last:border-b-0"
              >
                <IconFile size={14} stroke={2} className="shrink-0 text-muted" />
                <span className="flex-1 truncate text-[12px] text-ink">{file}</span>
              </div>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => setFilesExpanded((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-border px-3.5 py-2 text-[12px] text-mcm-blue hover:bg-border-soft"
              >
                {filesExpanded ? (
                  <>
                    <IconChevronUp size={13} stroke={2} />
                    Show fewer files
                  </>
                ) : (
                  <>
                    <IconChevronDown size={13} stroke={2} />
                    Show {hiddenCount} more file{hiddenCount === 1 ? "" : "s"}
                  </>
                )}
              </button>
            )}
          </div>
        </section>

        {installPath && (
          <section className="px-5 pb-3">
            <div className="mb-2 text-[11px] tracking-wide text-muted">INSTALLED AT</div>
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <IconFolder size={16} stroke={2} className="shrink-0 text-muted" />
              <span className="flex-1 break-all font-mono text-[12px] text-body">
                {installPath}
              </span>
              <button
                type="button"
                aria-label="Open in Explorer"
                onClick={onReveal}
                className="shrink-0 rounded-md p-1 text-mcm-blue hover:bg-border-soft"
              >
                <IconExternalLink size={16} stroke={2} />
              </button>
            </div>
          </section>
        )}

        {installed && (
          <section className="px-5 pb-4">
            <div className="mb-2 text-[11px] tracking-wide text-muted">DETAILS</div>
            <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-muted">Installed</span>
                <span className="text-ink">{formatDate(installed.installedAt)}</span>
              </div>
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-muted">File count</span>
                <span className="text-ink">{installed.files.length}</span>
              </div>
              {previous && (
                <div className="flex justify-between py-1 text-[13px]">
                  <span className="text-muted">Previous version</span>
                  <span className="text-ink tabular-nums">
                    v{previous.version} · {formatDate(previous.archivedAt)}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Sticky footer */}
      <div className="flex-none border-t border-border bg-surface px-5 py-3.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReinstall}
            disabled={installing}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-border-soft disabled:opacity-50"
          >
            <IconRefresh size={16} stroke={2} />
            {installed ? "Reinstall" : "Install"}
          </button>
          <button
            type="button"
            onClick={onReveal}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-border-soft"
          >
            <IconFolder size={16} stroke={2} />
            Open folder
          </button>
          {installed && (
            <button
              type="button"
              onClick={onRemove}
              disabled={installing}
              className="flex items-center justify-center gap-1.5 rounded-md border border-error-border bg-white px-3.5 py-2 text-[13px] text-error-fg hover:bg-error-row-bg disabled:opacity-50"
            >
              <IconTrash size={16} stroke={2} />
              Remove
            </button>
          )}
        </div>
        {canRestore && (
          <button
            type="button"
            onClick={onRestore}
            disabled={installing}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-border-soft disabled:opacity-50"
            title={`Restore v${previous!.version} archived ${formatDate(previous!.archivedAt)}`}
          >
            <IconArrowBackUp size={16} stroke={2} />
            Restore previous version (v{previous!.version})
          </button>
        )}
      </div>
    </div>
  );
}
