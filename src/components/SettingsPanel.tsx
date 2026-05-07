import { useState } from "react";
import { IconArrowLeft, IconRefresh, IconExternalLink } from "@tabler/icons-react";
import type { AppSettings } from "../types";
import type { DiagnosticReport } from "../lib/tauri";

interface SettingsPanelProps {
  settings: AppSettings;
  appVersion: string;
  onBack: () => void;
  onChange: (next: AppSettings) => void;
  onOpenLogFolder: () => void;
  onRunDiagnostics: () => Promise<DiagnosticReport>;
}

const INTERVALS: AppSettings["checkInterval"][] = ["1h", "4h", "12h", "24h"];

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left hover:bg-border-soft"
    >
      <div className="flex-1">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        {description && (
          <div className="mt-0.5 text-[12px] leading-relaxed text-body">
            {description}
          </div>
        )}
      </div>
      <div
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-mcm-blue" : "bg-border-strong"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </div>
    </button>
  );
}

export function SettingsPanel({
  settings,
  appVersion,
  onBack,
  onChange,
  onOpenLogFolder,
  onRunDiagnostics,
}: SettingsPanelProps) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [running, setRunning] = useState(false);

  const handleRunDiagnostics = async () => {
    setRunning(true);
    try {
      const r = await onRunDiagnostics();
      setReport(r);
    } catch (e) {
      console.error("Diagnostics failed", e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white">
      <div className="flex items-center gap-2.5 border-b border-border bg-surface px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md p-1 text-[13px] text-mcm-blue hover:bg-border-soft"
        >
          <IconArrowLeft size={16} stroke={2} />
          Back
        </button>
        <div className="flex-1 text-center text-[13px] text-body">Settings</div>
        <div className="w-12" />
      </div>

      <div className="space-y-5 px-5 py-5">
        <section>
          <div className="mb-2 text-[11px] tracking-wide text-muted">UPDATES</div>
          <div className="space-y-2">
            <Toggle
              checked={settings.autoUpdateOnLaunch}
              onChange={(v) =>
                onChange({ ...settings, autoUpdateOnLaunch: v })
              }
              label="Check for updates on launch"
            />
            <Toggle
              checked={settings.showNotifications}
              onChange={(v) =>
                onChange({ ...settings, showNotifications: v })
              }
              label="Show notifications when bundles update"
            />
            <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <div className="mb-2 text-[13px] font-medium text-ink">
                Check for updates every
              </div>
              <div className="flex gap-1.5">
                {INTERVALS.map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => onChange({ ...settings, checkInterval: interval })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-[12px] tabular-nums transition-colors ${
                      settings.checkInterval === interval
                        ? "border-mcm-blue bg-mcm-blue text-white"
                        : "border-border-strong bg-white text-ink hover:bg-border-soft"
                    }`}
                  >
                    {interval}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 text-[11px] tracking-wide text-muted">FOLDER LABEL</div>
          <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <div className="mb-1 text-[13px] font-medium text-ink">
              Name used for created folders
            </div>
            <div className="mb-2 text-[12px] leading-relaxed text-body">
              Used for <span className="font-mono">Documents/&lt;label&gt; Presets</span> and Resolve's <span className="font-mono">LUT/&lt;label&gt;</span> subfolder. App data folder stays MCMVault.
            </div>
            <input
              type="text"
              value={settings.folderLabel}
              onChange={(e) =>
                onChange({ ...settings, folderLabel: e.target.value })
              }
              placeholder="MCM Vault"
              className="w-full rounded-md border border-border-strong bg-white px-2.5 py-1.5 text-[13px] text-ink focus:border-mcm-blue focus:outline-none"
            />
            <div className="mt-1.5 text-[11px] text-muted">
              Changing this won't move existing files; click <em>Update all</em> on the main view to reinstall to the new path.
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 text-[11px] tracking-wide text-muted">PUBLISHER</div>
          <Toggle
            checked={settings.publisherMode}
            onChange={(v) => onChange({ ...settings, publisherMode: v })}
            label="Enable publisher mode"
            description="Adds a Publish view where you push your local preset changes to the GitHub repo for the team. Uses your existing git credentials."
          />
        </section>

        <section>
          <div className="mb-2 text-[11px] tracking-wide text-muted">LOGS</div>
          <button
            type="button"
            onClick={onOpenLogFolder}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 hover:bg-border-soft"
          >
            <span className="text-[13px] text-ink">Open log folder</span>
            <IconExternalLink size={16} stroke={2} className="text-muted" />
          </button>
        </section>

        <section>
          <div className="mb-2 text-[11px] tracking-wide text-muted">DIAGNOSTICS</div>
          <button
            type="button"
            onClick={() => void handleRunDiagnostics()}
            disabled={running}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 hover:bg-border-soft disabled:opacity-60"
          >
            <span className="text-[13px] text-ink">
              {running ? "Scanning…" : "Run diagnostics"}
            </span>
            <IconRefresh
              size={16}
              stroke={2}
              className={`text-muted ${running ? "animate-spin" : ""}`}
            />
          </button>
          {report && (
            <pre className="mt-2 max-h-[260px] overflow-auto rounded-lg border border-border bg-titlebar px-3 py-2 font-mono text-[11px] leading-relaxed text-body">
              {JSON.stringify(report, null, 2)}
            </pre>
          )}
        </section>

        <section>
          <div className="mb-2 text-[11px] tracking-wide text-muted">ABOUT</div>
          <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <div className="flex justify-between py-0.5 text-[13px]">
              <span className="text-muted">App version</span>
              <span className="tabular-nums text-ink">{appVersion}</span>
            </div>
            <div className="flex justify-between py-0.5 text-[13px]">
              <span className="text-muted">Built for</span>
              <span className="text-ink">Milestone Creative Media</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
