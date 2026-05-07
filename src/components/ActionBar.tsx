import { IconDownload, IconFolder } from "@tabler/icons-react";

interface ActionBarProps {
  updatesAvailable: number;
  onUpdateAll?: () => void;
  onOpenFolder?: () => void;
  busy?: boolean;
}

export function ActionBar({
  updatesAvailable,
  onUpdateAll,
  onOpenFolder,
  busy = false,
}: ActionBarProps) {
  const hasUpdates = updatesAvailable > 0;

  return (
    <div className="flex gap-2.5 border-t border-border bg-surface px-5 py-3.5">
      <button
        type="button"
        disabled={!hasUpdates || busy}
        onClick={onUpdateAll}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-mcm-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-mcm-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconDownload size={16} stroke={2} />
        {hasUpdates ? `Update all (${updatesAvailable})` : "Up to date"}
      </button>
      <button
        type="button"
        onClick={onOpenFolder}
        className="flex items-center justify-center gap-1.5 rounded-md border border-border-strong bg-white px-4 py-2 text-[13px] text-ink hover:bg-border-soft"
      >
        <IconFolder size={16} stroke={2} />
        Open folder
      </button>
    </div>
  );
}
