import { IconSettings } from "@tabler/icons-react";
import { BrandMark } from "./BrandMark";

interface AppHeaderProps {
  onOpenSettings?: () => void;
}

export function AppHeader({ onOpenSettings }: AppHeaderProps) {
  return (
    <header data-tauri-drag-region className="flex items-center gap-3 border-b border-border bg-surface px-5 py-4">
      <BrandMark className="shrink-0 pointer-events-none" />
      <div data-tauri-drag-region className="flex-1">
        <div data-tauri-drag-region className="text-[16px] font-semibold leading-tight text-ink">MCM Vault</div>
        <div data-tauri-drag-region className="mt-0.5 text-[11px] tracking-[1.5px] text-muted">
          CREATIVE MEDIA REPOSITORY
        </div>
      </div>
      <button
        type="button"
        aria-label="Settings"
        onClick={onOpenSettings}
        className="flex items-center justify-center rounded-md p-1.5 text-muted hover:bg-border-soft"
      >
        <IconSettings size={20} stroke={1.75} />
      </button>
    </header>
  );
}
