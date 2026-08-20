import { useEffect, useMemo, useState } from "react";
import {
  IconFolderPlus,
  IconFolderSearch,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import { anchorPaths, pickFolder } from "../lib/tauri";

export interface NewBundleValues {
  name: string;
  sectionLabel: string;
  anchor: string;
  subpath: string;
}

interface CreateBundleModalProps {
  /** Existing section labels, so the user can reuse one or type a new one. */
  existingSections: string[];
  onClose: () => void;
  onCreate: (values: NewBundleValues) => Promise<void>;
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent);

// Anchors resolve to the platform-appropriate base folder on each machine.
const ANCHORS: { value: string; label: string; win: string; mac: string }[] = [
  { value: "documents", label: "Documents", win: "C:\\Users\\<you>\\Documents", mac: "~/Documents" },
  { value: "desktop", label: "Desktop", win: "C:\\Users\\<you>\\Desktop", mac: "~/Desktop" },
  { value: "home", label: "Home / User folder", win: "C:\\Users\\<you>", mac: "~" },
  { value: "appSupport", label: "App Support (advanced)", win: "AppData\\Roaming", mac: "~/Library/Application Support" },
];

export function CreateBundleModal({
  existingSections,
  onClose,
  onCreate,
}: CreateBundleModalProps) {
  const NEW_SECTION = "__new__";
  const [name, setName] = useState("");
  const [sectionChoice, setSectionChoice] = useState(
    existingSections[0] ?? NEW_SECTION
  );
  const [newSection, setNewSection] = useState("");
  const [anchor, setAnchor] = useState("documents");
  const [subpath, setSubpath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bases, setBases] = useState<Record<string, string>>({});
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Load each anchor's absolute base path so a browsed folder can be mapped
  // back to an anchor + relative subpath.
  useEffect(() => {
    const isTauriEnv =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauriEnv) return;
    anchorPaths()
      .then(setBases)
      .catch(() => setBases({}));
  }, []);

  const browse = async () => {
    setBrowseError(null);
    let picked: string | null;
    try {
      picked = await pickFolder();
    } catch {
      return;
    }
    if (!picked) return;
    // Match the picked path to the most specific anchor whose base contains it.
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
    const isWin = picked.includes("\\") || /^[a-zA-Z]:/.test(picked);
    const fold = (p: string) => (isWin ? p.toLowerCase() : p);
    const pickedN = fold(norm(picked));
    let best: { token: string; sub: string; baseLen: number } | null = null;
    for (const [token, base] of Object.entries(bases)) {
      const baseN = fold(norm(base));
      if (pickedN === baseN) {
        if (!best || baseN.length > best.baseLen)
          best = { token, sub: "", baseLen: baseN.length };
      } else if (pickedN.startsWith(baseN + "/")) {
        const sub = norm(picked).slice(norm(base).length + 1);
        if (!best || baseN.length > best.baseLen)
          best = { token, sub, baseLen: baseN.length };
      }
    }
    if (!best) {
      setBrowseError(
        "That folder isn't under Documents, Desktop, Home, or App Support. Pick a folder inside one of those so it can sync cross-platform."
      );
      return;
    }
    setAnchor(best.token);
    setSubpath(best.sub);
  };

  const sectionLabel =
    sectionChoice === NEW_SECTION ? newSection.trim() : sectionChoice;

  const anchorInfo = useMemo(
    () => ANCHORS.find((a) => a.value === anchor) ?? ANCHORS[0],
    [anchor]
  );

  const cleanSub = subpath.trim().replace(/^[/\\]+|[/\\]+$/g, "");
  const previewBase = IS_MAC ? anchorInfo.mac : anchorInfo.win;
  const previewSep = IS_MAC ? "/" : "\\";
  const previewPath = cleanSub
    ? `${previewBase}${previewSep}${cleanSub.replace(/\//g, previewSep)}`
    : previewBase;

  const canSubmit =
    name.trim().length > 0 &&
    sectionLabel.length > 0 &&
    cleanSub.length > 0 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        sectionLabel,
        anchor,
        subpath: cleanSub,
      });
    } catch (e) {
      setError(
        typeof e === "object" && e && "message" in e
          ? String((e as { message?: unknown }).message ?? e)
          : String(e)
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="flex max-h-[92%] w-full max-w-[500px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mcm-blue-tint text-mcm-blue">
            <IconFolderPlus size={20} stroke={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-tight text-ink">
              Add custom folder
            </div>
            <div className="mt-0.5 truncate text-[11px] leading-tight text-muted">
              Sync any folder across your team, cross-platform
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
            className="shrink-0 rounded-md p-1 text-muted hover:bg-border-soft disabled:opacity-40"
          >
            <IconX size={20} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          {/* Name */}
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.09em] text-muted">
              Name
            </span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lower Thirds"
              className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-[13px] text-ink focus:border-mcm-blue focus:outline-none"
            />
          </label>

          {/* Section */}
          <div className="mb-4">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.09em] text-muted">
              Section
            </span>
            <select
              value={sectionChoice}
              onChange={(e) => setSectionChoice(e.target.value)}
              className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-[13px] text-ink focus:border-mcm-blue focus:outline-none"
            >
              {existingSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={NEW_SECTION}>+ Create new section…</option>
            </select>
            {sectionChoice === NEW_SECTION && (
              <input
                type="text"
                autoFocus
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                placeholder="New section name — e.g. My Studio Assets"
                className="mt-1.5 w-full rounded-md border border-border-strong bg-white px-3 py-2 text-[13px] text-ink focus:border-mcm-blue focus:outline-none"
              />
            )}
          </div>

          {/* Folder location */}
          <div className="mb-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[.09em] text-muted">
                Folder location
              </span>
              <button
                type="button"
                onClick={() => void browse()}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border-strong bg-white px-2 py-1 text-[11px] text-ink hover:bg-border-soft"
              >
                <IconFolderSearch size={13} stroke={2} />
                Browse…
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                className="shrink-0 rounded-md border border-border-strong bg-white px-3 py-2 text-[13px] text-ink focus:border-mcm-blue focus:outline-none"
              >
                {ANCHORS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={subpath}
                onChange={(e) => setSubpath(e.target.value)}
                placeholder="MyTeam/Titles"
                className="min-w-0 flex-1 rounded-md border border-border-strong bg-white px-3 py-2 font-mono text-[12px] text-ink focus:border-mcm-blue focus:outline-none"
              />
            </div>
            {browseError && (
              <div className="mt-1.5 rounded-md border border-warning-border bg-warning-bg px-2.5 py-1.5 text-[11px] text-warning-text">
                {browseError}
              </div>
            )}
          </div>

          {/* Cross-platform preview */}
          <div className="mt-3 rounded-lg border border-mcm-blue/25 bg-mcm-blue-tint px-3.5 py-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.09em] text-mcm-blue">
              Where files land on each machine
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="w-7 shrink-0 text-[10px] font-bold uppercase tracking-[.09em] text-muted">
                  Win
                </span>
                <span className="min-w-0 flex-1 break-all font-mono text-[10.5px] leading-snug text-ink">
                  {anchorInfo.win}
                  {cleanSub ? "\\" + cleanSub.replace(/\//g, "\\") : ""}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-7 shrink-0 text-[10px] font-bold uppercase tracking-[.09em] text-muted">
                  Mac
                </span>
                <span className="min-w-0 flex-1 break-all font-mono text-[10.5px] leading-snug text-ink">
                  {anchorInfo.mac}
                  {cleanSub ? "/" + cleanSub : ""}
                </span>
              </div>
            </div>
            <div className="mt-2.5 text-[11px] leading-relaxed text-body">
              Each teammate's own username fills in automatically. This folder
              is created if it doesn't exist yet.
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-md border border-error-border bg-error-row-bg px-3 py-2 text-[12px] text-error-fg">
              {error}
            </div>
          )}

          <div className="mt-3 text-[11px] leading-relaxed text-muted">
            After creating, drop files into{" "}
            <span className="break-all font-mono text-[10.5px] text-body">
              {previewPath}
            </span>{" "}
            and publish them from this screen.
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <IconLoader2 size={16} stroke={2} className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <IconFolderPlus size={16} stroke={2} />
                Create
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
