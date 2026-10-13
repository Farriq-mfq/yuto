import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";
import { strings } from "../strings";

/**
 * Update flow PWA (register mode "prompt"): saat service worker baru siap,
 * tampilkan toast Sonner "Versi baru tersedia" + aksi Muat ulang
 * (skipWaiting + reload). Tanpa penukaran diam-diam di tengah mengedit.
 * Sonner me-render toast di live region (aria-live) bawaannya.
 */
export function PwaUpdatePrompt() {
  const { needRefresh, updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    toast.warning(strings.updateAvailableTitle, {
      id: "yuto-update-available",
      description: strings.updateAvailableHint,
      duration: Infinity,
      action: {
        label: strings.updateReload,
        onClick: () => updateServiceWorker(true),
      },
    });
    return () => {
      toast.dismiss("yuto-update-available");
    };
  }, [needRefresh, updateServiceWorker]);

  return null;
}
