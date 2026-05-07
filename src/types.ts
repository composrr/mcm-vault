export type Category = "premiere" | "resolve";

export type InstallType = "auto" | "manual";

export type PresetType =
  | "export"
  | "effect"
  | "lumetri"
  | "lut"
  | "audio"
  | "sequence"
  | "mogrt"
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

export interface InstalledBundleState {
  version: string;
  installedAt: string;
  files: string[];
}

export interface AppSettings {
  autoUpdateOnLaunch: boolean;
  checkInterval: "1h" | "4h" | "12h" | "24h";
  showNotifications: boolean;
  folderLabel: string;
  publisherMode: boolean;
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
}

export interface BundleRowData {
  bundle: Bundle;
  status: BundleStatusKind;
  installedVersion?: string;
  errorMessage?: string;
}
