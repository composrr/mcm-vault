import type { Bundle, InstalledBundleState } from "../types";

/**
 * The folder a bundle was installed into (its root) — even when the bundle's files live in
 * nested subfolders (e.g. LUT packs with `Gamut/606/Name.cube`). The previous logic showed
 * the parent of the first file, which drilled into a deep subfolder; this derives the true
 * root by stripping a manifest-relative file name off the end of an installed absolute path.
 * Works on both Windows (backslash paths) and macOS.
 */
export function installRoot(
  bundle: Bundle,
  installed: InstalledBundleState | undefined
): string | null {
  if (!installed) return null;

  for (const abs of installed.files) {
    const absNorm = abs.replace(/\\/g, "/");
    for (const rel of bundle.files) {
      const relNorm = rel.replace(/\\/g, "/");
      if (absNorm === relNorm) continue;
      if (absNorm.endsWith("/" + relNorm)) {
        // rel has the same length regardless of separator style, so slice by rel length.
        return abs.slice(0, abs.length - rel.length).replace(/[\\/]+$/, "");
      }
    }
  }

  // Fallback: parent folder of the first installed file.
  return installed.files[0]
    ? installed.files[0].replace(/[\\/][^\\/]+$/, "")
    : null;
}
