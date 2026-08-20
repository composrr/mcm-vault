import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type {
  AppState,
  Bundle,
  Manifest,
  PreviousInstall,
  PublisherFile,
} from "../types";

export interface AppBranding {
  appName: string;
  appTagline: string;
  teamName: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  manifestUrl: string;
}

export type ManifestErrorKind = "network" | "status" | "parse";

export interface ManifestErrorPayload {
  kind: ManifestErrorKind;
  message?: string;
  code?: number;
}

export type StateErrorKind = "io" | "parse" | "path";

export interface StateErrorPayload {
  kind: StateErrorKind;
  message: string;
}

export async function getBranding(): Promise<AppBranding> {
  return invoke<AppBranding>("app_branding");
}

export async function fetchManifest(): Promise<Manifest> {
  return invoke<Manifest>("fetch_manifest");
}

export async function readState(): Promise<AppState> {
  return invoke<AppState>("read_state");
}

export async function writeState(state: AppState): Promise<void> {
  await invoke("write_state", { state });
}

export async function openStateFolder(): Promise<string> {
  return invoke<string>("open_state_folder");
}

export async function exportMachineConfig(
  contents: string,
  folderLabel: string
): Promise<string> {
  return invoke<string>("export_machine_config", { contents, folderLabel });
}

export async function importMachineConfig(
  folderLabel: string
): Promise<string> {
  return invoke<string>("import_machine_config", { folderLabel });
}

export async function openLogFolder(): Promise<string> {
  return invoke<string>("open_log_folder");
}

export async function readRecentLog(lines: number): Promise<string[]> {
  return invoke<string[]>("read_recent_log", { lines });
}

export interface PathReport {
  label: string;
  path: string;
  exists: boolean;
  writable: boolean;
}

export interface DetectedVersion {
  label: string;
  root: string;
}

export interface AppDetection {
  app: string;
  installed: boolean;
  versions: DetectedVersion[];
  pickedVersion: DetectedVersion | null;
  paths: PathReport[];
}

export interface DiagnosticReport {
  os: string;
  user: string;
  premiere: AppDetection;
  audition: AppDetection;
  resolve: AppDetection;
}

export interface InstallResult {
  bundleId: string;
  installType: "auto" | "manual";
  installedFiles: string[];
  installDir: string;
  fileSizes: Record<string, number>;
  previousInstall?: PreviousInstall;
}

export interface InstallProgress {
  bundleId: string;
  currentFile: string;
  completed: number;
  total: number;
}

export async function scanHostApps(folderLabel: string): Promise<DiagnosticReport> {
  return invoke<DiagnosticReport>("scan_host_apps", { folderLabel });
}

export interface InstallTargetVersions {
  premierePro: DetectedVersion[];
  adobeMediaEncoder: DetectedVersion[];
  audition: DetectedVersion[];
}

export async function listInstallTargetVersions(): Promise<InstallTargetVersions> {
  return invoke<InstallTargetVersions>("list_install_target_versions");
}

export async function installBundle(
  bundle: Bundle,
  pathOverride?: string | null,
  priorFileSizes?: Record<string, number> | null
): Promise<InstallResult> {
  return invoke<InstallResult>("install_bundle", {
    bundle,
    pathOverride: pathOverride ?? null,
    priorFileSizes: priorFileSizes ?? null,
  });
}

export interface PreviewFile {
  name: string;
  /** "new" (not on disk), "update" (on disk, differs), "unchanged", or
   *  "remove" (dropped upstream — the install will delete it locally). */
  status: "new" | "update" | "unchanged" | "remove";
}

/** Ask the backend what install_bundle would actually change, file by file. */
export async function previewInstall(
  bundle: Bundle,
  pathOverride?: string | null,
  priorFileSizes?: Record<string, number> | null,
  installedFiles?: string[] | null
): Promise<PreviewFile[]> {
  return invoke<PreviewFile[]>("preview_install", {
    bundle,
    pathOverride: pathOverride ?? null,
    priorFileSizes: priorFileSizes ?? null,
    installedFiles: installedFiles ?? null,
  });
}

export interface ResolvedTarget {
  path: string;
  installType: "auto" | "manual";
}

export async function resolveTarget(
  category: string,
  presetType: string,
  folderLabel: string
): Promise<ResolvedTarget> {
  return invoke<ResolvedTarget>("resolve_target", { category, presetType, folderLabel });
}

