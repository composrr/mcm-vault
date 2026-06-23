import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { CategoryStrip, type CategoryFilter } from "./components/CategoryStrip";
import { BundleList } from "./components/BundleList";
import { ActionBar } from "./components/ActionBar";
import { StatusBar } from "./components/StatusBar";
import { OfflineBanner } from "./components/OfflineBanner";
import { BundleDetailView } from "./components/BundleDetailView";
import { ManualImportModal } from "./components/ManualImportModal";
import {
  FirstRunWelcome,
  type FirstRunState,
} from "./components/FirstRunWelcome";
import { NoHostAppsState } from "./components/NoHostAppsState";
import { SettingsPanel } from "./components/SettingsPanel";
import { PublisherView } from "./components/PublisherView";
import { InstallProgressModal } from "./components/InstallProgressModal";
import { useAppStore } from "./store/useAppStore";
import { deriveRows } from "./lib/derive";
import {
  isTauri,
  openLogFolder,
  openVaultFolder,
  revealBundleFolder,
  revealPath,
} from "./lib/tauri";

type View = "main" | "detail" | "settings" | "publish";

function App() {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    if (!isTauri()) {
      setAppVersion("dev");
      return;
    }
    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setAppVersion(await getVersion());
      } catch (e) {
        console.warn("getVersion failed", e);
        setAppVersion("?");
      }
    })();
  }, []);
  const [view, setView] = useState<View>("main");
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [manualModalBundleId, setManualModalBundleId] = useState<string | null>(
    null
  );
  const [firstRunState, setFirstRunState] = useState<FirstRunState>("welcome");
  const [installSessionIds, setInstallSessionIds] = useState<string[]>([]);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const sessionActiveRef = useRef(false);

  const ready = useAppStore((s) => s.ready);
  const fetchStatus = useAppStore((s) => s.fetchStatus);
  const persisted = useAppStore((s) => s.persisted);
  const manifest = useAppStore((s) => s.manifest);
  const runtime = useAppStore((s) => s.runtime);
  const isFirstRun = useAppStore((s) => s.isFirstRun);
  const diagnostics = useAppStore((s) => s.diagnostics);

  const init = useAppStore((s) => s.init);
  const refresh = useAppStore((s) => s.refreshManifest);
  const installAll = useAppStore((s) => s.installAllUpdates);
  const installOne = useAppStore((s) => s.installOne);
  const cancelInstallSession = useAppStore((s) => s.cancelInstallSession);
  const removeBundle = useAppStore((s) => s.removeBundle);
  const restoreBundle = useAppStore((s) => s.restoreBundle);
  const markBundleImported = useAppStore((s) => s.markBundleImported);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const toggleBundleDisabled = useAppStore((s) => s.toggleBundleDisabled);
  const runDiagnostics = useAppStore((s) => s.runDiagnostics);
  const markFirstRunComplete = useAppStore((s) => s.markFirstRunComplete);

  useEffect(() => {
    void init();
  }, [init]);

  // Background-check for app updates on launch. If a newer build exists,
  // we silently download + install + restart. Auto-updater is signed by
  // our minisign key so this is safe to do without confirmation.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (cancelled || !update) return;
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch (e) {
        console.warn("App update check failed (ignored)", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // No auto-install. User clicks Update all (or per-bundle Reinstall) when they
  // want to actually pull the new files. The scheduled timer below only refreshes
  // the manifest so update statuses stay current.

  useEffect(() => {
    if (isFirstRun) return;
    const intervalMs: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "12h": 12 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
    };
    const ms = intervalMs[persisted.settings.checkInterval] ?? intervalMs["4h"];
    const id = setInterval(() => {
      // Scheduled re-fetch only; never auto-install. User triggers install manually.
      void refresh();
    }, ms);
    return () => clearInterval(id);
  }, [isFirstRun, persisted.settings.checkInterval, refresh]);

  useEffect(() => {
    const installingIds = Object.entries(runtime)
      .filter(([, r]) => r.installing)
      .map(([id]) => id);
    if (installingIds.length === 0) return;
    if (!sessionActiveRef.current) {
      sessionActiveRef.current = true;
      setProgressModalOpen(true);
      setInstallSessionIds(installingIds);
    } else {
      setInstallSessionIds((prev) => {
        const fresh = installingIds.filter((id) => !prev.includes(id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    }
  }, [runtime]);

  const handleDismissProgress = useCallback(() => {
    setProgressModalOpen(false);
    sessionActiveRef.current = false;
    setInstallSessionIds([]);
  }, []);

  const allRows = useMemo(
    () => deriveRows(manifest, persisted, runtime),
    [manifest, persisted, runtime]
  );

  const visibleRows = useMemo(() => {
    if (filter === "all") return allRows;
    return allRows.filter((row) => row.bundle.category === filter);
  }, [allRows, filter]);

  const updatesAvailable = useMemo(
    () =>
      visibleRows.filter(
        (row) =>
          !row.disabled &&
          (row.status === "update" || row.status === "notinstalled")
      ).length,
    [visibleRows]
  );

  const offline = fetchStatus === "offline";
  const anyInstalling = useMemo(
    () => Object.values(runtime).some((r) => r.installing),
    [runtime]
  );
  const installedCount = useMemo(
    () => Object.keys(persisted.installedBundles).length,
    [persisted.installedBundles]
  );
  const totalManifestBundles = manifest?.bundles.length ?? 0;
  const manualBundleCount = useMemo(
    () => manifest?.bundles.filter((b) => b.installType === "manual").length ?? 0,
    [manifest]
  );
  const currentBundleName = useMemo(() => {
    const inProgress = Object.entries(runtime).find(
      ([, r]) => r.installing && r.progress
    );
    if (!inProgress) return undefined;
    const [bundleId] = inProgress;
    return manifest?.bundles.find((b) => b.id === bundleId)?.name;
  }, [runtime, manifest]);

  const detected = diagnostics
    ? [diagnostics.premiere, diagnostics.audition, diagnostics.resolve]
    : [];
  const noHostAppsDetected =
    isFirstRun &&
    diagnostics != null &&
    !detected.some((d) => d.installed);

  const onRowClick = useCallback(
    (id: string) => {
      const bundle = manifest?.bundles.find((b) => b.id === id);
      if (!bundle) return;
      if (bundle.installType === "manual") {
        setManualModalBundleId(id);
      } else {
        setSelectedBundleId(id);
        setView("detail");
      }
    },
    [manifest]
  );

  const selectedBundle = useMemo(
    () => manifest?.bundles.find((b) => b.id === selectedBundleId) ?? null,
    [manifest, selectedBundleId]
  );

  const manualBundle = useMemo(
    () => manifest?.bundles.find((b) => b.id === manualModalBundleId) ?? null,
    [manifest, manualModalBundleId]
  );

  const handleFirstRunInstall = useCallback(async () => {
    setFirstRunState("installing");
    if (manifest) {
      for (const bundle of manifest.bundles) {
        await installOne(bundle);
      }
    }
    setFirstRunState("complete");
  }, [manifest, installOne]);

  const handleFirstRunOpen = useCallback(() => {
    markFirstRunComplete();
  }, [markFirstRunComplete]);

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white text-[12px] text-muted">
        Loading…
      </div>
    );
  }

  if (isFirstRun && noHostAppsDetected) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
        <AppHeader />
        <NoHostAppsState onScanAgain={() => void runDiagnostics()} />
      </div>
    );
  }

  if (isFirstRun) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
        <AppHeader />
        <FirstRunWelcome
          state={firstRunState}
          detected={detected}
          totalBundles={totalManifestBundles}
          installedCount={installedCount}
          currentBundleName={currentBundleName}
          hasManualBundles={manualBundleCount > 0}
          manualBundleCount={manualBundleCount}
          onInstall={() => void handleFirstRunInstall()}
          onOpen={handleFirstRunOpen}
        />
      </div>
    );
  }

  if (view === "settings") {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
        <AppHeader />
        <SettingsPanel
          settings={persisted.settings}
          appVersion={appVersion}
          onBack={() => setView("main")}
          onChange={(next) => void saveSettings(next)}
          onOpenLogFolder={async () => {
            try {
              await openLogFolder();
            } catch (e) {
              console.error("Open log folder failed", e);
            }
          }}
          onRunDiagnostics={runDiagnostics}
        />
      </div>
    );
  }

  const publisherMode = persisted.settings.publisherMode;

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-white">
      <AppHeader onOpenSettings={() => setView("settings")} />
      {publisherMode && view !== "detail" && (
        <div className="flex border-b border-border bg-surface px-5 py-1.5">
          <div className="flex gap-1 rounded-md border border-border-strong bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView("main")}
              className={`rounded px-3 py-0.5 text-[12px] transition-colors ${
                view !== "publish"
                  ? "bg-mcm-blue text-white"
                  : "text-body hover:text-ink"
              }`}
            >
              Receive
            </button>
            <button
              type="button"
              onClick={() => setView("publish")}
              className={`rounded px-3 py-0.5 text-[12px] transition-colors ${
                view === "publish"
                  ? "bg-mcm-blue text-white"
                  : "text-body hover:text-ink"
              }`}
            >
              Publish
            </button>
          </div>
        </div>
      )}
      {offline && view !== "publish" && (
        <OfflineBanner onRetry={() => void refresh()} />
      )}

      {view === "publish" ? (
        <PublisherView
          bundles={manifest?.bundles ?? []}
          folderLabel={persisted.settings.folderLabel || "MCM Vault"}
        />
      ) : view === "detail" && selectedBundle ? (
        <BundleDetailView
          bundle={selectedBundle}
          status={
            allRows.find((r) => r.bundle.id === selectedBundle.id)?.status ??
            "notinstalled"
          }
          installed={persisted.installedBundles[selectedBundle.id]}
          installing={runtime[selectedBundle.id]?.installing}
          errorMessage={runtime[selectedBundle.id]?.errorMessage}
          onBack={() => {
            setSelectedBundleId(null);
            setView("main");
          }}
          onReinstall={() => void installOne(selectedBundle)}
          onRemove={() => {
            const installed =
              persisted.installedBundles[selectedBundle.id];
            const fileCount = installed?.files.length ?? 0;
            const ok = window.confirm(
              `Remove "${selectedBundle.name}"?\n\n` +
                `This will delete ${fileCount} file${
                  fileCount === 1 ? "" : "s"
                } from disk.`
            );
            if (!ok) return;
            void removeBundle(selectedBundle.id);
            setSelectedBundleId(null);
            setView("main");
          }}
          onReveal={() => {
            // We want to open the install FOLDER, never a specific file (the
            // file may have been renamed or removed since we tracked it).
            // Derive the parent dir from the first tracked path and pass that
            // to reveal_path. Fall back to the canonical install dir if we
            // haven't installed anything yet.
            const installed = persisted.installedBundles[selectedBundle.id];
            const first = installed?.files[0];
            const dir = first?.replace(/[\\/][^\\/]+$/, "");
            if (dir) {
              void revealPath(dir);
            } else {
              void revealBundleFolder(
                selectedBundle.category,
                selectedBundle.presetType,
                persisted.settings.folderLabel || "MCM Vault"
              ).catch((e) => console.error("reveal_bundle_folder failed", e));
            }
          }}
          onRestore={() => {
            const installed = persisted.installedBundles[selectedBundle.id];
            const prev = installed?.previousInstall;
            if (!prev) return;
            const ok = window.confirm(
              `Restore "${selectedBundle.name}" to v${prev.version}?\n\n` +
                `This will overwrite the currently installed files with the ` +
                `${prev.snapshotPaths.length} archived file${
                  prev.snapshotPaths.length === 1 ? "" : "s"
                }.`
            );
            if (!ok) return;
            void restoreBundle(selectedBundle.id);
          }}
        />
      ) : (
        <>
          <CategoryStrip
            filter={filter}
            onFilterChange={setFilter}
            bundleCount={visibleRows.length}
          />
          {allRows.length === 0 && fetchStatus !== "loading" ? (
            <div className="flex flex-1 items-center justify-center text-[12px] text-muted">
              No bundles to show.
            </div>
          ) : (
            <BundleList
              rows={visibleRows}
              onRowClick={onRowClick}
              onToggleDisabled={(id) => void toggleBundleDisabled(id)}
            />
          )}
          <ActionBar
            updatesAvailable={updatesAvailable}
            onUpdateAll={() => void installAll()}
            onOpenFolder={() => {
              void openVaultFolder().catch((e) =>
                console.error("Open vault folder failed", e)
              );
            }}
            busy={fetchStatus === "loading" || anyInstalling}
          />
          <StatusBar
            lastChecked={persisted.lastChecked}
            onRefresh={() => void refresh()}
            refreshing={fetchStatus === "loading"}
            appVersion={appVersion}
          />
        </>
      )}

      {progressModalOpen && (
        <InstallProgressModal
          sessionIds={installSessionIds}
          runtime={runtime}
          manifest={manifest}
          onDismiss={handleDismissProgress}
          onCancel={() => void cancelInstallSession()}
        />
      )}

      {manualBundle && (
        <ManualImportModal
          bundle={manualBundle}
          imported={persisted.imported[manualBundle.id] ?? null}
          onMarkImported={() => void markBundleImported(manualBundle.id)}
          syncPath={
            persisted.installedBundles[manualBundle.id]?.files[0]?.replace(
              /[\\/][^\\/]+$/,
              ""
            ) ?? "~/Documents/MCM Vault Presets/Resolve/"
          }
          onClose={() => setManualModalBundleId(null)}
          onReveal={() => {
            const installed = persisted.installedBundles[manualBundle.id];
            const first = installed?.files[0];
            const dir = first?.replace(/[\\/][^\\/]+$/, "");
            if (dir) {
              void revealPath(dir);
            } else {
              void revealBundleFolder(
                manualBundle.category,
                manualBundle.presetType,
                persisted.settings.folderLabel || "MCM Vault"
              ).catch((e) => console.error("reveal_bundle_folder failed", e));
            }
            setManualModalBundleId(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
