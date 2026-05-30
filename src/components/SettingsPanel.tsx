import { useEffect, useState } from "react";
import { IconArrowLeft, IconRefresh, IconExternalLink } from "@tabler/icons-react";
import type { AppSettings, InstallTargets } from "../types";
import {
  listInstallTargetVersions,
  readRecentLog,
  type DetectedVersion,
  type DiagnosticReport,
  type InstallTargetVersions,
} from "../lib/tauri";

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
          <div className="mb-2 text-[11px] tracking-wide text-muted">
            INSTALL TARGETS
          </div>
          <InstallTargetsPicker
            settings={settings}
            onChange={(installTargets) =>
              onChange({ ...settings, installTargets })
            }
            folderLabel={settings.folderLabel || "MCM Vault"}
          />
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
          <div className="mb-2 text-[11px] tracking-wide text-muted">RECENT ACTIVITY</div>
          <RecentActivity />
          <button
            type="button"
            onClick={onOpenLogFolder}
            className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2 hover:bg-border-soft"
          >
            <span className="text-[12px] text-body">Open log folder</span>
            <IconExternalLink size={14} stroke={2} className="text-muted" />
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
          <div className="mb-2 text-[11px] tracking-wide text-muted">APP UPDATES</div>
          <AppUpdateButton />
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

