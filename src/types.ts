export type Category = "premiere" | "resolve";

export type InstallType = "auto" | "manual";

export type PresetType =
  | "export"
  | "effect"
  | "lumetri"
  | "lut"
  | "audio"
  | "sequence"
  | "caption"
  | "mogrt"
  | "workspace"
  | "keyboard"
  | "project-template"
  | "fusion"
  | "fairlight"
  | "powergrade"
  | "timeline"
  | "project"
  | "render";

export interface Bundle {
  id: string;
  name: string;
  description: string;
  version: string;
  category: Category;
  installType: InstallType;
  presetType: PresetType;
  path: string;
  files: string[];
  importInstructions?: string;
}

export interface Manifest {
  schemaVersion: number;
  updatedAt: string;
  bundles: Bundle[];
}

export type BundleStatusKind =
  | "installed"
  | "update"
  | "notinstalled"
  | "error"
  | "installing";

export interface PreviousInstall {
  version: string;
  originalPaths: string[];
  snapshotPaths: string[];
  archivedAt: string;
}

export interface InstalledBundleState {
  version: string;
  installedAt: string;
  files: string[];
  previousInstall?: PreviousInstall;
}

export interface InstallTargets {
  premierePro: string[];
  adobeMediaEncoder: string[];
  audition: string[];
}

export interface AppSettings {
  autoUpdateOnLaunch: boolean;
  checkInterval: "1h" | "4h" | "12h" | "24h";
  showNotifications: boolean;
  folderLabel: string;
  publisherMode: boolean;
  installTargets: InstallTargets;
}

export interface PublisherFile {
  size: number;
  mtimeMs: number;
}

export interface PublisherBundleState {
  sourcePath: string;
  lastPublishedFiles: Record<string, PublisherFile>;
  lastPublishedAt: string | null;
  lastPublishedVersion: string | null;
  includedFiles: string[];
}

export interface LastPublish {
  sha: string;
  summary: string;
  publishedAt: string;
}

export interface ImportedState {
  version: string;
  files: string[];
  importedAt: string;
}

export interface AppState {
  schemaVersion: number;
  lastChecked: string | null;
  lastSuccessfulSync: string | null;
  installedBundles: Record<string, InstalledBundleState>;
  settings: AppSettings;
  dismissedTips: string[];
  lastKnownManifest: Manifest | null;
  publisher: Record<string, PublisherBundleState>;
  publisherRepoPath: string | null;
  lastPublish: LastPublish | null;
  imported: Record<string, ImportedState>;
  configSyncedAt: string | null;
  configFingerprint: string | null;
  disabledBundles: string[];
  /** User-defined install path overrides, keyed by "category:presetType".
   *  When set, replaces the auto-resolved path for that preset type on this machine. */
  pathOverrides: Record<string, string>;
}

/** The subset of state shared between a user's machines via the config file. */
export interface MachineConfig {
  version: 1;
  folderLabel: string;
  installTargets: InstallTargets;
  disabledBundles: string[];
  checkInterval: AppSettings["checkInterval"];
  showNotifications: boolean;
  autoUpdateOnLaunch: boolean;
}

export interface BundleRowData {
  bundle: Bundle;
  status: BundleStatusKind;
  installedVersion?: string;
  errorMessage?: string;
  disabled?: boolean;
  /** Manual-import bundles only: whether the synced files have been imported
   *  into the host app at the current version. */
  importStatus?: "imported" | "needsimport";
}
