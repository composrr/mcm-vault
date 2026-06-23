import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconCloudUpload,
  IconExternalLink,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconLoader2,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import type { Bundle, PublisherBundleState } from "../types";
import {
  listenPublishProgress,
  publishBundles,
  publisherDefaultSource,
  resolveTarget,
  revealPath,
  revertLastPublish,
  scanPublishDiffs,
  type BundleDiff,
  type PublishPlan,
} from "../lib/tauri";
import { PublishProgressModal } from "./PublishProgressModal";
import { useAppStore } from "../store/useAppStore";

function bumpPatch(v: string): string {
  const parts = v.split(".");
  if (parts.length === 2) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (Number.isInteger(a) && Number.isInteger(b)) return `${a}.${b + 1}`;
  }
  if (parts.length === 3) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const c = Number(parts[2]);
    if (Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c))
      return `${a}.${b}.${c + 1}`;
  }
  return `${v}.1`;
}

interface BundleChangeSummary {
  bundleId: string;
  name: string;
  oldVersion: string;
  newVersion: string;
  added: string[];
  removed: string[];
  modified: string[];
}

interface PublisherViewProps {
  bundles: Bundle[];
  folderLabel: string;
}

interface DiffStatus {
  diff: BundleDiff;
  publishedVersion: string | null;
  publishedAt: string | null;
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent);

function repoNameToLocalName(presetType: string, repoName: string): string | null {
  if (presetType !== "keyboard") return repoName;
  const normalized = repoName.replace(/\\/g, "/");
  if (normalized.startsWith("win/")) return IS_MAC ? null : normalized.slice(4);
  if (normalized.startsWith("mac/")) return IS_MAC ? normalized.slice(4) : null;
  return null;
}

function formatError(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message?: unknown }).message ?? e);
  if (typeof e === "string") return e;
  return JSON.stringify(e);
}

const CATEGORY_LABEL: Record<string, string> = {
  premiere: "Premiere Pro",
  resolve: "DaVinci Resolve",
};

const PRESET_LABEL: Record<string, string> = {
  export: "Export", effect: "Effect", lumetri: "Lumetri", lut: "LUT",
  audio: "Audio", sequence: "Sequence", caption: "Caption", mogrt: "MOGRT",
  workspace: "Workspace", keyboard: "Keyboard", "project-template": "Project Template",
  fusion: "Fusion", fairlight: "Audio", powergrade: "PowerGrade",
  timeline: "Timeline", project: "Project", render: "Render",
};

// ─── Main Component ────────────────────────────────────────────────────────

