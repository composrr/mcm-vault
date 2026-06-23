import { create } from "zustand";
import {
  cancelInstall,
  exportMachineConfig,
  fetchManifest,
  importMachineConfig,
  installBundle,
  isTauri,
  listenInstallProgress,
  notifyUser,
  readState,
  restorePreviousInstall,
  scanHostApps,
  uninstallBundle,
  wipeThisMachine,
  writeState,
  type DiagnosticReport,
  type InstallProgress,
  type ManifestErrorPayload,
} from "../lib/tauri";
import type {
  AppSettings,
  AppState as PersistedState,
  Bundle,
  InstalledBundleState,
  MachineConfig,
  Manifest,
} from "../types";
import { buildMachineConfig, configFingerprint } from "../lib/machineConfig";

const DEFAULT_PERSISTED_STATE: PersistedState = {
  schemaVersion: 1,
  lastChecked: null,
  lastSuccessfulSync: null,
  installedBundles: {},
  settings: {
    autoUpdateOnLaunch: true,
    checkInterval: "4h",
    showNotifications: true,
    folderLabel: "MCM Vault",
    publisherMode: false,
    installTargets: {
      premierePro: [],
      adobeMediaEncoder: [],
      audition: [],
    },
  },
  dismissedTips: [],
  lastKnownManifest: null,
  publisher: {},
  publisherRepoPath: null,
  lastPublish: null,
  imported: {},
  configSyncedAt: null,
  configFingerprint: null,
  disabledBundles: [],
  pathOverrides: {},
};

export type FetchStatus = "idle" | "loading" | "success" | "offline" | "error";

export interface BundleRuntimeState {
  installing?: boolean;
  errorMessage?: string;
  progress?: InstallProgress;
}

export interface AppStore {
  ready: boolean;
  fetchStatus: FetchStatus;
  fetchError: ManifestErrorPayload | null;
  manifest: Manifest | null;
  persisted: PersistedState;
  runtime: Record<string, BundleRuntimeState>;
  diagnostics: DiagnosticReport | null;
  isFirstRun: boolean;
  init: () => Promise<void>;
  refreshManifest: () => Promise<void>;
  installOne: (bundle: Bundle) => Promise<void>;
  installAllUpdates: () => Promise<void>;
  cancelInstallSession: () => Promise<void>;
  removeBundle: (bundleId: string) => Promise<void>;
  restoreBundle: (bundleId: string) => Promise<void>;
  markBundleImported: (bundleId: string) => Promise<void>;
  wipeMachine: () => Promise<number>;
  saveSettings: (next: AppSettings) => Promise<void>;
  exportConfig: () => Promise<string>;
  importConfig: () => Promise<MachineConfig>;
  setPersisted: (patch: Partial<PersistedState>) => Promise<void>;
  toggleBundleDisabled: (bundleId: string) => Promise<void>;
  setPathOverride: (key: string, path: string) => Promise<void>;
  resetPathOverride: (key: string) => Promise<void>;
  runDiagnostics: () => Promise<DiagnosticReport>;
  markFirstRunComplete: () => void;
}

let progressUnlisten: (() => void) | null = null;
let batchAborted = false;

