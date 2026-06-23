import { IconCheck } from "@tabler/icons-react";
import { BrandMark } from "./BrandMark";
import type { AppDetection } from "../lib/tauri";

export type FirstRunState = "welcome";

interface FirstRunWelcomeProps {
  detected: AppDetection[];
  onOpen: () => void;
}

export function FirstRunWelcome({ detected, onOpen }: FirstRunWelcomeProps) {
  const installedApps = detected.filter((d) => d.installed);

  return (
    <div className="flex flex-1 flex-col items-center justify-start px-10 pt-14 pb-10 text-center">
      <BrandMark width={64} height={48} className="mb-6" />
      <div className="mb-2 text-[22px] font-semibold text-ink">
        Welcome to MCM Vault
      </div>
      <div className="mx-auto mb-8 max-w-[380px] text-[14px] leading-relaxed text-body">
        Your team's preset library, automatically synced and always up to date.
      </div>

      <div className="mb-6 w-full rounded-lg border border-border bg-surface px-5 py-4 text-left">
        <div className="mb-2.5 text-[12px] tracking-wide text-muted">
          DETECTED ON YOUR COMPUTER
        </div>
        {installedApps.length === 0 ? (
          <div className="py-1.5 text-[13px] text-body">
            No supported apps detected. Install Premiere Pro or DaVinci Resolve to continue.
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
        onClick={onOpen}
        className="rounded-md bg-mcm-blue px-8 py-2.5 text-[14px] font-medium text-white hover:bg-mcm-blue-hover"
      >
        Open MCM Vault
      </button>
    </div>
  );
}
