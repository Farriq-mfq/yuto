import { strings } from "../../strings";

// Validasi URL server untuk pairing (Phase 11 part 3).
//
// Aturan: hanya `https://` (host apa pun) atau `http://` loopback
// (`localhost`, `127.0.0.1`, `::1` — untuk dev/emulator). `http://` ke IP
// LAN/hostname lain DITOLAK: token perangkat adalah bearer secret dan tak
// boleh melintasi jaringan cleartext. Konsekuensi yang disengaja: pairing
// HP → server LAN wajib `https://` (mis. via reverse-proxy TLS di rumah).
// Path harus root (tanpa `/api` — treaty menambahkannya sendiri).

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Hostname loopback (toleran bracket IPv6 ala WHATWG URL: "[::1]"). */
function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(host);
}

/** URL server yang sudah dinormalisasi (tanpa trailing slash). */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(strings.syncUrlInvalid);
  }
  if (url.protocol === "https:") {
    // ok: host apa pun
  } else if (url.protocol === "http:" && isLoopback(url.hostname)) {
    // ok: loopback untuk dev/emulator
  } else {
    throw new Error(strings.syncUrlBlocked);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(strings.syncUrlInvalid);
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "") {
    throw new Error(strings.syncUrlNoPath);
  }
  return `${url.protocol}//${url.host}`;
}