function formatLogTimestamp(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function prettifyLogMessage(msg: string): string {
  // Tighten up the verbose Rust-side log lines into a friendlier sentence.
  if (msg.startsWith("install_bundle")) {
    const idMatch = msg.match(/id=(\S+)/);
    const versionMatch = msg.match(/version=(\S+)/);
    const filesMatch = msg.match(/files=(\d+)/);
    const id = idMatch?.[1] ?? "?";
    const ver = versionMatch?.[1] ?? "";
    const count = filesMatch?.[1] ?? "0";
    return `Installed ${id}${ver ? ` v${ver}` : ""} (${count} ${count === "1" ? "file" : "files"})`;
  }
  if (msg.startsWith("publish_bundles start")) {
    const m = msg.match(/\((\d+) bundle/);
    const n = m?.[1] ?? "?";
    return `Published ${n} ${n === "1" ? "bundle" : "bundles"}`;
  }
  if (msg.startsWith("fetch_manifest OK")) {
    const m = msg.match(/\((\d+) bundles/);
    return `Fetched manifest (${m?.[1] ?? "?"} bundles)`;
  }
  if (msg.startsWith("fetch_manifest GET")) return null as unknown as string;
  if (msg.startsWith("manifest parse failed")) return `Manifest parse error: ${msg.replace(/^manifest parse failed:\s*/, "")}`;
  return msg;
}

interface ParsedLog {
  iso: string;
  level: string;
  message: string;
}

function parseLogLine(line: string): ParsedLog | null {
  // Format: "<rfc3339> <LEVEL> <message>"
  const match = line.match(/^(\S+)\s+(\S+)\s+(.*)$/);
  if (!match) return null;
  const [, iso, level, rawMessage] = match;
  const message = prettifyLogMessage(rawMessage);
  if (!message) return null;
  return { iso, level, message };
}

function RecentActivity() {
  const [entries, setEntries] = useState<ParsedLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const lines = await readRecentLog(80);
      const parsed = lines
        .map(parseLogLine)
        .filter((p): p is ParsedLog => p !== null)
        .slice(0, 20);
      setEntries(parsed);
    } catch (e) {
      console.warn("readRecentLog failed", e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12px] text-muted">
        Loading…
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12px] text-muted">
        Nothing yet — actions you take will show up here.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border-soft bg-titlebar px-3 py-1">
        <span className="text-[10px] tracking-wide text-muted">
          {entries.length} most recent
        </span>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh activity"
          className="rounded p-0.5 text-muted hover:bg-border-soft"
        >
          <IconRefresh size={12} stroke={2} />
        </button>
      </div>
      <div className="max-h-[180px] overflow-y-auto">
        {entries.map((entry, i) => (
          <div
            key={i}
            className="flex items-start gap-2 border-b border-border-soft px-3 py-1.5 text-[12px] last:border-b-0"
          >
            <span
              className={`shrink-0 tabular-nums text-[10px] mt-[2px] ${
                entry.level === "ERROR" ? "text-error-fg" : "text-muted"
              }`}
            >
              {formatLogTimestamp(entry.iso)}
            </span>
            <span
              className={`flex-1 leading-snug ${
                entry.level === "ERROR" ? "text-error-fg" : "text-ink"
              }`}
            >
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface InstallTargetsPickerProps {
  settings: AppSettings;
  folderLabel: string;
  onChange: (next: InstallTargets) => void;
}

function InstallTargetsPicker({
  settings,
  onChange,
}: InstallTargetsPickerProps) {
  const [detected, setDetected] = useState<InstallTargetVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await listInstallTargetVersions();
        if (cancelled) return;
        setDetected(r);
      } catch (e) {
        if (cancelled) return;
        setError(
          typeof e === "object" && e && "message" in e
            ? String((e as { message?: unknown }).message ?? e)
            : String(e)
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const targets = settings.installTargets;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[12px] text-muted">
        Scanning installed apps…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-error-border bg-error-row-bg px-3.5 py-2.5 text-[12px] text-error-fg">
        Couldn't scan host apps: {error}
      </div>
    );
  }
  if (!detected) return null;

  const noVersions =
    detected.premierePro.length === 0 &&
    detected.adobeMediaEncoder.length === 0 &&
    detected.audition.length === 0;

  if (noVersions) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[12px] text-body">
        No host-app version folders detected. Install targets only apply when
        Premiere Pro, Adobe Media Encoder, or Audition is installed.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12px] leading-relaxed text-body">
        Pick which installed versions receive new files. Leave a row's checkboxes
        empty for "highest version only" (the default).
      </div>
      <AppRow
        label="Premiere Pro"
        versions={detected.premierePro}
        selected={targets.premierePro}
        onChange={(next) => onChange({ ...targets, premierePro: next })}
      />
      <AppRow
        label="Adobe Media Encoder"
        versions={detected.adobeMediaEncoder}
        selected={targets.adobeMediaEncoder}
        onChange={(next) => onChange({ ...targets, adobeMediaEncoder: next })}
      />
      <AppRow
        label="Audition"
        versions={detected.audition}
        selected={targets.audition}
        onChange={(next) => onChange({ ...targets, audition: next })}
      />
    </div>
  );
}

interface AppRowProps {
  label: string;
  versions: DetectedVersion[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function AppRow({ label, versions, selected, onChange }: AppRowProps) {
  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3.5 py-2 opacity-60">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-[11px] text-muted">Not installed</div>
      </div>
    );
  }
  const selectedSet = new Set(selected);
  const toggle = (versionLabel: string) => {
    const next = new Set(selectedSet);
    if (next.has(versionLabel)) next.delete(versionLabel);
    else next.add(versionLabel);
    onChange(
      Array.from(next).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true })
      )
    );
  };
  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        {selected.length === 0 ? (
          <span className="rounded bg-border-soft px-1.5 py-0.5 text-[10px] tracking-wide text-muted">
            HIGHEST ONLY
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-mcm-blue hover:underline"
          >
            Reset to highest only
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {versions.map((v) => {
          const on = selectedSet.has(v.label);
          return (
            <button
              key={v.label}
              type="button"
              onClick={() => toggle(v.label)}
              className={`rounded-md border px-2.5 py-1 text-[12px] tabular-nums transition-colors ${
                on
                  ? "border-mcm-blue bg-mcm-blue text-white"
                  : "border-border-strong bg-white text-ink hover:bg-border-soft"
              }`}
            >
              v{v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppUpdateButton() {
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "uptodate" }
    | { kind: "available"; version: string }
    | { kind: "downloading"; downloaded: number; total: number | null }
    | { kind: "ready" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const onClick = async () => {
    setStatus({ kind: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setStatus({ kind: "uptodate" });
        return;
      }
      setStatus({ kind: "available", version: update.version });
      let downloaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          setStatus({ kind: "downloading", downloaded: 0, total });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setStatus({ kind: "downloading", downloaded, total });
        } else if (event.event === "Finished") {
          setStatus({ kind: "ready" });
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setStatus({
        kind: "error",
        message:
          typeof e === "object" && e && "message" in e
            ? String((e as { message?: unknown }).message ?? e)
            : String(e),
      });
    }
  };

  let label = "Check for app updates";
  let busy = false;
  if (status.kind === "checking") {
    label = "Checking…";
    busy = true;
  } else if (status.kind === "uptodate") {
    label = "Up to date";
  } else if (status.kind === "available") {
    label = `Update available — v${status.version}, downloading…`;
    busy = true;
  } else if (status.kind === "downloading") {
    const pct = status.total
      ? Math.floor((status.downloaded / status.total) * 100)
      : null;
    label = pct != null ? `Downloading… ${pct}%` : "Downloading…";
    busy = true;
  } else if (status.kind === "ready") {
    label = "Restarting…";
    busy = true;
  } else if (status.kind === "error") {
    label = `Update failed: ${status.message}`;
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 hover:bg-border-soft disabled:opacity-60"
    >
      <span
        className={`text-[13px] ${
          status.kind === "error" ? "text-error-fg" : "text-ink"
        }`}
      >
        {label}
      </span>
      <IconRefresh
        size={16}
        stroke={2}
        className={`text-muted ${busy ? "animate-spin" : ""}`}
      />
    </button>
  );
}
