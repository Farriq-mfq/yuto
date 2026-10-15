/**
 * UUID v4 tanpa `crypto.randomUUID` (tidak ada di insecure context —
 * mis. http://LAN saat live reload Capacitor — sehingga seed + tulis
 * lokal gagal total di sana dengan "crypto.randomUUID is not a function").
 * `crypto.getRandomValues` tersedia di semua runtime target (browser,
 * WebView, bun, node 19+).
 */
export function newUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // version 4 + variant RFC 4122
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}
