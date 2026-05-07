import { IconCheck, IconInfoCircle } from "@tabler/icons-react";
import { BrandMark } from "./BrandMark";
import type { AppDetection } from "../lib/tauri";

export type FirstRunState = "welcome" | "installing" | "complete";

interface FirstRunWelcomeProps {
  state: FirstRunState;
  detected: AppDetection[];
  totalBundles: number;
  installedCount?: number;
  currentBundleName?: string;
  hasManualBundles?: boolean;
  manualBundleCount?: number;
  onInstall: () => void;
  onOpen: () => void;
}

function progressPercent(current: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

export function FirstRunWelcome({
  state,
  detected,
  totalBundles,
  installedCount = 0,
  currentBundleName,
  hasManualBundles = false,
  manualBundleCount = 0,
  onInstall,
  onOpen,
}: FirstRunWelcomeProps) {
  const installedApps = detected.filter((d) => d.installed);

  if (state === "welcome") {
    return (
      <div className="flex flex-1 flex-col items-center justify-start px-10 pt-14 pb-10 text-center">
        <BrandMark width={64} height={48} className="mb-6" />
        <div className="mb-2 text-[22px] font-semibold text-ink">
          Welcome to MCM Vault
        </div>
        <div className="mx-auto mb-8 max-w-[380px] text-[14px] leading-relaxed text-body">
          Your team's preset library, automatically synced and always up to
          date.
        </div>

        <div className="mb-6 w-full rounded-lg border border-border bg-surface px-5 py-4 text-left">
          <div className="mb-2.5 text-[12px] tracking-wide text-muted">
            DETECTED ON YOUR COMPUTER
          </div>
          {installedApps.length === 0 ? (
            <div className="py-1.5 text-[13px] text-body">
              No supported apps detected. Install Premiere Pro or DaVinci
              Resolve to continue.
            </div>
          ) : (
            installedApps.map((app) => (
              <div key={app.app} className="flex items-center gap-2.5 py-1.5">
                <IconCheck size={18} stroke={2.25} className="text-success-fg" />
                <span className="text-[13px] text-ink">
                  {app.app}
                  {app.pickedVersion ? ` ${app.pickedVersion.label}` : ""}
                </span>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          disabled={installedApps.length === 0}
          onClick={onInstall}
          className="rounded-md bg-mcm-blue px-8 py-2.5 text-[14px] font-medium text-white hover:bg-mcm-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Install presets
        </button>
      </div>
    );
  }

  if (state === "installing") {
    const pct = progressPercent(installedCount, totalBundles);
    return (
      <div className="flex flex-1 flex-col items-center justify-start px-10 pt-14 pb-10 text-center">
        <BrandMark width={64} height={48} className="mb-6" />
        <div className="mb-2 text-[22px] font-semibold text-ink">
          Setting up your library
        </div>
        <div className="mx-auto mb-8 max-w-[380px] text-[14px] leading-relaxed text-body">
          Installing {totalBundles} preset bundles. This usually takes about 30
          seconds.
        </div>

        <div className="w-full rounded-lg border border-border bg-surface px-5 py-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink">
              {currentBundleName ? `Installing ${currentBundleName}` : "Preparing…"}
            </span>
            <span className="text-[12px] tabular-nums text-muted">
              {installedCount} of {totalBundles}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-mcm-blue transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-start px-10 pt-14 pb-10 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success-bg">
        <IconCheck size={32} stroke={2.25} className="text-success-fg" />
      </div>
      <div className="mb-2 text-[22px] font-semibold text-ink">
        You're all set
      </div>
      <div className="mx-auto mb-6 max-w-[380px] text-[14px] leading-relaxed text-body">
        {totalBundles} preset bundles installed. Open Premiere or Resolve to
        start using them — restart the app if it's already open.
      </div>

      {hasManualBundles && (
        <div className="mb-6 flex w-full items-start gap-2.5 rounded-lg border border-mcm-blue/30 bg-mcm-blue-tint px-3.5 py-3 text-left">
          <IconInfoCircle
            size={18}
            stroke={2}
            className="mt-0.5 shrink-0 text-mcm-blue"
          />
          <div>
            <div className="text-[13px] font-medium text-ink">
              {manualBundleCount} Resolve preset
              {manualBundleCount === 1 ? "" : "s"} need manual import
            </div>
            <div className="mt-0.5 text-[12px] leading-relaxed text-body">
              Click them in the main view to see import steps.
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="rounded-md bg-mcm-blue px-8 py-2.5 text-[14px] font-medium text-white hover:bg-mcm-blue-hover"
      >
        Open MCM Vault
      </button>
    </div>
  );
}