async function persist(get: () => AppStore, patch: Partial<PersistedState>) {
  const next: PersistedState = { ...get().persisted, ...patch };
  if (isTauri()) {
    await writeState(next).catch((e) =>
      console.error("Failed to persist state", e)
    );
  }
  return next;
}

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  fetchStatus: "idle",
  fetchError: null,
  manifest: null,
  persisted: DEFAULT_PERSISTED_STATE,
  runtime: {},
  diagnostics: null,
  isFirstRun: false,

  async init() {
    if (!isTauri()) {
      const { sampleManifest, samplePersisted } = await import(
        "../data/sampleBundles"
      );
      set({
        ready: true,
        fetchStatus: "success",
        manifest: sampleManifest,
        persisted: samplePersisted,
        isFirstRun: false,
      });
      return;
    }
    let persisted: PersistedState | null = null;
    try {
      persisted = await readState();
    } catch (e) {
      console.error("Failed to read app state", e);
    }
    const isFirstRun =
      !persisted ||
      (persisted.lastSuccessfulSync == null &&
        Object.keys(persisted.installedBundles).length === 0);
    set({
      persisted: persisted ?? DEFAULT_PERSISTED_STATE,
      manifest: persisted?.lastKnownManifest ?? null,
      ready: true,
      isFirstRun,
    });
    if (!progressUnlisten) {
      progressUnlisten = await listenInstallProgress((progress) => {
        set((s) => ({
          runtime: {
            ...s.runtime,
            [progress.bundleId]: {
              ...s.runtime[progress.bundleId],
              installing: progress.completed < progress.total,
              progress,
            },
          },
        }));
      });
    }
    if (isFirstRun) {
      try {
        const label = get().persisted.settings.folderLabel || "MCM Vault";
        const report = await scanHostApps(label);
        set({ diagnostics: report });
      } catch (e) {
        console.error("Diagnostics scan failed", e);
      }
    }
    await get().refreshManifest();
  },

  async refreshManifest() {
    if (!isTauri()) return;
    set({ fetchStatus: "loading", fetchError: null });
    const now = new Date().toISOString();
    try {
      const manifest = await fetchManifest();
      const next = await persist(get, {
        lastChecked: now,
        lastSuccessfulSync: now,
        lastKnownManifest: manifest,
      });
      set({
        manifest,
        persisted: next,
        fetchStatus: "success",
        fetchError: null,
      });
    } catch (raw) {
      const err = raw as ManifestErrorPayload;
      const next = await persist(get, { lastChecked: now });
      set({
        persisted: next,
        fetchStatus: err?.kind === "network" ? "offline" : "error",
        fetchError: err ?? { kind: "network", message: String(raw) },
      });
    }
  },

  async installOne(bundle: Bundle) {
    if (!isTauri()) return;
    const id = bundle.id;
    set((s) => ({
      runtime: {
        ...s.runtime,
        [id]: { installing: true, errorMessage: undefined },
      },
    }));
    try {
      // Never auto-delete files on update. Same-name files get overwritten by
      // installBundle below; files removed from the bundle stay on disk and
      // are simply untracked. Explicit Remove still deletes via removeBundle.
      const overrideKey = `${bundle.category}:${bundle.presetType}`;
      const pathOverride = get().persisted.pathOverrides[overrideKey] ?? null;
      const result = await installBundle(bundle, pathOverride);
      const prior = get().persisted.installedBundles[id];
      const installed: InstalledBundleState = {
        version: bundle.version,
        installedAt: new Date().toISOString(),
        files: result.installedFiles,
        previousInstall:
          result.previousInstall ?? prior?.previousInstall,
      };
      const installedBundles = {
        ...get().persisted.installedBundles,
        [id]: installed,
      };
      const next = await persist(get, { installedBundles });
      set((s) => ({
        persisted: next,
        runtime: {
          ...s.runtime,
          [id]: { installing: false },
        },
      }));
    } catch (raw) {
      const message =
        typeof raw === "object" && raw && "message" in raw
          ? String((raw as { message?: unknown }).message ?? raw)
          : String(raw);
      set((s) => ({
        runtime: {
          ...s.runtime,
          [id]: { installing: false, errorMessage: message },
        },
      }));
    }
  },

  async cancelInstallSession() {
    batchAborted = true;
    await cancelInstall().catch(() => {});
  },

  async installAllUpdates() {
    const { manifest, persisted, installOne } = get();
    if (!manifest) return;
    const disabled = new Set(persisted.disabledBundles);
    const queue = manifest.bundles.filter((b) => {
      if (disabled.has(b.id)) return false;
      const inst = persisted.installedBundles[b.id];
      return !inst || inst.version !== b.version;
    });
    if (queue.length === 0) return;
    batchAborted = false;
    for (const bundle of queue) {
      if (batchAborted) break;
      await installOne(bundle);
    }
    if (get().persisted.settings.showNotifications) {
      const successes = queue.filter(
        (b) => !get().runtime[b.id]?.errorMessage
      );
      if (successes.length > 0) {
        const noun = successes.length === 1 ? "bundle" : "bundles";
        await notifyUser(
          "MCM Vault",
          `${successes.length} preset ${noun} updated`
        );
      }
    }
  },

  async removeBundle(bundleId: string) {
    if (!isTauri()) return;
    const installed = get().persisted.installedBundles[bundleId];
    if (!installed) return;
    await uninstallBundle(installed.files).catch(() => 0);
    const installedBundles = { ...get().persisted.installedBundles };
    delete installedBundles[bundleId];
    const next = await persist(get, { installedBundles });
    set({ persisted: next });
  },

  async restoreBundle(bundleId: string) {
    if (!isTauri()) return;
    const installed = get().persisted.installedBundles[bundleId];
    const prev = installed?.previousInstall;
    if (!prev) return;
    try {
      await restorePreviousInstall(prev);
      const restored: InstalledBundleState = {
        version: prev.version,
        installedAt: new Date().toISOString(),
        files: prev.originalPaths,
        previousInstall: undefined,
      };
      const installedBundles = {
        ...get().persisted.installedBundles,
        [bundleId]: restored,
      };
      const next = await persist(get, { installedBundles });
      set({ persisted: next });
    } catch (raw) {
      const message =
        typeof raw === "object" && raw && "message" in raw
          ? String((raw as { message?: unknown }).message ?? raw)
          : String(raw);
      set((s) => ({
        runtime: {
          ...s.runtime,
          [bundleId]: {
            ...s.runtime[bundleId],
            errorMessage: message,
          },
        },
      }));
    }
  },

  async markBundleImported(bundleId: string) {
    const bundle = get().manifest?.bundles.find((b) => b.id === bundleId);
    if (!bundle) return;
    const imported = {
      ...get().persisted.imported,
      [bundleId]: {
        version: bundle.version,
        files: bundle.files,
        importedAt: new Date().toISOString(),
      },
    };
    const next = await persist(get, { imported });
    set({ persisted: next });
  },

  async wipeMachine() {
    if (!isTauri()) return 0;
    const count = await wipeThisMachine();
    // Reset in-memory state. The app data dir (incl. state.json) is gone, so we
    // drop back to a clean slate; the bundle list still renders (from the
    // in-memory manifest) but everything shows "not installed."
    set({
      persisted: { ...DEFAULT_PERSISTED_STATE },
      runtime: {},
      diagnostics: null,
    });
    return count;
  },

  async saveSettings(settingsNext: AppSettings) {
    const next = await persist(get, { settings: settingsNext });
    set({ persisted: next });
  },

  async exportConfig() {
    const cfg = buildMachineConfig(get().persisted);
    const label = get().persisted.settings.folderLabel || "MCM Vault";
    const path = await exportMachineConfig(JSON.stringify(cfg, null, 2), label);
    const next = await persist(get, {
      configSyncedAt: new Date().toISOString(),
      configFingerprint: configFingerprint(cfg),
    });
    set({ persisted: next });
    return path;
  },

  async importConfig() {
    const label = get().persisted.settings.folderLabel || "MCM Vault";
    const raw = await importMachineConfig(label);
    const cfg = JSON.parse(raw) as MachineConfig;
    const cur = get().persisted.settings;
    const nextSettings: AppSettings = {
      ...cur,
      folderLabel: cfg.folderLabel ?? cur.folderLabel,
      installTargets: cfg.installTargets ?? cur.installTargets,
      checkInterval: cfg.checkInterval ?? cur.checkInterval,
      showNotifications: cfg.showNotifications ?? cur.showNotifications,
      autoUpdateOnLaunch: cfg.autoUpdateOnLaunch ?? cur.autoUpdateOnLaunch,
    };
    const nextDisabled = cfg.disabledBundles ?? get().persisted.disabledBundles;
    const next = await persist(get, {
      settings: nextSettings,
      disabledBundles: nextDisabled,
      configSyncedAt: new Date().toISOString(),
      configFingerprint: configFingerprint(cfg),
    });
    set({ persisted: next });
    return cfg;
  },

  async setPersisted(patch: Partial<PersistedState>) {
    const next = await persist(get, patch);
    set({ persisted: next });
  },

  async toggleBundleDisabled(bundleId: string) {
    const cur = new Set(get().persisted.disabledBundles);
    if (cur.has(bundleId)) cur.delete(bundleId);
    else cur.add(bundleId);
    const next = await persist(get, {
      disabledBundles: Array.from(cur).sort(),
    });
    set({ persisted: next });
  },

  async setPathOverride(key: string, path: string) {
    const overrides = { ...get().persisted.pathOverrides, [key]: path };
    const next = await persist(get, { pathOverrides: overrides });
    set({ persisted: next });
  },

  async resetPathOverride(key: string) {
    const overrides = { ...get().persisted.pathOverrides };
    delete overrides[key];
    const next = await persist(get, { pathOverrides: overrides });
    set({ persisted: next });
  },

  async runDiagnostics() {
    if (!isTauri()) {
      const stub: DiagnosticReport = {
        os: "browser",
        user: "preview",
        premiere: {
          app: "Adobe Premiere Pro",
          installed: false,
          versions: [],
          pickedVersion: null,
          paths: [],
        },
        audition: {
          app: "Adobe Audition",
          installed: false,
          versions: [],
          pickedVersion: null,
          paths: [],
        },
        resolve: {
          app: "DaVinci Resolve",
          installed: false,
          versions: [],
          pickedVersion: null,
          paths: [],
        },
      };
      set({ diagnostics: stub });
      return stub;
    }
    const label = get().persisted.settings.folderLabel || "MCM Vault";
    const report = await scanHostApps(label);
    set({ diagnostics: report });
    return report;
  },

  markFirstRunComplete() {
    set({ isFirstRun: false });
  },
}));

