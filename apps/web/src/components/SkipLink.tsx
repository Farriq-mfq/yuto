import { strings } from "../strings";

/**
 * Tautan lewati: tersembunyi di luar layar sampai menerima fokus keyboard,
 * lalu melompat ke <main id="konten-utama"> halaman aktif. Target sudah
 * `tabIndex={-1}` agar bisa menerima fokus programatik.
 */
export function SkipLink() {
  return (
    <a
      href="#konten-utama"
      className="fixed left-4 top-4 z-[60] inline-flex min-h-[44px] -translate-y-[300%] items-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold shadow-md outline-none transition-transform focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {strings.skipLink}
    </a>
  );
}
