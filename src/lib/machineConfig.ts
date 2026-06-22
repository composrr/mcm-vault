import type { AppState, MachineConfig } from "../types";

/** Build the shareable config snapshot from current state. Only the fields that
 *  should match across a user's machines — publisher mode stays machine-local. */
export function buildMachineConfig(persisted: AppState): MachineConfig {
  return {
    version: 1,
    folderLabel: persisted.settings.folderLabel,
    installTargets: persisted.settings.installTargets,
    disabledBundles: persisted.disabledBundles,
    checkInterval: persisted.settings.checkInterval,
    showNotifications: persisted.settings.showNotifications,
    autoUpdateOnLaunch: persisted.settings.autoUpdateOnLaunch,
  };
}

/** Order-independent string fingerprint of the synced fields. Equality means
 *  "these two machines carry the same config." Stored at export/import time so
 *  the UI can flag drift when local settings change afterward. */
export function configFingerprint(cfg: MachineConfig): string {
  const norm = {
    folderLabel: cfg.folderLabel,
    installTargets: {
      premierePro: [...(cfg.installTargets?.premierePro ?? [])].sort(),
      adobeMediaEncoder: [...(cfg.installTargets?.adobeMediaEncoder ?? [])].sort(),
      audition: [...(cfg.installTargets?.audition ?? [])].sort(),
    },
    disabledBundles: [...(cfg.disabledBundles ?? [])].sort(),
    checkInterval: cfg.checkInterval,
    showNotifications: cfg.showNotifications,
    autoUpdateOnLaunch: cfg.autoUpdateOnLaunch,
  };
  return JSON.stringify(norm);
}
