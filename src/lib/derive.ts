import type {
  AppState as PersistedState,
  Bundle,
  BundleRowData,
  BundleStatusKind,
  Manifest,
} from "../types";
import type { BundleRuntimeState } from "../store/useAppStore";

function statusFor(
  bundle: Bundle,
  persisted: PersistedState,
  runtime: BundleRuntimeState | undefined
): { status: BundleStatusKind; installedVersion?: string; errorMessage?: string } {
  if (runtime?.installing) {
    return { status: "installing" };
  }
  if (runtime?.errorMessage) {
    return {
      status: "error",
      errorMessage: runtime.errorMessage,
    };
  }
  const installed = persisted.installedBundles[bundle.id];
  if (!installed) return { status: "notinstalled" };
  if (installed.version === bundle.version) {
    return { status: "installed", installedVersion: installed.version };
  }
  return { status: "update", installedVersion: installed.version };
}

export function deriveRows(
  manifest: Manifest | null,
  persisted: PersistedState,
  runtime: Record<string, BundleRuntimeState> = {}
): BundleRowData[] {
  if (!manifest) return [];
  return manifest.bundles.map((bundle) => {
    const r = runtime[bundle.id];
    const { status, installedVersion, errorMessage } = statusFor(
      bundle,
      persisted,
      r
    );
    return { bundle, status, installedVersion, errorMessage };
  });
}
