import { IconCheck, IconCircle } from "@tabler/icons-react";
import { BrandMark } from "./BrandMark";
import type { AppDetection } from "../lib/tauri";

export type FirstRunState = "welcome";

interface FirstRunWelcomeProps {
  detected: AppDetection[];
  onOpen: () => void;
}

/** Tinted tile in the StatusIcon idiom: green check = found, grey circle = not. */
function DetectTile({ found }: { found: boolean }) {
  return (
    <div
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md ${
        found
          ? "bg-success-bg text-success-fg"
          : "bg-not-installed-bg text-not-installed-fg"
      }`}
    >
      {found ? (
        <IconCheck size={13} stroke={3} />
      ) : (
        <IconCircle size={13} stroke={2.5} />
      )}
    </div>
  );
}

export function FirstRunWelcome({ detected, onOpen }: FirstRunWelcomeProps) {
  const installedApps = detected.filter((d) => d.installed);

  return (
    <div className="flex flex-1 flex-col items-center justify-start px-8 pb-8 pt-12 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-mcm-blue-tint">
        <BrandMark width={30} height={22} />
      </div>
      <h1 className="mb-2 text-[17px] font-semibold leading-snug text-ink">
        Welcome to MCM Vault
      </h1>
      <p className="mx-auto mb-7 max-w-[340px] text-[12.5px] leading-relaxed text-body">
        Your team's preset library, automatically synced and always up to date.
      </p>

      <div className="mb-6 w-full text-left">
        <div className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[.09em] text-muted">
          Detected on your computer
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {detected.length === 0 ? (
            <div className="px-3.5 py-3 text-[12.5px] leading-relaxed text-body">
              No supported apps detected. Install Premiere Pro or DaVinci Resolve
              to continue.
            </div>
          ) : (
            detected.map((app) => (
              <div
                key={app.app}
                className="flex items-center gap-2.5 border-b border-border-soft px-3.5 py-2.5 last:border-b-0"
              >
                <DetectTile found={app.installed} />
                <span className="min-w-0 flex-1 truncate text-[13px] leading-tight text-ink">
                  {app.app}
                  {app.installed && app.pickedVersion
                    ? ` ${app.pickedVersion.label}`
                    : ""}
                </span>
                {!app.installed && (
                  <span className="shrink-0 rounded bg-not-installed-bg px-1.5 py-px text-[9.5px] font-semibold tracking-[.02em] text-muted">
                    not found
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        {detected.length > 0 && installedApps.length === 0 && (
          <div className="mt-1.5 px-0.5 text-[11px] leading-relaxed text-body">
            Install Premiere Pro or DaVinci Resolve, then re-open MCM Vault.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-md bg-mcm-blue px-4 py-2.5 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
      >
        Open MCM Vault
      </button>
    </div>
  );
}
