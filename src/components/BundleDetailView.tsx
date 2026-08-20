import { useEffect, useMemo, useState } from "react";
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
import { installRoot } from "../lib/installPath";
import { isTauri, previewInstall, type PreviewFile } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";

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

// Group tones. The pill's WORD carries the meaning, so colour stays redundant
// rather than load-bearing — readable in greyscale and for colourblind users.
type GroupTone = "blue" | "green" | "red" | "muted";

const TONE_HEADER: Record<GroupTone, string> = {
  blue: "text-mcm-blue",
  green: "text-success-fg",
  red: "text-error-fg",
  muted: "text-muted",
};

const TONE_PILL: Record<GroupTone, string> = {
  blue: "bg-mcm-blue/15 text-mcm-blue",
  green: "bg-success-bg text-success-fg",
  red: "bg-error-bg text-error-fg",
  muted: "bg-border-soft text-muted",
};

const GROUP_PILL_LABEL: Record<string, string> = {
  update: "update",
  new: "new",
  remove: "will remove",
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
  // How many already-installed files to render. Bundles run to 1,000+ files
  // (the LUT packs), so the settled group reveals in pages instead of dumping
  // every row into the DOM at once.
  const [shownSettled, setShownSettled] = useState(FILES_PREVIEW);
  useEffect(() => {
    setShownSettled(FILES_PREVIEW);
  }, [bundle.id]);

  const previous = installed?.previousInstall;
  const canRestore = !!onRestore && !!previous;
  const categoryLabel =
    bundle.category === "premiere" ? "Premiere Pro" : "DaVinci Resolve";
  const presetLabel = PRESET_LABEL[bundle.presetType] ?? bundle.presetType;
  const installPath = installRoot(bundle, installed);

  // What would an install actually change? Ask the backend, which answers with
  // the same size check the installer uses to skip unchanged files.
  const pathOverride = useAppStore(
    (s) => s.persisted.pathOverrides[`${bundle.category}:${bundle.presetType}`] ?? null
  );
  const [preview, setPreview] = useState<PreviewFile[] | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const priorSizes = installed?.fileSizes ?? null;
  const installedPaths = installed?.files ?? null;

  useEffect(() => {
    if (!isTauri() || status !== "update") {
      setPreview(null);
      setPreviewFailed(false);
      return;
    }
    let cancelled = false;
    setPreview(null);
    setPreviewFailed(false);
    void previewInstall(bundle, pathOverride, priorSizes, installedPaths)
      .then((rows) => { if (!cancelled) setPreview(rows); })
      .catch(() => { if (!cancelled) setPreviewFailed(true); });
    return () => { cancelled = true; };
  }, [bundle, status, pathOverride, priorSizes, installedPaths]);

  const statusByFile = useMemo(() => {
    const m: Record<string, PreviewFile["status"]> = {};
    for (const r of preview ?? []) m[r.name] = r.status;
    return m;
  }, [preview]);

  // Files dropped upstream. They are not in bundle.files any more, so they only
  // exist in the preview — surface them or the deletion looks like a no-op.
  const removeRows = useMemo(
    () => (preview ?? []).filter((r) => r.status === "remove"),
    [preview]
  );
  const newCount = (preview ?? []).filter((r) => r.status === "new").length;
  const changedCount = (preview ?? []).filter((r) => r.status === "update").length;
  const removeCount = removeRows.length;
  const pendingCount = newCount + changedCount + removeCount;

  // Group the list so the work this update will actually do sits at the top and
  // everything already in place collapses underneath it.
  const groups = useMemo(() => {
    const sorted = (arr: string[]) => [...arr].sort((a, b) => a.localeCompare(b));
    if (!preview) {
      return [
        { key: "all", label: "Files", tone: "muted" as GroupTone, files: sorted(bundle.files) },
      ];
    }
    const pick = (s: string) =>
      sorted(bundle.files.filter((f) => statusByFile[f] === s));
    const settled = sorted(
      bundle.files.filter((f) => !statusByFile[f] || statusByFile[f] === "unchanged")
    );
    const out: { key: string; label: string; tone: GroupTone; files: string[] }[] = [];
    const upd = pick("update");
    const fresh = pick("new");
    if (upd.length) out.push({ key: "update", label: "Will update", tone: "blue", files: upd });
    if (fresh.length) out.push({ key: "new", label: "New", tone: "green", files: fresh });
    if (removeRows.length)
      out.push({
        key: "remove",
        label: "Will remove",
        tone: "red",
        files: sorted(removeRows.map((r) => r.name)),
      });
    if (settled.length)
      out.push({ key: "unchanged", label: "Already installed", tone: "muted", files: settled });
    return out;
  }, [bundle.files, preview, statusByFile, removeRows]);

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
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[11px] tracking-wide text-muted">
              FILES ({bundle.files.length})
            </span>
            {status === "update" && (
              <span className="text-[11px] text-body">
                {preview
                  ? pendingCount === 0
                    ? "Nothing to download — all files already current"
                    : [
                        changedCount > 0 ? `${changedCount} to update` : null,
                        newCount > 0 ? `${newCount} new` : null,
                        removeCount > 0 ? `${removeCount} will remove` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                  : previewFailed
                    ? "Could not check which files will change"
                    : "Checking which files will change…"}
              </span>
            )}
          </div>

          {/* A window inside the window: this list scrolls on its own, so a
              1,000-file bundle never turns into a 1,000-row page. Sticky group
              headers keep the reader oriented, and the groups that represent
              actual work sort above the settled files. */}
          <div className="max-h-[360px] min-h-[120px] overflow-y-auto rounded-lg border border-border bg-surface">
            {groups.map((group) => {
              const settled = group.tone === "muted";
              const shown = settled ? group.files.slice(0, shownSettled) : group.files;
              const hidden = group.files.length - shown.length;
              const nextPage = Math.min(100, hidden);
              return (
                <div key={group.key}>
                  {groups.length > 1 && (
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-3.5 py-1.5">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider ${TONE_HEADER[group.tone]}`}
                      >
                        {group.label}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted">
                        {group.files.length}
                      </span>
                    </div>
                  )}
                  {shown.map((file) => (
                    <div
                      key={`${group.key}:${file}`}
                      className="flex items-center gap-2.5 border-b border-border px-3.5 py-2"
                    >
                      <IconFile size={14} stroke={2} className="shrink-0 text-muted" />
                      <span
                        className={`flex-1 truncate text-[12px] ${
                          group.key === "remove" ? "text-muted line-through" : "text-ink"
                        }`}
                      >
                        {file}
                      </span>
                      {GROUP_PILL_LABEL[group.key] && (
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-wide ${TONE_PILL[group.tone]}`}
                        >
                          {GROUP_PILL_LABEL[group.key]}
                        </span>
                      )}
                      {group.key !== "remove" && bundle.fileDates?.[file] && (
                        <span className="shrink-0 text-[11px] text-muted tabular-nums">
                          {formatDate(bundle.fileDates[file])}
                        </span>
                      )}
                    </div>
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setShownSettled((n) => n + 100)}
                      className="flex w-full items-center justify-center gap-1.5 border-b border-border px-3.5 py-2 text-[12px] text-mcm-blue hover:bg-border-soft"
                    >
                      <IconChevronDown size={13} stroke={2} />
                      Show {nextPage} more
                      <span className="tabular-nums text-muted">
                        ({hidden.toLocaleString()} hidden)
                      </span>
                    </button>
                  )}
                  {settled && shownSettled > FILES_PREVIEW && (
                    <button
                      type="button"
                      onClick={() => setShownSettled(FILES_PREVIEW)}
                      className="flex w-full items-center justify-center gap-1.5 border-b border-border px-3.5 py-2 text-[12px] text-mcm-blue hover:bg-border-soft"
                    >
                      <IconChevronUp size={13} stroke={2} />
                      Collapse
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {installPath && (
          <section className="px-5 pb-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.09em] text-muted">
              Installed at
            </div>
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
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.09em] text-muted">
              Details
            </div>
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

        {/* Say plainly what Remove destroys and what survives, so the button in
            the footer isn't a guess. */}
        {installed && (
          <section className="px-5 pb-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.09em] text-error-fg">
              Danger zone
            </div>
            <div className="rounded-lg border border-error-border bg-error-row-bg px-3.5 py-3">
              <div className="text-[12.5px] font-semibold text-error-fg">
                Remove this bundle
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-body">
                Deletes{" "}
                <span className="tabular-nums font-medium">
                  {installed.files.length.toLocaleString()}
                </span>{" "}
                {installed.files.length === 1 ? "file" : "files"} from this
                computer. Your team's copy in the shared repository is not
                touched, so you can install it again at any time.
              </div>
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
