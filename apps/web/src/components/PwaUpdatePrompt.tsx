import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";
import { strings } from "../strings";

/**
 * Update flow PWA (register mode "prompt"): saat service worker baru siap,
 * tampilkan toast Sonner "Versi baru tersedia" + aksi Muat ulang
 * (skipWaiting + reload). Tanpa penukaran diam-diam di tengah mengedit.
 * Sonner me-render toast di live region (aria-live) bawaannya.
 *
 * why: tidak di-render di vite dev — di sana tidak ada service worker
 * (devOptions.enabled=false) dan stub dev useRegisterSW mengembalikan
 * tuple useState (selalu truthy!) dengan updateServiceWorker no-op,
 * sehingga tanpa guard ini toast muncul terus dan tombolnya tak berguna.
 */
export function PwaUpdatePrompt() {
  if (import.meta.env.DEV) return null;
  return <PwaUpdatePromptInner />;
}

function PwaUpdatePromptInner() {
  const { needRefresh, updateServiceWorker } = useRegisterSW();
  // why: tipe stub dev adalah tuple useState (selalu truthy); boolean
  // asli hanya ada di build prod. Tuple = stub = jangan tampilkan.
  const showPrompt = !Array.isArray(needRefresh) && needRefresh;

  useEffect(() => {
    if (!showPrompt) return;
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
  }, [showPrompt, updateServiceWorker]);

  return null;
}