export async function uninstallBundle(files: string[]): Promise<number> {
  return invoke<number>("uninstall_bundle", { files });
}

export async function restorePreviousInstall(
  previous: PreviousInstall
): Promise<number> {
  return invoke<number>("restore_previous_install", { previous });
}

/** Remove every installed file + app data on this machine. Returns the count
 *  of installed files deleted. */
export async function wipeThisMachine(): Promise<number> {
  return invoke<number>("wipe_this_machine");
}

export async function revealPath(path: string): Promise<void> {
  await invoke("reveal_path", { path });
}

export async function openVaultFolder(): Promise<string> {
  return invoke<string>("open_vault_folder");
}

export async function checkPathsExist(paths: string[]): Promise<boolean[]> {
  return invoke<boolean[]>("check_paths_exist", { paths });
}

export async function revealBundleFolder(
  category: string,
  presetType: string,
  folderLabel: string,
  anchor?: string,
  subpath?: string
): Promise<string> {
  return invoke<string>("reveal_bundle_folder", {
    category,
    presetType,
    folderLabel,
    anchor: anchor ?? null,
    subpath: subpath ?? null,
  });
}

export interface ScannedFile {
  name: string;
  size: number;
  mtimeMs: number;
}

export interface BundleDiff {
  bundleId: string;
  sourcePath: string;
  sourceExists: boolean;
  currentFiles: ScannedFile[];
  added: string[];
  modified: string[];
  removed: string[];
}

export interface ScanInput {
  bundleId: string;
  sourcePath: string;
  baseline: Record<string, PublisherFile>;
}

export async function scanPublishDiffs(
  inputs: ScanInput[]
): Promise<BundleDiff[]> {
  return invoke<BundleDiff[]>("scan_publish_diffs", { inputs });
}

export interface PublishPlan {
  bundleId: string;
  sourcePath: string;
  /** File names the user has checked. Must all be present in sourcePath. */
  includedFileNames: string[];
  /** Bundle's preset_type — backend uses it to apply repo-layout transforms
   *  (e.g. keyboard files get a `win/` or `mac/` prefix in the manifest). */
  presetType: string;
  explicitlyExcluded: string[];
  priorLocalNames: string[];
}

export interface PublishedBundle {
  bundleId: string;
  newVersion: string;
  fileSignatures: Record<string, PublisherFile>;
  publishedAt: string;
  files: string[];
  fileDates: Record<string, string>;
}

export interface PublishResult {
  published: PublishedBundle[];
  commitSha: string | null;
  manifestUrl: string;
}

export async function publishBundles(
  plans: PublishPlan[]
): Promise<PublishResult> {
  return invoke<PublishResult>("publish_bundles", { plans });
}

export async function publisherDefaultSource(
  bundle: Bundle,
  folderLabel: string
): Promise<string> {
  return invoke<string>("publisher_default_source", { bundle, folderLabel });
}

/** Absolute base path for each supported anchor token on this machine. */
export async function anchorPaths(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("anchor_paths");
}

/** Open a native folder picker. Returns the chosen absolute path, or null if
 *  the user cancelled. */
export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export interface CreateCustomBundleInput {
  name: string;
  sectionLabel: string;
  anchor: string;
  subpath: string;
}

/** Create a new custom bundle in the shared manifest. Returns the new bundle id. */
export async function createCustomBundle(
  input: CreateCustomBundleInput
): Promise<string> {
  return invoke<string>("create_custom_bundle", { input });
}

/** Revert a specific publish commit and push the revert. Returns the new
 *  revert commit SHA. Throws if the revert conflicts (files changed since). */
export async function revertLastPublish(sha: string): Promise<string> {
  return invoke<string>("revert_last_publish", { sha });
}

export async function pauseInstall(): Promise<void> {
  await invoke("pause_install");
}

export async function resumeInstall(): Promise<void> {
  await invoke("resume_install");
}

export async function cancelInstall(): Promise<void> {
  await invoke("cancel_install");
}

export async function listenInstallProgress(
  handler: (p: InstallProgress) => void
): Promise<UnlistenFn> {
  return listen<InstallProgress>("install-progress", (e) => handler(e.payload));
}

export interface PublishProgressEvent {
  bundleId: string | null;
  phase: string;
}

export async function listenPublishProgress(
  handler: (p: PublishProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<PublishProgressEvent>("publish-progress", (e) => handler(e.payload));
}

export async function notifyUser(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch (e) {
    console.warn("Notification failed", e);
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
