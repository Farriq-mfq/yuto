/**
 * Kebijakan app lock (murni, tanpa plugin — bisa di-unit-test).
 *
 * Kunci menutup akses UI saat aplikasi dibuka dan setiap kali aplikasi
 * kembali dari background lebih lama dari APP_LOCK_TIMEOUT.
 * Modul ini HANYA dipakai di build native (Capacitor); web tak tersentuh.
 */

// why: 2 menit — cukup lama agar pindah aplikasi sebentar (salin nominal
// dari m-banking) tak mengunci, cukup singkat agar ponsel yang tertinggal
// terbuka tak lama memamerkan data keuangan.
export const APP_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Haruskah aplikasi dikunci saat kembali foreground?
 * `backgroundedAtMs`: kapan aplikasi masuk background (null bila tak tercatat
 * — mis. event terlewat — maka kunci agar fail-closed).
 */
export function shouldRelock(
  backgroundedAtMs: number | null,
  nowMs: number,
): boolean {
  if (backgroundedAtMs === null) return true;
  return nowMs - backgroundedAtMs >= APP_LOCK_TIMEOUT_MS;
}
