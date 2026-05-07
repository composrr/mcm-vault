import { IconBulb, IconFolder, IconInfoCircle, IconX } from "@tabler/icons-react";
import type { Bundle } from "../types";

interface ManualImportModalProps {
  bundle: Bundle;
  syncPath: string;
  onClose: () => void;
  onReveal: () => void;
}

const RESOLVE_INSTRUCTIONS: { step: string }[] = [
  { step: "Open DaVinci Resolve and go to the **Color** page." },
  { step: "Open the **Gallery** panel (top left of the Color page)." },
  {
    step: "Right-click in the **PowerGrades** album and choose **Import**.",
  },
  {
    step: "Select all files in the folder linked below and click Open.",
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
  onClose,
  onReveal,
}: ManualImportModalProps) {
  const fileCount = bundle.files.length;
  const customSteps = bundle.importInstructions
    ? [{ step: bundle.importInstructions }]
    : RESOLVE_INSTRUCTIONS;
  const stepCountPhrase = `${fileCount} ${fileCount === 1 ? "file" : "files"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mcm-blue-tint">
            <IconInfoCircle size={20} stroke={2} className="text-mcm-blue" />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-semibold text-ink">
              Import in DaVinci Resolve
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

        <div className="px-6 py-5">
          <p className="mb-5 text-[13px] leading-relaxed text-body">
            PowerGrades and similar Resolve files live inside Resolve's
            database, so they need to be imported manually. The files are
            already synced to your computer — just follow these steps inside
            Resolve.
          </p>

          {customSteps.map((s, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-mcm-blue text-[12px] font-semibold text-white">
                {i + 1}
              </div>
              <div className="flex-1 text-[13px] leading-relaxed text-ink">
                {renderStrong(s.step)}
              </div>
            </div>
          ))}

          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <IconFolder size={18} stroke={2} className="shrink-0 text-muted" />
            <span className="flex-1 break-all font-mono text-[12px] text-body">
              {syncPath}
            </span>
          </div>

          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-mcm-blue/30 bg-mcm-blue-tint px-3.5 py-2.5">
            <IconBulb size={16} stroke={2} className="mt-0.5 shrink-0 text-mcm-blue" />
            <span className="text-[12px] leading-relaxed text-body">
              When this bundle updates, the {stepCountPhrase} in that folder
              will refresh automatically. Re-import to get the new versions.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft"
          >
            Don't show again
          </button>
          <button
            type="button"
            onClick={onReveal}
            className="flex items-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover"
          >
            <IconFolder size={16} stroke={2} />
            Reveal in Explorer
          </button>
        </div>
      </div>
    </div>
  );
}