export function PublisherView({ bundles, folderLabel }: PublisherViewProps) {
  const persisted = useAppStore((s) => s.persisted);
  const setPersisted = useAppStore((s) => s.setPersisted);

  const [diffs, setDiffs] = useState<Record<string, DiffStatus>>({});
  const [scanning, setScanning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [selectedBundleId, setSelectedBundleId] = useState<string>("");

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishPhases, setPublishPhases] = useState<Record<string, string>>({});
  const [publishCommitPhase, setPublishCommitPhase] = useState<"idle" | "committing" | "complete">("idle");
  const [publishModalDone, setPublishModalDone] = useState(false);
  const [publishPlanIds, setPublishPlanIds] = useState<string[]>([]);
  const [publishPlanNames, setPublishPlanNames] = useState<Record<string, string>>({});
  const publishUnlistenRef = useRef<(() => void) | null>(null);

  const publisherEntries = persisted.publisher;

  const selectedFor = (bundleId: string): Set<string> => {
    return new Set(persisted.publisher[bundleId]?.includedFiles ?? []);
  };

  const bundlesById = useMemo(() => {
    const m: Record<string, Bundle> = {};
    for (const b of bundles) m[b.id] = b;
    return m;
  }, [bundles]);

  const scan = async () => {
    setScanning(true);
    setPublishError(null);
    try {
      const freshState = useAppStore.getState();
      const freshBundles = freshState.manifest?.bundles ?? bundles;
      const freshPublisher = freshState.persisted.publisher;
      const freshBundlesById: Record<string, Bundle> = Object.fromEntries(
        freshBundles.map((b) => [b.id, b])
      );
      const nextPublisher = { ...freshPublisher };
      const inputs = await Promise.all(
        freshBundles.map(async (b) => {
          const sourcePath = await publisherDefaultSource(b, folderLabel);
          const existing = freshPublisher[b.id];
          nextPublisher[b.id] = {
            sourcePath,
            lastPublishedFiles: existing?.lastPublishedFiles ?? {},
            lastPublishedAt: existing?.lastPublishedAt ?? null,
            lastPublishedVersion: existing?.lastPublishedVersion ?? null,
            includedFiles: existing?.includedFiles ?? [],
          };
          return {
            bundleId: b.id,
            sourcePath,
            baseline: existing?.lastPublishedFiles ?? {},
          };
        })
      );
      const results = await scanPublishDiffs(inputs);
      for (const diff of results) {
        const bundle = freshBundlesById[diff.bundleId];
        if (!bundle) continue;
        const localNames = new Set(diff.currentFiles.map((f) => f.name));
        const seeded = bundle.files
          .map((n) => repoNameToLocalName(bundle.presetType, n))
          .filter((n): n is string => n !== null && localNames.has(n));
        nextPublisher[diff.bundleId] = {
          ...nextPublisher[diff.bundleId],
          includedFiles: seeded,
        };
      }
      setPersisted({ publisher: nextPublisher });
      const mapped: Record<string, DiffStatus> = {};
      for (const diff of results) {
        const entry = nextPublisher[diff.bundleId];
        mapped[diff.bundleId] = {
          diff,
          publishedVersion: entry?.lastPublishedVersion ?? null,
          publishedAt: entry?.lastPublishedAt ?? null,
        };
      }
      setDiffs(mapped);
    } catch (e) {
      setPublishError(formatError(e));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundles.length]);

  const toggleFile = (bundleId: string, fileName: string) => {
    const existing = persisted.publisher[bundleId];
    const cur = new Set(existing?.includedFiles ?? []);
    if (cur.has(fileName)) cur.delete(fileName);
    else cur.add(fileName);
    setPersisted({
      publisher: {
        ...persisted.publisher,
        [bundleId]: {
          ...(existing ?? { sourcePath: "", lastPublishedFiles: {}, lastPublishedAt: null, lastPublishedVersion: null, includedFiles: [] }),
          includedFiles: Array.from(cur).sort(),
        },
      },
    });
  };

  const toggleFiles = (bundleId: string, fileNames: string[], checked: boolean) => {
    const existing = persisted.publisher[bundleId];
    const cur = new Set(existing?.includedFiles ?? []);
    for (const name of fileNames) {
      if (checked) cur.add(name);
      else cur.delete(name);
    }
    setPersisted({
      publisher: {
        ...persisted.publisher,
        [bundleId]: {
          ...(existing ?? { sourcePath: "", lastPublishedFiles: {}, lastPublishedAt: null, lastPublishedVersion: null, includedFiles: [] }),
          includedFiles: Array.from(cur).sort(),
        },
      },
    });
  };

  const updateSourcePath = (bundleId: string, path: string) => {
    setPersisted({
      publisher: {
        ...persisted.publisher,
        [bundleId]: {
          ...(persisted.publisher[bundleId] ?? { sourcePath: "", lastPublishedFiles: {}, lastPublishedAt: null, lastPublishedVersion: null }),
          sourcePath: path,
        },
      },
    });
  };

  const bundleHasChanges = (bundleId: string): boolean => {
    const bundle = bundlesById[bundleId];
    if (!bundle) return false;
    const status = diffs[bundleId];
    if (!status) return false;
    const localNames = new Set(status.diff.currentFiles.map((f) => f.name));
    const sel = selectedFor(bundleId);
    const manifestSet = new Set(bundle.files);
    for (const name of localNames) {
      if (manifestSet.has(name) !== sel.has(name)) return true;
    }
    if (status.diff.modified.some((name) => sel.has(name))) return true;
    return false;
  };

  const totalChangedBundles = useMemo(
    () => bundles.filter((b) => bundleHasChanges(b.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundles, persisted.publisher, diffs]
  );

  const buildSummaries = (): BundleChangeSummary[] =>
    bundles
      .filter((b) => bundleHasChanges(b.id))
      .map((b) => {
        const status = diffs[b.id];
        const sel = selectedFor(b.id);
        const manifestSet = new Set(b.files);
        const localFiles = status?.diff.currentFiles ?? [];
        const modifiedSet = new Set(status?.diff.modified ?? []);
        const added: string[] = [];
        const removed: string[] = [];
        const modified: string[] = [];
        for (const f of localFiles) {
          const inManifest = manifestSet.has(f.name);
          const isSel = sel.has(f.name);
          if (isSel && !inManifest) added.push(f.name);
          else if (!isSel && inManifest) removed.push(f.name);
          else if (isSel && modifiedSet.has(f.name)) modified.push(f.name);
        }
        return {
          bundleId: b.id,
          name: b.name,
          oldVersion: b.version,
          newVersion: bumpPatch(b.version),
          added,
          removed,
          modified,
        };
      });

  const revert = async () => {
    const lp = persisted.lastPublish;
    if (!lp) return;
    setReverting(true);
    setPublishError(null);
    setPublishMessage(null);
    try {
      const newSha = await revertLastPublish(lp.sha);
      await setPersisted({ lastPublish: null });
      setPublishMessage(`Reverted ${lp.summary}.${newSha ? ` Revert commit ${newSha.slice(0, 7)}.` : ""}`);
      try { await useAppStore.getState().refreshManifest(); } catch {}
      await scan();
    } catch (e) {
      setPublishError(formatError(e));
    } finally {
      setReverting(false);
    }
  };

  const publish = async () => {
    setShowConfirm(false);
    setPublishing(true);
    setPublishError(null);
    setPublishMessage(null);
    try {
      const plans: PublishPlan[] = bundles
        .filter((b) => bundleHasChanges(b.id))
        .map((b) => {
          const status = diffs[b.id];
          const sel = selectedFor(b.id);
          return {
            bundleId: b.id,
            sourcePath: status?.diff.sourcePath ?? "",
            includedFileNames: Array.from(sel).sort(),
            presetType: b.presetType,
          };
        });
      if (plans.length === 0) { setPublishMessage("Nothing to publish."); return; }

      // Open progress modal and set up event listener before calling publish
      const ids = plans.map((p) => p.bundleId);
      const names: Record<string, string> = {};
      for (const p of plans) names[p.bundleId] = bundlesById[p.bundleId]?.name ?? p.bundleId;
      setPublishPlanIds(ids);
      setPublishPlanNames(names);
      setPublishPhases(Object.fromEntries(ids.map((id) => [id, "queued"])));
      setPublishCommitPhase("idle");
      setPublishModalDone(false);
      setPublishModalOpen(true);

      if (publishUnlistenRef.current) publishUnlistenRef.current();
      const unlisten = await listenPublishProgress((event) => {
        if (!event.bundleId) {
          if (event.phase === "committing") setPublishCommitPhase("committing");
          else if (event.phase === "complete") setPublishCommitPhase("complete");
        } else {
          setPublishPhases((prev) => ({ ...prev, [event.bundleId!]: event.phase }));
        }
      });
      publishUnlistenRef.current = unlisten;

      const result = await publishBundles(plans);
      const nowIso = new Date().toISOString();
      const updated = { ...persisted.publisher };
      for (const p of result.published) {
        updated[p.bundleId] = {
          ...(updated[p.bundleId] ?? { sourcePath: "", lastPublishedFiles: {}, lastPublishedAt: null, lastPublishedVersion: null }),
          lastPublishedFiles: p.fileSignatures,
          lastPublishedAt: p.publishedAt ?? nowIso,
          lastPublishedVersion: p.newVersion,
        };
      }
      const summaryText = result.published
        .map((p) => `${bundlesById[p.bundleId]?.name ?? p.bundleId} → v${p.newVersion}`)
        .join(", ");
      await setPersisted({
        publisher: updated,
        lastPublish: result.commitSha
          ? { sha: result.commitSha, summary: summaryText, publishedAt: nowIso }
          : persisted.lastPublish,
      });
      setPublishMessage(`Published ${result.published.length} ${result.published.length === 1 ? "bundle" : "bundles"}.${result.commitSha ? ` Commit ${result.commitSha.slice(0, 7)}.` : ""}`);
      try { await useAppStore.getState().refreshManifest(); } catch {}
      await scan();
    } catch (e) {
      setPublishError(formatError(e));
    } finally {
      setPublishing(false);
      setPublishModalDone(true);
      if (publishUnlistenRef.current) {
        publishUnlistenRef.current();
        publishUnlistenRef.current = null;
      }
    }
  };

  const handlePublishModalDismiss = useCallback(() => {
    setPublishModalOpen(false);
  }, []);

  const selectedBundle = selectedBundleId ? bundlesById[selectedBundleId] ?? null : null;
  const inDetail = !!selectedBundle;

  const categories = useMemo(() => {
    const groups: { key: string; label: string; bundles: Bundle[] }[] = [];
    for (const cat of ["premiere", "resolve"]) {
      const group = bundles.filter((b) => b.category === cat);
      if (group.length > 0) groups.push({ key: cat, label: CATEGORY_LABEL[cat] ?? cat, bundles: group });
    }
    return groups;
  }, [bundles]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none flex items-center gap-2 border-b border-border bg-surface px-5 py-3">
        {inDetail ? (
          <>
            <button
              type="button"
              onClick={() => setSelectedBundleId("")}
              className="flex items-center gap-1 rounded-md p-1 text-[13px] text-mcm-blue hover:bg-border-soft"
            >
              <IconArrowLeft size={16} stroke={2} />
              Back
            </button>
            <span className="flex-1 truncate text-center text-[13px] font-medium text-ink">
              {selectedBundle.name}
            </span>
            {bundleHasChanges(selectedBundle.id) && (
              <span className="shrink-0 rounded-full bg-mcm-blue px-2 py-0.5 text-[10px] font-medium text-white">
                changed
              </span>
            )}
            <div className="w-[52px]" />
          </>
        ) : (
          <>
            <IconCloudUpload size={16} stroke={2} className="text-mcm-blue" />
            <span className="flex-1 text-[13px] font-medium text-ink">Publisher</span>
            {totalChangedBundles > 0 && !scanning && (
              <span className="rounded-full bg-mcm-blue px-2 py-0.5 text-[10px] font-medium text-white tabular-nums">
                {totalChangedBundles} changed
              </span>
            )}
            <button
              type="button"
              onClick={() => void scan()}
              disabled={scanning}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-mcm-blue hover:bg-mcm-blue-tint disabled:opacity-50"
            >
              <IconRefresh size={14} stroke={2} className={scanning ? "animate-spin" : ""} />
              {scanning ? "Scanning…" : "Rescan"}
            </button>
          </>
        )}
      </div>

      {/* Quick-jump dropdown (always visible) */}
      <div className="flex-none border-b border-border bg-surface px-4 py-2.5">
        <select
          value={selectedBundleId}
          onChange={(e) => setSelectedBundleId(e.target.value)}
          className="w-full rounded-md border border-border-strong bg-white px-3 py-1.5 text-[12.5px] text-ink focus:border-mcm-blue focus:outline-none"
        >
          <option value="">Jump to bundle…</option>
          {categories.map((cat) => (
            <optgroup key={cat.key} label={cat.label}>
              {cat.bundles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{bundleHasChanges(b.id) ? " ●" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {inDetail ? (
          <BundlePanel
            bundle={selectedBundle}
            folderLabel={folderLabel}
            status={diffs[selectedBundle.id] ?? null}
            entry={publisherEntries[selectedBundle.id] ?? null}
            selected={selectedFor(selectedBundle.id)}
            dirty={bundleHasChanges(selectedBundle.id)}
            onToggleFile={(name) => toggleFile(selectedBundle.id, name)}
            onToggleFiles={(names, checked) => toggleFiles(selectedBundle.id, names, checked)}
            onUpdateSourcePath={(path) => updateSourcePath(selectedBundle.id, path)}
            onReveal={(path) => void revealPath(path).catch(() => {})}
          />
        ) : (
          /* Bundle list — grouped by category */
          <div className="pb-2">
            {categories.map((cat) => (
              <div key={cat.key}>
                <div className="sticky top-0 z-10 bg-surface px-5 pb-1 pt-3">
                  <span className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">
                    {cat.label}
                  </span>
                </div>
                <div>
                  {cat.bundles.map((bundle) => {
                    const status = diffs[bundle.id];
                    const entry = publisherEntries[bundle.id];
                    const hasChanges = bundleHasChanges(bundle.id);
                    const fileCount = status?.diff.currentFiles.length ?? bundle.files.length;
                    const addCount = hasChanges
                      ? status?.diff.currentFiles.filter(
                          (f) => selectedFor(bundle.id).has(f.name) && !new Set(bundle.files).has(f.name)
                        ).length ?? 0
                      : 0;
                    const modCount = hasChanges
                      ? (status?.diff.modified ?? []).filter((n) => selectedFor(bundle.id).has(n)).length
                      : 0;
                    const remCount = hasChanges
                      ? bundle.files.filter(
                          (n) => status?.diff.currentFiles.every((f) => f.name !== n) ?? false
                        ).length
                      : 0;
                    const presetLabel = PRESET_LABEL[bundle.presetType] ?? bundle.presetType;
                    const isPublished = !!entry?.lastPublishedVersion;

                    return (
                      <button
                        key={bundle.id}
                        type="button"
                        onClick={() => setSelectedBundleId(bundle.id)}
                        className="flex w-full items-center gap-2.5 border-b border-border-soft px-5 py-1.5 text-left transition-colors hover:bg-border-soft/60 last:border-b-0"
                      >
                        {/* Status icon */}
                        <div className="shrink-0 w-[18px] flex items-center justify-center">
                          {scanning ? (
                            <IconLoader2 size={14} stroke={2} className="animate-spin text-muted" />
                          ) : hasChanges ? (
                            <div className="h-3.5 w-3.5 rounded-full bg-mcm-blue" />
                          ) : isPublished ? (
                            <IconCheck size={16} stroke={2} className="text-success-fg" />
                          ) : (
                            <IconFile size={16} stroke={2} className="text-muted" />
                          )}
                        </div>

                        {/* Name + meta */}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium leading-tight text-ink">
                            {bundle.name}
                          </div>
                          <div className="text-[10.5px] leading-tight text-muted">
                            {presetLabel} · {fileCount} file{fileCount === 1 ? "" : "s"}
                            {isPublished && entry?.lastPublishedVersion ? ` · v${entry.lastPublishedVersion}` : ""}
                          </div>
                        </div>

                        {/* Change badges */}
                        {hasChanges && (
                          <div className="flex shrink-0 items-center gap-1">
                            {addCount > 0 && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-success-bg text-success-fg">+{addCount}</span>
                            )}
                            {modCount > 0 && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-mcm-blue/15 text-mcm-blue">~{modCount}</span>
                            )}
                            {remCount > 0 && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-error-bg text-error-fg">-{remCount}</span>
                            )}
                          </div>
                        )}

                        <IconChevronRight size={13} stroke={2} className="shrink-0 text-muted" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-none border-t border-border bg-surface px-5 py-3">
        {publishError && (
          <div className="mb-2 rounded-md border border-error-border bg-error-row-bg px-3 py-2 text-[12px] text-error-fg">
            {publishError}
          </div>
        )}
        {publishMessage && (
          <div className="mb-2 rounded-md border border-mcm-blue/30 bg-mcm-blue-tint px-3 py-2 text-[12px] text-mcm-blue">
            {publishMessage}{" "}
            <a
              href="https://github.com/composrr/mcm-vault-presets"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline"
            >
              View repo <IconExternalLink size={12} stroke={2} />
            </a>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={publishing || reverting || totalChangedBundles === 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {publishing ? (
            <IconLoader2 size={16} stroke={2} className="animate-spin" />
          ) : (
            <IconCloudUpload size={16} stroke={2} />
          )}
          {publishing
            ? "Publishing…"
            : totalChangedBundles === 0
              ? "No changes to publish"
              : `Publish ${totalChangedBundles} changed ${totalChangedBundles === 1 ? "bundle" : "bundles"}`}
        </button>
        {persisted.lastPublish && (
          <button
            type="button"
            onClick={() => void revert()}
            disabled={publishing || reverting}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-white px-4 py-2 text-[12px] text-body hover:bg-border-soft disabled:opacity-50"
            title={`Undo: ${persisted.lastPublish.summary}`}
          >
            {reverting ? (
              <IconLoader2 size={14} stroke={2} className="animate-spin" />
            ) : (
              <IconArrowBackUp size={14} stroke={2} />
            )}
            {reverting ? "Reverting…" : `Revert last publish (${persisted.lastPublish.summary})`}
          </button>
        )}
      </div>

      {showConfirm && (
        <PublishConfirmDialog
          summaries={buildSummaries()}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => void publish()}
        />
      )}

      {publishModalOpen && (
        <PublishProgressModal
          planIds={publishPlanIds}
          names={publishPlanNames}
          phases={publishPhases}
          commitPhase={publishCommitPhase}
          done={publishModalDone}
          error={publishError}
          onDismiss={handlePublishModalDismiss}
        />
      )}
    </div>
  );
}

// ─── Publish confirm dialog ────────────────────────────────────────────────

interface PublishConfirmDialogProps {
  summaries: BundleChangeSummary[];
  onCancel: () => void;
  onConfirm: () => void;
}

function PublishConfirmDialog({ summaries, onCancel, onConfirm }: PublishConfirmDialogProps) {
  const totalRemovals = summaries.reduce((n, s) => n + s.removed.length, 0);
  const totalAdds = summaries.reduce((n, s) => n + s.added.length, 0);
  const totalMods = summaries.reduce((n, s) => n + s.modified.length, 0);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
      <div className="flex max-h-[85%] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-white shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[14px] font-semibold text-ink">Publish to the team?</div>
          <div className="mt-0.5 text-[11px] text-muted">
            {summaries.length} bundle{summaries.length === 1 ? "" : "s"} · {totalAdds} added ·{" "}
            {totalRemovals} removed · {totalMods} modified
          </div>
        </div>

        {totalRemovals > 0 && (
          <div className="flex items-start gap-2 border-b border-error-border bg-error-row-bg px-4 py-2.5 text-[12px] text-error-fg">
            <IconAlertTriangle size={15} stroke={2} className="mt-0.5 shrink-0" />
            <span>
              {totalRemovals} file{totalRemovals === 1 ? "" : "s"} will be{" "}
              <strong>removed</strong> from the shared bundle. Teammates keep their local copies, but
              the file leaves the repo. Double-check this is intentional.
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {summaries.map((s) => (
            <div key={s.bundleId} className="mb-3 last:mb-0 rounded-md border border-border bg-surface px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-ink">{s.name}</span>
                <span className="shrink-0 tabular-nums text-[11px] text-muted">
                  v{s.oldVersion} → <span className="text-mcm-blue">v{s.newVersion}</span>
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {s.added.map((n) => (<div key={`a-${n}`} className="text-[11.5px] text-success-fg">+ {n}</div>))}
                {s.modified.map((n) => (<div key={`m-${n}`} className="text-[11.5px] text-mcm-blue">~ {n}</div>))}
                {s.removed.map((n) => (<div key={`r-${n}`} className="text-[11.5px] text-error-fg">− {n}</div>))}
                {s.added.length === 0 && s.modified.length === 0 && s.removed.length === 0 && (
                  <div className="text-[11.5px] text-muted">Version bump only</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium text-white ${
              totalRemovals > 0 ? "bg-error-fg hover:opacity-90" : "bg-mcm-blue hover:bg-mcm-blue-hover"
            }`}
          >
            <IconCloudUpload size={15} stroke={2} />
            {totalRemovals > 0 ? "Publish with removals" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── File tree types + helpers ─────────────────────────────────────────────

interface FileTreeDir {
  name: string;
  dirs: FileTreeDir[];
  files: Array<{ name: string; size: number }>;
}

function buildFileTree(files: Array<{ name: string; size: number }>): FileTreeDir {
  const root: FileTreeDir = { name: "", dirs: [], files: [] };
  for (const f of files) {
    const parts = f.name.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.dirs.find((d) => d.name === parts[i]);
      if (!child) { child = { name: parts[i], dirs: [], files: [] }; node.dirs.push(child); }
      node = child;
    }
    node.files.push(f);
  }
  function sortNode(n: FileTreeDir) {
    n.dirs.sort((a, b) => a.name.localeCompare(b.name));
    n.files.sort((a, b) => a.name.localeCompare(b.name));
    n.dirs.forEach(sortNode);
  }
  sortNode(root);
  return root;
}

function collectDirFileNames(dir: FileTreeDir): string[] {
  return [...dir.files.map((f) => f.name), ...dir.dirs.flatMap((d) => collectDirFileNames(d))];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return "";
  return name.slice(i + 1).toLowerCase();
}

// ─── IndeterminateCheckbox ─────────────────────────────────────────────────

function IndeterminateCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 shrink-0 accent-mcm-blue" />
  );
}

// ─── File row ─────────────────────────────────────────────────────────────

interface FileRowItemProps {
  f: { name: string; size: number };
  displayName: string;
  depth: number;
  selected: Set<string>;
  manifestSet: Set<string>;
  modifiedNames: string[];
  onToggleFile: (name: string) => void;
}

function FileRowItem({ f, displayName, depth, selected, manifestSet, modifiedNames, onToggleFile }: FileRowItemProps) {
  const isSelected = selected.has(f.name);
  const inManifest = manifestSet.has(f.name);
  const isModified = modifiedNames.includes(f.name);
  let statusLabel = "";
  let statusClass = "bg-border-soft text-muted";
  if (isSelected && !inManifest) { statusLabel = "will add"; statusClass = "bg-success-bg text-success-fg"; }
  else if (!isSelected && inManifest) { statusLabel = "will remove"; statusClass = "bg-error-bg text-error-fg"; }
  else if (isSelected && isModified) { statusLabel = "modified"; statusClass = "bg-mcm-blue/15 text-mcm-blue"; }
  else if (isSelected) { statusLabel = "in bundle"; statusClass = "bg-success-bg/60 text-success-fg"; }
  else { statusLabel = "available"; statusClass = "bg-border-soft text-muted"; }
  const ext = fileExt(f.name);
  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 border-b border-border-soft py-2 pr-3 text-[12px] last:border-b-0 hover:bg-surface"
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      <input type="checkbox" checked={isSelected} onChange={() => onToggleFile(f.name)} className="h-3.5 w-3.5 shrink-0 accent-mcm-blue" />
      {ext && (
        <span className="shrink-0 rounded bg-border-soft px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted">{ext}</span>
      )}
      <span className="flex-1 truncate font-medium text-ink">{displayName}</span>
      <span className="shrink-0 tabular-nums text-[10.5px] text-muted">{formatBytes(f.size)}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}>{statusLabel}</span>
    </label>
  );
}

// ─── Directory node ────────────────────────────────────────────────────────

interface DirNodeProps {
  dir: FileTreeDir;
  depth: number;
  selected: Set<string>;
  manifestSet: Set<string>;
  modifiedNames: string[];
  onToggleFile: (name: string) => void;
  onToggleFiles: (names: string[], checked: boolean) => void;
}

function DirNode({ dir, depth, selected, manifestSet, modifiedNames, onToggleFile, onToggleFiles }: DirNodeProps) {
  const allNames = collectDirFileNames(dir);
  const selCount = allNames.filter((n) => selected.has(n)).length;
  const allSel = allNames.length > 0 && selCount === allNames.length;
  const someSel = selCount > 0 && !allSel;
  const inBundleCount = allNames.filter((n) => manifestSet.has(n)).length;

  let folderBadge = "";
  let folderBadgeClass = "bg-border-soft text-muted";
  if (allSel && selCount > inBundleCount) { folderBadge = "will add"; folderBadgeClass = "bg-success-bg text-success-fg"; }
  else if (selCount < inBundleCount) { folderBadge = "will remove"; folderBadgeClass = "bg-error-bg text-error-fg"; }
  else if (allSel && inBundleCount > 0) { folderBadge = "in bundle"; folderBadgeClass = "bg-success-bg/60 text-success-fg"; }

  const childProps = { selected, manifestSet, modifiedNames, onToggleFile, onToggleFiles };
  return (
    <details className="border-b border-border-soft last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 bg-surface py-2 pr-3 text-[12px] hover:bg-border-soft" style={{ paddingLeft: `${12 + depth * 16}px` }}>
        <IndeterminateCheckbox checked={allSel} indeterminate={someSel} onChange={() => onToggleFiles(allNames, !allSel)} />
        <IconFolder size={13} stroke={2} className="shrink-0 text-muted" />
        <span className="flex-1 truncate font-medium text-ink">{dir.name}</span>
        <span className="shrink-0 tabular-nums text-[10.5px] text-muted">{selCount}/{allNames.length}</span>
        {folderBadge && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${folderBadgeClass}`}>{folderBadge}</span>
        )}
      </summary>
      <div className="border-t border-border-soft">
        {dir.dirs.map((child) => <DirNode key={child.name} dir={child} depth={depth + 1} {...childProps} />)}
        {dir.files.map((f) => {
          const basename = f.name.split("/").pop() ?? f.name;
          return (
            <FileRowItem key={f.name} f={f} displayName={basename.replace(/\.[^.]+$/, "")} depth={depth + 1}
              selected={selected} manifestSet={manifestSet} modifiedNames={modifiedNames} onToggleFile={onToggleFile} />
          );
        })}
      </div>
    </details>
  );
}

// ─── Bundle file picker panel ──────────────────────────────────────────────

interface BundlePanelProps {
  bundle: Bundle;
  folderLabel: string;
  status: DiffStatus | null;
  entry: PublisherBundleState | null;
  selected: Set<string>;
  dirty: boolean;
  onToggleFile: (fileName: string) => void;
  onToggleFiles: (fileNames: string[], checked: boolean) => void;
  onUpdateSourcePath: (path: string) => void;
  onReveal: (path: string) => void;
}

function BundlePanel({ bundle, folderLabel, status, entry, selected, dirty, onToggleFile, onToggleFiles, onUpdateSourcePath, onReveal }: BundlePanelProps) {
  const sourcePath = entry?.sourcePath ?? "(scanning…)";
  const localFiles = status?.diff.currentFiles ?? [];
  const manifestSet = new Set(bundle.files);
  const modifiedNames = status?.diff.modified ?? [];
  const tree = buildFileTree(localFiles);
  const checkedCount = Array.from(selected).filter((n) => localFiles.some((f) => f.name === n)).length;
  const remoteOnly = bundle.files.filter((n) => !localFiles.some((f) => f.name === n)).length;

  const overrideKey = `${bundle.category}:${bundle.presetType}`;
  const pathOverrides = useAppStore((s) => s.persisted.pathOverrides);
  const setPathOverride = useAppStore((s) => s.setPathOverride);
  const resetPathOverride = useAppStore((s) => s.resetPathOverride);
  const currentOverride = pathOverrides[overrideKey];

  const [showTargetEdit, setShowTargetEdit] = useState(false);
  const [defaultPath, setDefaultPath] = useState<string>("");
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const isTauriEnv = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauriEnv) return;
    resolveTarget(bundle.category, bundle.presetType, folderLabel)
      .then((r) => setDefaultPath(r.path))
      .catch(() => setDefaultPath(""));
  }, [bundle.category, bundle.presetType, folderLabel]);

  const openTargetEdit = () => { setEditValue(currentOverride ?? defaultPath); setShowTargetEdit(true); };

  const saveTarget = async () => {
    const val = editValue.trim();
    if (val && val !== defaultPath) await setPathOverride(overrideKey, val);
    else if (!val || val === defaultPath) await resetPathOverride(overrideKey);
    setShowTargetEdit(false);
  };

  const resetTarget = async () => { await resetPathOverride(overrideKey); setShowTargetEdit(false); };

  const effectiveTarget = currentOverride ?? defaultPath;

  return (
    <div className={`px-5 py-4 ${dirty ? "bg-update-row-bg" : ""}`}>
      {/* Source folder row */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-body">
            {checkedCount} of {localFiles.length} local files selected
            {remoteOnly > 0 && <span className="ml-1.5 text-muted">· {remoteOnly} on another machine</span>}
          </div>
          {localFiles.length > 0 && (
            <div className="mt-0.5 flex gap-2 text-[11px]">
              <button type="button" onClick={() => onToggleFiles(localFiles.map((f) => f.name), true)} className="text-mcm-blue hover:underline disabled:opacity-40" disabled={checkedCount === localFiles.length}>
                Select all
              </button>
              <span className="text-muted">·</span>
              <button type="button" onClick={() => onToggleFiles(localFiles.map((f) => f.name), false)} className="text-muted hover:text-ink hover:underline disabled:opacity-40" disabled={checkedCount === 0}>
                Deselect all
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => onReveal(sourcePath)} className="flex shrink-0 items-center gap-1 rounded-md border border-border-strong bg-white px-2.5 py-1.5 text-[12px] text-body hover:bg-border-soft" title={sourcePath}>
          <IconFolderOpen size={13} stroke={2} />
          Open folder
        </button>
        <button type="button" onClick={openTargetEdit} className={`flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-border-soft ${currentOverride ? "border-mcm-blue/40 bg-mcm-blue-tint text-mcm-blue" : "border-border-strong bg-white text-body"}`} title={effectiveTarget || "Set install destination"}>
          <IconFolder size={13} stroke={2} />
          {currentOverride ? "Custom target" : "Target folder"}
        </button>
      </div>

      {/* Target folder editor */}
      {showTargetEdit && (
        <div className="mb-3 rounded-md border border-mcm-blue/30 bg-mcm-blue-tint px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-mcm-blue">Install destination on this machine</span>
            <button type="button" onClick={() => setShowTargetEdit(false)} className="rounded p-0.5 text-muted hover:text-ink">
              <IconX size={13} stroke={2} />
            </button>
          </div>
          <div className="flex gap-1.5">
            <input type="text" autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveTarget(); if (e.key === "Escape") setShowTargetEdit(false); }}
              placeholder={defaultPath || "Paste folder path…"}
              className="min-w-0 flex-1 rounded-md border border-border-strong bg-white px-2 py-1 font-mono text-[11px] text-ink focus:border-mcm-blue focus:outline-none"
            />
            <button type="button" onClick={() => void saveTarget()} className="shrink-0 rounded-md bg-mcm-blue px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90">
              Save
            </button>
          </div>
          {defaultPath && (
            <div className="mt-1.5 flex items-center justify-between">
              <span className="break-all font-mono text-[10px] text-muted">{effectiveTarget || defaultPath}</span>
              {currentOverride && (
                <button type="button" onClick={() => void resetTarget()} className="ml-2 shrink-0 text-[10px] text-muted hover:text-error-fg hover:underline">
                  Reset to default
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* File list */}
      {status?.diff && !status.diff.sourceExists ? (
        <div className="rounded-md border border-warning-border bg-warning-bg px-4 py-3 text-[12px] text-warning-text">
          <div className="mb-0.5 font-medium">Source folder doesn't exist yet</div>
          <div className="text-[11px]">Click <span className="font-medium">Open folder</span> above to create it, then save a preset in {bundle.category === "premiere" ? "Premiere" : "Resolve"}.</div>
        </div>
      ) : localFiles.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface px-4 py-4 text-center">
          <div className="text-[12px] text-body">No files yet</div>
          <div className="mt-0.5 text-[10.5px] text-muted">Save a preset in {bundle.category === "premiere" ? "Premiere" : "Resolve"} to the source folder, then click <span className="font-medium">Rescan</span>.</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-white">
          {tree.dirs.map((dir) => (
            <DirNode key={dir.name} dir={dir} depth={0} selected={selected} manifestSet={manifestSet} modifiedNames={modifiedNames} onToggleFile={onToggleFile} onToggleFiles={onToggleFiles} />
          ))}
          {tree.files.map((f) => (
            <FileRowItem key={f.name} f={f} displayName={(f.name.split("/").pop() ?? f.name).replace(/\.[^.]+$/, "")} depth={0}
              selected={selected} manifestSet={manifestSet} modifiedNames={modifiedNames} onToggleFile={onToggleFile} />
          ))}
        </div>
      )}

      {remoteOnly > 0 && (
        <div className="mt-2 text-[10.5px] text-muted">
          {remoteOnly} file{remoteOnly === 1 ? "" : "s"} published from another machine — not present locally and left untouched.
        </div>
      )}

      <details className="mt-3 group">
        <summary className="cursor-pointer select-none list-none text-[10.5px] text-muted hover:text-body">
          <span className="group-open:hidden">Show source path</span>
          <span className="hidden group-open:inline">Hide source path</span>
        </summary>
        <div className="mt-1.5">
          <input type="text" value={sourcePath} onChange={(e) => onUpdateSourcePath(e.target.value)}
            className="w-full rounded-md border border-border-strong bg-white px-2.5 py-1 font-mono text-[11px] text-body focus:border-mcm-blue focus:outline-none"
            placeholder="Source folder on this machine"
          />
        </div>
      </details>
    </div>
  );
}
