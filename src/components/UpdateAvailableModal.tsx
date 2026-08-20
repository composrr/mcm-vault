import type { CSSProperties } from "react";
import { IconDownload, IconLoader2, IconSparkles, IconX } from "@tabler/icons-react";

interface UpdateAvailableModalProps {
  version: string;
  currentVersion: string;
  notes: string;
  downloading: boolean;
  progressPct: number | null;
  error: string | null;
  onUpdateNow: () => void;
  onLater: () => void;
  onSkip: () => void;
}

/** Light parse of GitHub-flavoured release notes: an optional leading "#"/"##"
 *  heading becomes the headline, "-" lines become items, and everything from a
 *  "---" separator onward (install instructions) is dropped. */
function parseNotes(notes: string): { headline: string | null; items: string[] } {
  const raw = notes.replace(/\r\n/g, "\n").trim();
  if (!raw) return { headline: null, items: [] };

  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) break;
    lines.push(line);
  }

  let headline: string | null = null;
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      if (headline === null) headline = heading[1].trim();
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      const text = bullet[1].trim();
      if (text) items.push(text);
    }
  }

  return { headline, items };
}

export function UpdateAvailableModal({
  version,
  currentVersion,
  notes,
  downloading,
  progressPct,
  error,
  onUpdateNow,
  onLater,
  onSkip,
}: UpdateAvailableModalProps) {
  const parsed = parseNotes(notes);
  const headline = parsed.headline ?? `What's new in v${version}`;
  const items = parsed.items;
  const fallbackBody = notes.trim()
    ? notes.trim()
    : "This update includes general improvements and fixes.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={downloading ? undefined : onLater}
    >
      <div
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{ maxHeight: "calc(100vh - 40px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Head */}
        <div className="px-6 pb-4 pt-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[.09em] text-mcm-blue tabular-nums">
                MCM Vault · Version {version}
              </div>
              <h2
                className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-ink"
                style={{ textWrap: "pretty" } as CSSProperties}
              >
                {headline}
              </h2>
            </div>
            {/* Dismiss. Hidden mid-download so the modal can't be closed out
                from under an install that's already running. */}
            {!downloading && (
              <button
                type="button"
                aria-label="Close"
                onClick={onLater}
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted hover:bg-border-soft hover:text-ink"
              >
                <IconX size={20} stroke={2} />
              </button>
            )}
          </div>
          <div className="mt-2 text-[12.5px] leading-relaxed text-muted tabular-nums">
            You're on v{currentVersion}.
          </div>
        </div>

        {/* Items */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          {items.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {items.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mcm-blue-tint text-mcm-blue">
                    <IconSparkles size={17} stroke={2} />
                  </div>
                  <div className="min-w-0 flex-1 pt-1 text-[12.5px] leading-relaxed text-body">
                    {item}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-body">
              {fallbackBody}
            </p>
          )}

          {downloading && (
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-[12px] text-body">
                <span>Downloading update…</span>
                {progressPct != null && (
                  <span className="tabular-nums text-muted">
                    {Math.round(progressPct)}%
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-soft">
                <div
                  className="h-full rounded-full bg-mcm-blue transition-all"
                  style={{
                    width: `${progressPct != null ? Math.max(4, progressPct) : 20}%`,
                  }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-error-border bg-error-row-bg px-3.5 py-2.5 text-[12px] text-error-fg">
              {error}
            </div>
          )}
        </div>

        {/* Foot */}
        <div className="flex shrink-0 flex-col gap-2.5 px-6 pb-5 pt-4">
          <button
            type="button"
            onClick={onUpdateNow}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-mcm-blue px-4 py-2.5 text-[13px] font-medium text-white hover:bg-mcm-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? (
              <IconLoader2 size={16} stroke={2} className="animate-spin" />
            ) : (
              <IconDownload size={16} stroke={2} />
            )}
            {downloading ? "Updating…" : "Update and restart"}
          </button>
          <div className="flex items-center justify-center gap-3 text-[12px]">
            <button
              type="button"
              onClick={onLater}
              disabled={downloading}
              className="rounded-md px-1.5 py-0.5 text-muted hover:text-ink disabled:opacity-40"
            >
              Later
            </button>
            <span aria-hidden="true" className="text-border-strong">
              ·
            </span>
            <button
              type="button"
              onClick={onSkip}
              disabled={downloading}
              className="rounded-md px-1.5 py-0.5 text-muted hover:text-ink disabled:opacity-40"
            >
              Skip this version
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
