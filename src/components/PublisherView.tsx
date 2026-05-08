import { useEffect, useMemo, useState } from "react";
import {
  IconChevronDown,
  IconCloudUpload,
  IconExternalLink,
  IconFolderOpen,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";
import type { Bundle } from "../types";
import {
  publishBundles,
  publisherDefaultSource,
  revealPath,
  scanPublishDiffs,
  type BundleDiff,
  type PublishPlan,
} from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";

interface PublisherViewProps {
  bundles: Bundle[];
  folderLabel: string;
}

interface DiffStatus {
  diff: BundleDiff;
  publishedVersion: string | null;
  publishedAt: string | null;
}

const ALL = "__all__";

export function PublisherView({ bundles, folderLabel }: PublisherViewProps) {
  const persisted = useAppStore((s) => s.persisted);
  const setPersisted = useAppStore((s) => s.setPersisted);

  const [diffs, setDiffs] = useState<Record<string, DiffStatus>>({});
  const [scanning, setScanning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [activeBundleId, setActiveBundleId] = useState<string>(ALL);

  const publisherEntries = persisted.publisher;

  // Read selection from persisted state.publisher[id].includedFiles.
  const selectedFor = (bundleId: string): Set<string> => {
    const entry = publisherEntries[bundleId];
    return new Set(entry?.includedFiles ?? []);
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
      // Read fresh state, not the closure — publish() calls scan() right after
      // setPersisted, and the closure's `persisted` is still pre-publish.
      const freshPublisher = useAppStore.getState().persisted.publisher;
      const nextPublisher = { ...freshPublisher };
      const inputs = await Promise.all(
        bundles.map(async (b) => {
          const sourcePath = await publisherDefaultSource(b, folderLabel);
          const existing = freshPublisher[b.id];
          // First-time init: seed includedFiles after scan results arrive
          // (we need to know what's locally present to intersect with manifest).
          // Default to empty here; the seed pass below populates new bundles.
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

      // Seed includedFiles for any bundle that didn't have one yet.
      for (const diff of results) {
        const existing = freshPublisher[diff.bundleId];
        if (existing?.includedFiles && existing.includedFiles.length > 0) continue;
        const bundle = bundlesById[diff.bundleId];
        if (!bundle) continue;
        const localNames = new Set(diff.currentFiles.map((f) => f.name));
        const seeded = bundle.files.filter((n) => localNames.has(n));
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
      console.error("Scan failed", e);
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
    const nextEntry = {
      ...(existing ?? {
        sourcePath: "",
        lastPublishedFiles: {},
        lastPublishedAt: null,
        lastPublishedVersion: null,
        includedFiles: [],
      }),
      includedFiles: Array.from(cur).sort(),
    };
    setPersisted({
      publisher: { ...persisted.publisher, [bundleId]: nextEntry },
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
      const inManifest = manifestSet.has(name);
      const isSelected = sel.has(name);
      if (inManifest !== isSelected) return true;
    }
    if (status.diff.modified.some((name) => sel.has(name))) return true;
    return false;
  };

  const totalChangedBundles = useMemo(
    () => bundles.filter((b) => bundleHasChanges(b.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundles, persisted.publisher, diffs]
  );

  const updateSourcePath = (bundleId: string, path: string) => {
    const next = {
      ...persisted.publisher,
      [bundleId]: {
        ...(persisted.publisher[bundleId] ?? {
          sourcePath: "",
          lastPublishedFiles: {},
          lastPublishedAt: null,
          lastPublishedVersion: null,
        }),
        sourcePath: path,
      },
    };
    setPersisted({ publisher: next });
  };

  const publish = async () => {
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
          };
        });
      if (plans.length === 0) {
        setPublishMessage("Nothing to publish.");
        return;
      }
      const result = await publishBundles(plans);
      const nowIso = new Date().toISOString();
      const updated = { ...persisted.publisher };
      for (const p of result.published) {
        updated[p.bundleId] = {
          ...(updated[p.bundleId] ?? {
            sourcePath: "",
            lastPublishedFiles: {},
            lastPublishedAt: null,
            lastPublishedVersion: null,
          }),
          lastPublishedFiles: p.fileSignatures,
          lastPublishedAt: p.publishedAt ?? nowIso,
          lastPublishedVersion: p.newVersion,
        };
      }
      await setPersisted({ publisher: updated });
      setPublishMessage(
        `Published ${result.published.length} ${
          result.published.length === 1 ? "bundle" : "bundles"
        }.${result.commitSha ? ` Commit ${result.commitSha.slice(0, 7)}.` : ""}`
      );
      // Refresh manifest cache so the UI reflects the new bundle versions/files
      // we just pushed (otherwise lastKnownManifest stays stale until next launch).
      try {
        await useAppStore.getState().refreshManifest();
      } catch (e) {
        console.warn("manifest refresh after publish failed", e);
      }
      await scan();
    } catch (e) {
      console.error("Publish failed", e);
      setPublishError(formatError(e));
    } finally {
      setPublishing(false);
    }
  };

  const visibleBundles =
    activeBundleId === ALL
      ? bundles
      : bundles.filter((b) => b.id === activeBundleId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-mcm-blue-tint px-5 py-2.5">
        <IconCloudUpload size={16} stroke={2} className="text-mcm-blue" />
        <span className="text-[12px] text-mcm-blue">
          Pick the files in each bundle, then Publish.
        </span>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning}
          className="ml-auto flex items-center gap-1 rounded-md p-1 text-[12px] text-mcm-blue hover:bg-white disabled:opacity-50"
        >
          <IconRefresh
            size={14}
            stroke={2}
            className={scanning ? "animate-spin" : ""}
          />
          Rescan
        </button>
      </div>

      <div className="flex items-center gap-2.5 border-b border-border bg-surface px-5 py-3">
        <span className="text-[12px] text-body">Bundle</span>
        <div className="relative flex-1">
          <select
            value={activeBundleId}
            onChange={(e) => setActiveBundleId(e.target.value)}
            className="w-full appearance-none rounded-md border border-border-strong bg-white px-3 py-1.5 pr-8 text-[13px] text-ink focus:border-mcm-blue focus:outline-none"
            aria-label="Select bundle"
          >
            <option value={ALL}>All preset bundles</option>
            {bundles.map((b) => {
              const dirty = bundleHasChanges(b.id);
              return (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {dirty ? " ●" : ""}
                </option>
              );
            })}
          </select>
          <IconChevronDown
            size={16}
            stroke={2}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
        {totalChangedBundles > 0 && (
          <span className="whitespace-nowrap text-[11px] tabular-nums text-mcm-blue font-medium">
            {totalChangedBundles}{" "}
            {totalChangedBundles === 1 ? "bundle" : "bundles"} changed
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {visibleBundles.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted">
            No bundles available.
          </div>
        ) : (
          visibleBundles.map((bundle) => (
            <BundlePanel
              key={bundle.id}
              bundle={bundle}
              status={diffs[bundle.id] ?? null}
              entry={publisherEntries[bundle.id] ?? null}
              selected={selectedFor(bundle.id)}
              dirty={bundleHasChanges(bundle.id)}
              onToggleFile={(name) => toggleFile(bundle.id, name)}
              onUpdateSourcePath={(path) => updateSourcePath(bundle.id, path)}
              onReveal={(path) => void revealPath(path).catch(() => {})}
            />
          ))
        )}
      </div>

      <div className="border-t border-border bg-surface px-5 py-3">
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
          onClick={() => void publish()}
          disabled={publishing || totalChangedBundles === 0}
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
              : `Publish ${totalChangedBundles} ${totalChangedBundles === 1 ? "bundle" : "bundles"}`}
        </button>
      </div>
    </div>
  );
}

interface BundlePanelProps {
  bundle: Bundle;
  status: DiffStatus | null;
  entry: import("../types").PublisherBundleState | null;
  selected: Set<string>;
  dirty: boolean;
  onToggleFile: (fileName: string) => void;
  onUpdateSourcePath: (path: string) => void;
  onReveal: (path: string) => void;
}

function BundlePanel({
  bundle,
  status,
  entry,
  selected,
  dirty,
  onToggleFile,
  onUpdateSourcePath,
  onReveal,
}: BundlePanelProps) {
  const sourcePath = entry?.sourcePath ?? "(scanning to suggest a path…)";
  const localFiles = status?.diff.currentFiles ?? [];
  const manifestSet = new Set(bundle.files);
  const checkedCount = Array.from(selected).filter((n) =>
    localFiles.some((f) => f.name === n)
  ).length;
  const remoteOnly = bundle.files.filter(
    (n) => !localFiles.some((f) => f.name === n)
  ).length;

  return (
    <div
      className={`border-b border-border-soft px-5 py-3 ${
        dirty ? "bg-update-row-bg" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-ink">{bundle.name}</div>
          <div className="mt-0.5 text-[11px] text-muted">
            {bundle.category === "premiere" ? "Premiere Pro" : "DaVinci Resolve"}{" "}
            · {bundle.presetType} · v{bundle.version}
            {entry?.lastPublishedVersion
              ? ` · last published ${entry.lastPublishedVersion}`
              : ""}
          </div>
        </div>
        <div className="text-right text-[11px] tabular-nums text-muted">
          {checkedCount} in bundle
          {remoteOnly > 0 ? ` · ${remoteOnly} on other machine` : ""}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={sourcePath}
          onChange={(e) => onUpdateSourcePath(e.target.value)}
          className="flex-1 rounded-md border border-border-strong bg-white px-2.5 py-1 font-mono text-[11px] text-body focus:border-mcm-blue focus:outline-none"
          placeholder="Source folder on this machine"
        />
        <button
          type="button"
          onClick={() => onReveal(sourcePath)}
          className="shrink-0 rounded-md p-1 text-muted hover:bg-border-soft"
          aria-label="Open source folder"
          title="Open source folder"
        >
          <IconFolderOpen size={16} stroke={2} />
        </button>
      </div>

      {status?.diff && !status.diff.sourceExists ? (
        <div className="mt-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-[12px] text-warning-text">
          Source folder doesn't exist yet. Click the folder icon to create it,
          or save a preset there from{" "}
          {bundle.category === "premiere" ? "Premiere" : "Resolve"}.
        </div>
      ) : localFiles.length === 0 ? (
        <div className="mt-2 text-[11px] text-muted">
          No files in this folder yet.
        </div>
      ) : (
        <div className="mt-2 overflow-hidden rounded-md border border-border bg-white">
          {localFiles.map((f) => {
            const isSelected = selected.has(f.name);
            const inManifest = manifestSet.has(f.name);
            const isModified = status?.diff.modified.includes(f.name) ?? false;
            let statusLabel = "";
            let statusClass = "text-muted";
            if (isSelected && !inManifest) {
              statusLabel = "will add";
              statusClass = "text-success-fg font-medium";
            } else if (!isSelected && inManifest) {
              statusLabel = "will remove";
              statusClass = "text-error-fg font-medium";
            } else if (isSelected && isModified) {
              statusLabel = "modified";
              statusClass = "text-mcm-blue font-medium";
            } else if (isSelected) {
              statusLabel = "in bundle";
              statusClass = "text-muted";
            }
            return (
              <label
                key={f.name}
                className="flex cursor-pointer items-center gap-2.5 border-b border-border-soft px-3 py-2 text-[12px] last:border-b-0 hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleFile(f.name)}
                  className="h-3.5 w-3.5 shrink-0 accent-mcm-blue"
                />
                <span className="flex-1 font-mono text-ink">{f.name}</span>
                <span className={`text-[11px] ${statusClass}`}>
                  {statusLabel}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {remoteOnly > 0 && (
        <div className="mt-2 text-[11px] text-muted">
          {remoteOnly} file{remoteOnly === 1 ? "" : "s"} in this bundle aren't
          on this machine — preserved on publish.
        </div>
      )}
    </div>
  );
}

function formatError(e: unknown): string {
  if (typeof e === "object" && e && "message" in e) {
    return String((e as { message?: unknown }).message ?? e);
  }
  if (typeof e === "string") return e;
  return JSON.stringify(e);
}
