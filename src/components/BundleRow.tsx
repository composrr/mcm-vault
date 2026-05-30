import { StatusIcon } from "./StatusIcon";
import type { BundleRowData, PresetType } from "../types";

const PRESET_LABEL: Record<PresetType, string> = {
  export: "Export",
  effect: "Effect",
  lumetri: "Lumetri",
  lut: "LUT",
  audio: "Audio",
  sequence: "Sequence",
  caption: "Caption",
  mogrt: "MOGRT",
  workspace: "Workspace",
  keyboard: "Keyboard",
  "project-template": "Project Template",
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
  onToggleDisabled?: () => void;
}

export function BundleRow({ row, onClick, onToggleDisabled }: BundleRowProps) {
  const { bundle, status, disabled } = row;
  const meta = metaLine(row);

  let rowBg = "";
  if (!disabled && status === "update") rowBg = "bg-update-row-bg";
  if (!disabled && status === "error") rowBg = "bg-error-row-bg";

  let metaClass = "text-muted";
  if (meta.tone === "highlight") metaClass = "text-mcm-blue font-medium";
  if (meta.tone === "error") metaClass = "text-error-fg font-medium";

  let versionClass = "text-muted";
  if (!disabled && status === "update") versionClass = "text-mcm-blue font-medium";

  const interactive = onClick
    ? "cursor-pointer transition-colors hover:bg-border-soft/60"
    : "";
  const dimmedClass = disabled ? "opacity-40" : "";

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
      <div className={`flex items-center gap-2.5 flex-1 min-w-0 ${dimmedClass}`}>
        <StatusIcon status={status} size={18} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink truncate leading-tight">
            {bundle.name}
          </div>
          <div className={`text-[10.5px] leading-tight ${metaClass}`}>
            {disabled ? "Not syncing" : meta.text}
          </div>
        </div>
        {status !== "error" && (
          <div className={`text-[11px] tabular-nums ${versionClass}`}>
            v{bundle.version}
          </div>
        )}
      </div>
      {onToggleDisabled && (
        <button
          type="button"
          role="switch"
          aria-checked={!disabled}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDisabled();
          }}
          aria-label={disabled ? "Enable syncing this bundle" : "Disable syncing this bundle"}
          title={disabled ? "Sync off — click to start syncing" : "Sync on — click to stop syncing"}
          className={`shrink-0 relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${
            disabled ? "bg-border-strong" : "bg-mcm-blue"
          }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform ${
              disabled ? "translate-x-[3px]" : "translate-x-[15px]"
            }`}
          />
        </button>
      )}
    </div>
  );
}
