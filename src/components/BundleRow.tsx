import { StatusIcon } from "./StatusIcon";
import type { BundleRowData, PresetType } from "../types";

const PRESET_LABEL: Record<PresetType, string> = {
  export: "Export",
  effect: "Effect",
  lumetri: "Lumetri",
  lut: "LUT",
  audio: "Audio",
  sequence: "Sequence",
  mogrt: "MOGRT",
  fusion: "Fusion",
  fairlight: "Audio",
  powergrade: "PowerGrade",
  timeline: "Timeline",
  project: "Project",
  render: "Render",
};

function categoryLabel(category: "premiere" | "resolve") {
  return category === "premiere" ? "Premiere Pro" : "DaVinci Resolve";
}

function metaLine(row: BundleRowData): { text: string; tone: "muted" | "highlight" | "error" } {
  const { bundle, status, installedVersion, errorMessage } = row;

  if (status === "error") {
    return {
      text: errorMessage ? `Install failed · ${errorMessage}` : "Install failed",
      tone: "error",
    };
  }

  if (status === "update") {
    if (bundle.installType === "manual") {
      return { text: "Update available · Manual import", tone: "highlight" };
    }
    return {
      text: `Update available · v${installedVersion ?? "?"} → v${bundle.version}`,
      tone: "highlight",
    };
  }

  const fileCount = bundle.files.length;
  const presetLabel = PRESET_LABEL[bundle.presetType];
  const base = `${categoryLabel(bundle.category)} · ${presetLabel} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`;
  if (status === "notinstalled") {
    return { text: `${base} · Not installed`, tone: "muted" };
  }
  return { text: base, tone: "muted" };
}

interface BundleRowProps {
  row: BundleRowData;
  onClick?: () => void;
}

export function BundleRow({ row, onClick }: BundleRowProps) {
  const { bundle, status } = row;
  const meta = metaLine(row);

  let rowBg = "";
  if (status === "update") rowBg = "bg-update-row-bg";
  if (status === "error") rowBg = "bg-error-row-bg";

  let metaClass = "text-muted";
  if (meta.tone === "highlight") metaClass = "text-mcm-blue font-medium";
  if (meta.tone === "error") metaClass = "text-error-fg font-medium";

  let versionClass = "text-muted";
  if (status === "update") versionClass = "text-mcm-blue font-medium";

  const interactive = onClick
    ? "cursor-pointer transition-colors hover:bg-border-soft/60"
    : "";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`flex items-center gap-2.5 border-b border-border-soft px-5 py-1.5 last:border-b-0 ${rowBg} ${interactive}`}
    >
      <StatusIcon status={status} size={18} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink truncate leading-tight">{bundle.name}</div>
        <div className={`text-[10.5px] leading-tight ${metaClass}`}>{meta.text}</div>
      </div>
      {status !== "error" && (
        <div className={`text-[11px] tabular-nums ${versionClass}`}>v{bundle.version}</div>
      )}
    </div>
  );
}
