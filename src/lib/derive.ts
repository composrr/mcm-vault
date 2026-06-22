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
  const disabled = new Set(persisted.disabledBundles);
  // Group all Premiere bundles before Resolve. Stable inside each group so
  // manifest order is preserved within a category.
  const categoryRank = (c: string): number => (c === "premiere" ? 0 : 1);
  const sorted = [...manifest.bundles].sort(
    (a, b) => categoryRank(a.category) - categoryRank(b.category)
  );
  return sorted.map((bundle) => {
    const r = runtime[bundle.id];
    const { status, installedVersion, errorMessage } = statusFor(
      bundle,
      persisted,
      r
    );
    // Manual-import bundles: files on disk being current ("installed") doesn't
    // mean the user has imported them into the host app. Surface that.
    let importStatus: BundleRowData["importStatus"];
    if (bundle.installType === "manual" && status === "installed") {
      const imp = persisted.imported[bundle.id];
      importStatus =
        imp && imp.version === bundle.version ? "imported" : "needsimport";
    }
    return {
      bundle,
      status,
      installedVersion,
      errorMessage,
      disabled: disabled.has(bundle.id),
      importStatus,
    };
  });
}
