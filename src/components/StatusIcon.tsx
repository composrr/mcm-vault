import {
  IconAlertTriangle,
  IconArrowUp,
  IconCheck,
  IconCircle,
  IconLoader2,
} from "@tabler/icons-react";
import type { BundleStatusKind } from "../types";

interface StatusIconProps {
  status: BundleStatusKind;
  size?: number;
}

export function StatusIcon({ status, size = 22 }: StatusIconProps) {
  const iconSize = Math.round(size * (14 / 22));

  const baseClass =
    "flex items-center justify-center rounded-full shrink-0";
  const dimensionStyle = { width: size, height: size };

  if (status === "installed") {
    return (
      <div
        className={`${baseClass} bg-success-bg text-success-fg`}
        style={dimensionStyle}
      >
        <IconCheck size={iconSize} stroke={2.25} />
      </div>
    );
  }

  if (status === "update") {
    return (
      <div
        className={`${baseClass} bg-mcm-blue text-white`}
        style={dimensionStyle}
      >
        <IconArrowUp size={iconSize} stroke={2.25} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className={`${baseClass} bg-error-bg text-error-fg`}
        style={dimensionStyle}
      >
        <IconAlertTriangle size={iconSize} stroke={2.25} />
      </div>
    );
  }

  if (status === "installing") {
    return (
      <div
        className={`${baseClass} bg-not-installed-bg text-mcm-blue`}
        style={dimensionStyle}
      >
        <IconLoader2 size={iconSize} stroke={2.25} className="animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={`${baseClass} bg-not-installed-bg text-not-installed-fg`}
      style={dimensionStyle}
    >
      <IconCircle size={iconSize} stroke={2.25} />
    </div>
  );
}
