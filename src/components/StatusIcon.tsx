import {
  IconAlertTriangle,
  IconArrowUp,
  IconCheck,
  IconCircle,
  IconExclamationCircle,
  IconLoader2,
} from "@tabler/icons-react";
import type { BundleStatusKind } from "../types";

/** "needsimport" isn't an install state — files are on disk but the host app
 *  hasn't ingested them yet — so it gets its own tile rather than reusing one. */
export type StatusIconKind = BundleStatusKind | "needsimport";

interface StatusIconProps {
  status: StatusIconKind;
  size?: number;
}

/** Rounded tinted tile. Each state carries a DIFFERENT GLYPH as well as a
 *  different tint, so the row still reads correctly in greyscale. */
export function StatusIcon({ status, size = 22 }: StatusIconProps) {
  const iconSize = Math.round(size * (13 / 22));
  const base = "flex items-center justify-center rounded-md shrink-0";
  const dim = { width: size, height: size };

  switch (status) {
    case "installed":
      return (
        <div className={`${base} bg-success-bg text-success-fg`} style={dim}>
          <IconCheck size={iconSize} stroke={3} />
        </div>
      );
    case "update":
      return (
        <div className={`${base} bg-mcm-blue text-white`} style={dim}>
          <IconArrowUp size={iconSize} stroke={3} />
        </div>
      );
    case "needsimport":
      return (
        <div className={`${base} bg-warning-bg text-warning-fg`} style={dim}>
          <IconExclamationCircle size={iconSize} stroke={2.5} />
        </div>
      );
    case "error":
      return (
        <div className={`${base} bg-error-bg text-error-fg`} style={dim}>
          <IconAlertTriangle size={iconSize} stroke={2.5} />
        </div>
      );
    case "installing":
      return (
        <div className={`${base} bg-mcm-blue-tint text-mcm-blue`} style={dim}>
          <IconLoader2 size={iconSize} stroke={2.5} className="animate-spin" />
        </div>
      );
    default:
      return (
        <div
          className={`${base} bg-not-installed-bg text-not-installed-fg`}
          style={dim}
        >
          <IconCircle size={iconSize} stroke={2.5} />
        </div>
      );
  }
}
