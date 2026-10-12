/**
 * Helper murni untuk fitur lokasi (dipakai TransactionForm, LocationPicker,
 * dan TransactionDetail). Tanpa import Leaflet/React agar mudah di-test.
 */

/** Tengah default peta bila transaksi belum punya pin: Jakarta. */
export const JAKARTA_CENTER = { lat: -6.2, lng: 106.85 } as const;

/** Zoom default: cukup dekat untuk menaruh pin jalanan. */
export const MAP_ZOOM = 13;

/** Tile OpenStreetMap standar (satu-satunya request jaringan peta). */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface LocationDraft {
  latitude: number | null;
  longitude: number | null;
  locationName: string;
}

/** Pin dianggap ada hanya bila kedua koordinat terisi. */
export function hasPin(draft: LocationDraft): boolean {
  return draft.latitude !== null && draft.longitude !== null;
}

/** Koordinat format pendek untuk layar detail, mis. "-6.2088, 106.8456". */
export function formatCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

/**
 * Link eksternal ke OpenStreetMap (dibuka hanya bila user mengetuk;
 * bukan telemetry — tidak ada request otomatis).
 */
export function osmUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

export interface LocationPayload {
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

/**
 * Payload lokasi untuk POST/PATCH. `address` sengaja TIDAK dikirim:
 * cukup `locationName` (keputusan: satu kolom nama, tanpa duplikasi).
 * Pin yang tak lengkap (hanya satu koordinat) diabaikan total.
 */
export function locationPayload(draft: LocationDraft): LocationPayload {
  const out: LocationPayload = {};
  if (draft.latitude !== null && draft.longitude !== null) {
    out.latitude = draft.latitude;
    out.longitude = draft.longitude;
  }
  const name = draft.locationName.trim();
  if (name !== "") out.locationName = name;
  return out;
}
