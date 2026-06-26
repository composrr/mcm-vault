import {
  IconBulb,
  IconCheck,
  IconFolder,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import type { Bundle, ImportedState } from "../types";

interface ManualImportModalProps {
  bundle: Bundle;
  syncPath: string;
  imported: ImportedState | null;
  onClose: () => void;
  onReveal: () => void;
  onMarkImported: () => void;
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent);

const RESOLVE_INSTRUCTIONS: { step: string }[] = [
  { step: "Open DaVinci Resolve and go to the **Color** page." },
  { step: "Open the **Gallery** panel (top left of the Color page)." },
  {
    step: "Right-click in the **PowerGrades** album and choose **Import**.",
  },
  {
    step: "Select the files in the folder linked below and click Open.",
  },
];

function renderStrong(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ManualImportModal({
  bundle,
  syncPath,
  imported,
  onClose,
  onReveal,
  onMarkImported,
}: ManualImportModalProps) {
  const customSteps = bundle.importInstructions
    ? [{ step: bundle.importInstructions }]
    : RESOLVE_INSTRUCTIONS;

  const isResolveBundle = bundle.category === "resolve";
  const modalTitle = isResolveBundle ? "Import in DaVinci Resolve" : `Import in ${bundle.name.includes("Premiere") ? "Premiere Pro" : bundle.name.includes("Audition") ? "Audition" : "Your App"}`;
  const introText = isResolveBundle
    ? "PowerGrades and similar Resolve files live inside Resolve's database, so they need to be imported manually. The files are already synced to your computer — just follow these steps inside Resolve."
    : bundle.importInstructions
      ? "These files are already synced to your computer — just follow the steps below to use them."
      : null;

  // What's new since the user last confirmed an import. If they've never
  // imported, every file is new. If they imported an older version, show the
  // files added since — and flag that same-named files may have changed.
  const alreadyImportedThisVersion =
    imported != null && imported.version === bundle.version;
  const importedNames = new Set(imported?.files ?? []);
  const newFiles = bundle.files.filter((f) => !importedNames.has(f));
  const isFirstImport = imported == null;
  const revealLabel = IS_MAC ? "Reveal in Finder" : "Reveal in Explorer";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90%] w-full max-w-[500px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mcm-blue-tint">
            <IconInfoCircle size={20} stroke={2} className="text-mcm-blue" />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-semibold text-ink">
              {modalTitle}
            </div>
            <div className="mt-0.5 text-[12px] text-body">
              {bundle.name} · v{bundle.version}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted hover:bg-border-soft"
          >
            <IconX size={20} stroke={2} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {alreadyImportedThisVersion ? (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-success-border bg-success-bg px-3.5 py-3">
              <IconCheck
                size={18}
                stroke={2.25}
                className="mt-0.5 shrink-0 text-success-fg"
              />
              <div className="text-[13px] leading-relaxed text-ink">
                You've already imported this version. The {bundle.files.length}{" "}
                {bundle.files.length === 1 ? "file is" : "files are"} synced and
                marked as imported — nothing to do unless you want to re-import.
              </div>
            </div>
          ) : (
            <>
              {introText && (
                <p className="mb-4 text-[13px] leading-relaxed text-body">
                  {introText}
                </p>
              )}

              {/* What's new since last import */}
              <div className="mb-4 rounded-lg border border-mcm-blue/30 bg-mcm-blue-tint px-3.5 py-3">
                <div className="mb-1 text-[12px] font-semibold text-mcm-blue">
                  {isFirstImport
                    ? `Import these ${bundle.files.length} ${
                        bundle.files.length === 1 ? "file" : "files"
                      }`
                    : newFiles.length > 0
                      ? `${newFiles.length} new since your last import`
                      : "Files updated since your last import"}
                </div>
                {newFiles.length > 0 ? (
                  <div className="space-y-0.5">
                    {newFiles.map((f) => (
                      <div
                        key={f}
                        className="font-mono text-[11.5px] text-ink"
                      >
                        + {f.replace(/\.[^.]+$/, "")}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12px] leading-relaxed text-body">
                    No new files — but this bundle's version changed, so existing
                    grades may have been updated. Re-import to be sure.
                  </div>
                )}
              </div>

              {customSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5">
                  <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-mcm-blue text-[12px] font-semibold text-white">
                    {i + 1}
                  </div>
                  <div className="flex-1 text-[13px] leading-relaxed text-ink">
                    {renderStrong(s.step)}
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <IconFolder size={18} stroke={2} className="shrink-0 text-muted" />
            <span className="flex-1 break-all font-mono text-[12px] text-body">
              {syncPath}
            </span>
          </div>

          {!alreadyImportedThisVersion && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <IconBulb
                size={16}
                stroke={2}
                className="mt-0.5 shrink-0 text-muted"
              />
              <span className="text-[12px] leading-relaxed text-body">
                Once you've imported them in Resolve, click{" "}
                <span className="font-medium">Mark as imported</span> so this
                bundle stops nagging you. We'll only flag it again when there are
                new files to import.
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onReveal}
            className="flex items-center gap-1.5 rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft"
          >
            <IconFolder size={16} stroke={2} />
            {revealLabel}
          </button>
          {!alreadyImportedThisVersion && (
            <button
              type="button"
              onClick={() => {
                onMarkImported();
                onClose();
              }}
              className="flex items-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
            >
              <IconCheck size={16} stroke={2} />
              Mark as imported
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
