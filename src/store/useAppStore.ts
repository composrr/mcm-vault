import { create } from "zustand";
import {
  fetchManifest,
  installBundle,
  isTauri,
  listenInstallProgress,
  notifyUser,
  readState,
  scanHostApps,
  uninstallBundle,
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
  Manifest,
} from "../types";

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
  },
  dismissedTips: [],
  lastKnownManifest: null,
  publisher: {},
  publisherRepoPath: null,
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
  removeBundle: (bundleId: string) => Promise<void>;
  saveSettings: (next: AppSettings) => Promise<void>;
  setPersisted: (patch: Partial<PersistedState>) => Promise<void>;
  runDiagnostics: () => Promise<DiagnosticReport>;
  markFirstRunComplete: () => void;
}

let progressUnlisten: (() => void) | null = null;

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
      const result = await installBundle(bundle);
      const installed: InstalledBundleState = {
        version: bundle.version,
        installedAt: new Date().toISOString(),
        files: result.installedFiles,
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

  async installAllUpdates() {
    const { manifest, persisted, installOne } = get();
    if (!manifest) return;
    const queue = manifest.bundles.filter((b) => {
      const inst = persisted.installedBundles[b.id];
      return !inst || inst.version !== b.version;
    });
    if (queue.length === 0) return;
    for (const bundle of queue) {
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

  async saveSettings(settingsNext: AppSettings) {
    const next = await persist(get, { settings: settingsNext });
    set({ persisted: next });
  },

  async setPersisted(patch: Partial<PersistedState>) {
    const next = await persist(get, patch);
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
