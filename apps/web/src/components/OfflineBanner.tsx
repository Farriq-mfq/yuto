import { WifiOffIcon } from "@/icons";
import { strings } from "../strings";
import { useOnline } from "../hooks/useOnline";

/**
 * Banner offline di semua tab (dirender di Shell). `role="status"` agar
 * screen reader mengumumkannya; teks menegaskan data mungkin tidak terbaru
 * (jangan tampilkan data basi seolah segar).
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground"
    >
      <p className="mx-auto flex min-h-[44px] w-full max-w-[480px] items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium">
        <WifiOffIcon size={18} strokeWidth={2} aria-hidden="true" />
        {strings.offlineMessage}
      </p>
    </div>
  );
}
