import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { AppState, Bundle, Manifest, PublisherFile } from "../types";

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

export async function installBundle(bundle: Bundle): Promise<InstallResult> {
  return invoke<InstallResult>("install_bundle", { bundle });
}

export async function uninstallBundle(files: string[]): Promise<number> {
  return invoke<number>("uninstall_bundle", { files });
}

export async function revealPath(path: string): Promise<void> {
  await invoke("reveal_path", { path });
}

export async function openVaultFolder(): Promise<string> {
  return invoke<string>("open_vault_folder");
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
}

export interface PublishedBundle {
  bundleId: string;
  newVersion: string;
  fileSignatures: Record<string, PublisherFile>;
  publishedAt: string;
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

export async function listenInstallProgress(
  handler: (p: InstallProgress) => void
): Promise<UnlistenFn> {
  return listen<InstallProgress>("install-progress", (e) => handler(e.payload));
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
