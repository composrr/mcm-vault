import { StatusIcon, type StatusIconKind } from "./StatusIcon";
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
  custom: "Folder",
};

type PillTone = "success" | "accent" | "warning" | "error" | "neutral";

const PILL_CLASS: Record<PillTone, string> = {
  success: "bg-success-bg text-success-fg",
  accent: "bg-mcm-blue/15 text-mcm-blue",
  warning: "bg-warning-bg text-warning-fg",
  error: "bg-error-bg text-error-fg",
  neutral: "bg-not-installed-bg text-muted",
};

/** The meta line: plain facts on the left, one status pill after them. The pill
 *  lives on this SECOND line rather than the right edge, so a long bundle name
 *  never collides with the sync toggle in a narrow window. */
function metaFor(row: BundleRowData): {
  facts: string;
  pill: string | null;
  tone: PillTone;
} {
  const { bundle, status, installedVersion, errorMessage } = row;
  const fileCount = bundle.files.length;
  const presetLabel = PRESET_LABEL[bundle.presetType] ?? bundle.presetType;
  const counted = `${presetLabel} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`;

  if (status === "error") {
    return {
      facts: errorMessage ? `${counted} · ${errorMessage}` : counted,
      pill: "failed",
      tone: "error",
    };
  }
  if (status === "installing") {
    return { facts: counted, pill: "installing", tone: "accent" };
  }
  if (status === "update") {
    const versions =
      bundle.installType === "manual"
        ? `${counted} · manual import`
        : `${counted} · v${installedVersion ?? "?"} → v${bundle.version}`;
    return { facts: versions, pill: "update", tone: "accent" };
  }
  if (status === "notinstalled") {
    return { facts: counted, pill: "not installed", tone: "neutral" };
  }
  if (row.importStatus === "needsimport") {
    return {
      facts: `${counted} · v${bundle.version}`,
      pill: "needs import",
      tone: "warning",
    };
  }
  return {
    facts: `${counted} · v${bundle.version}`,
    pill: "up to date",
    tone: "success",
  };
}

function iconKindFor(row: BundleRowData): StatusIconKind {
  if (row.status === "installed" && row.importStatus === "needsimport") {
    return "needsimport";
  }
  return row.status;
}

interface BundleRowProps {
  row: BundleRowData;
  onClick?: () => void;
  onToggleDisabled?: () => void;
}

export function BundleRow({ row, onClick, onToggleDisabled }: BundleRowProps) {
  const { bundle, status, disabled } = row;
  const meta = metaFor(row);

  const rowBg =
    !disabled && status === "update"
      ? "bg-update-row-bg"
      : !disabled && status === "error"
        ? "bg-error-row-bg"
        : "";

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
      className={`flex items-start gap-2.5 border-b border-border-soft px-5 py-2.5 last:border-b-0 ${rowBg} ${interactive}`}
    >
      <div className={`flex flex-1 items-start gap-2.5 min-w-0 ${disabled ? "opacity-40" : ""}`}>
        <div className="mt-px">
          <StatusIcon status={iconKindFor(row)} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight text-ink">
            {bundle.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="truncate text-[11px] leading-tight text-muted">
              {disabled ? "Not syncing" : meta.facts}
            </span>
            {!disabled && meta.pill && (
              <span
                className={`shrink-0 rounded px-1.5 py-px text-[9.5px] font-semibold tracking-[.02em] ${PILL_CLASS[meta.tone]}`}
              >
                {meta.pill}
              </span>
            )}
          </div>
        </div>
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
          aria-label={
            disabled ? "Enable syncing this bundle" : "Disable syncing this bundle"
          }
          title={
            disabled
              ? "Sync off — click to start syncing"
              : "Sync on — click to stop syncing"
          }
          className={`mt-1 shrink-0 relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${
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
