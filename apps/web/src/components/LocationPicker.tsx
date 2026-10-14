import "leaflet/dist/leaflet.css";
import L, {
  type LatLngExpression,
  type LeafletMouseEvent,
  type Marker,
} from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapOffIcon } from "@/icons";
import { useOnline } from "../hooks/useOnline";
import {
  JAKARTA_CENTER,
  MAP_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "../lib/location";
import { strings } from "../strings";

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
}

// why: batas 3 — satu-dua tile gagal bisa glitch sesaat (zoom cepat,
// tile 404), tiga gagal beruntun = sumber tile/offline bermasalah.
const TILE_ERROR_THRESHOLD = 3;

/**
 * Peta kecil OpenStreetMap: ketuk untuk menaruh pin, seret pin untuk
 * menggeser. Modul ini di-load malas (React.lazy) dari TransactionForm dan
 * hanya di-render bila `mapEnabled`, sehingga MAP_ENABLED=false berarti
 * tidak ada request tile sama sekali.
 *
 * Bila offline (navigator.onLine) ATAU tile berulang gagal dimuat
 * (event `tileerror` Leaflet — sinyal umum koneksi putus di tengah jalan),
 * peta diganti panel pesan offline; nama lokasi manual (di TransactionForm)
 * tetap bisa diisi.
 */
export function LocationPicker({
  latitude,
  longitude,
  onPick,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // why: dibaca via ref agar effect re-init (offline → online) memakai pin
  // terkini dari parent, bukan nilai mount pertama.
  const liveRef = useRef({ latitude, longitude });
  liveRef.current = { latitude, longitude };
  const online = useOnline();
  const [tileErrors, setTileErrors] = useState(0);
  const showFallback = !online || tileErrors >= TILE_ERROR_THRESHOLD;

  useEffect(() => {
    if (showFallback) return;
    const el = containerRef.current;
    if (!el) return;
    const start = liveRef.current;
    const center: LatLngExpression =
      start.latitude !== null && start.longitude !== null
        ? [start.latitude, start.longitude]
        : [JAKARTA_CENTER.lat, JAKARTA_CENTER.lng];
    const map = L.map(el).setView(center, MAP_ZOOM);
    const tiles = L.tileLayer(OSM_TILE_URL, {
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
    });
    // why: tileerror = satu tile gagal (offline tengah jalan / server tile
    // mati); hitung, bukan sekali-gagal-langsung-ganti (glitch sesaat).
    const handleTileError = () => setTileErrors((n) => n + 1);
    tiles.on("tileerror", handleTileError);
    tiles.addTo(map);

    function placeOrMove(lat: number, lng: number) {
      const marker = markerRef.current;
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        const created = L.marker([lat, lng], { draggable: true }).addTo(map);
        created.on("dragend", () => {
          const pos = created.getLatLng();
          onPickRef.current(pos.lat, pos.lng);
        });
        markerRef.current = created;
      }
    }

    if (start.latitude !== null && start.longitude !== null) {
      placeOrMove(start.latitude, start.longitude);
    }
    const handleClick = (event: LeafletMouseEvent) => {
      placeOrMove(event.latlng.lat, event.latlng.lng);
      onPickRef.current(event.latlng.lat, event.latlng.lng);
    };
    map.on("click", handleClick);
    // Ukur ulang setelah mount agar tile ter-render penuh di dalam kartu.
    const timer = window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      window.clearTimeout(timer);
      map.off("click", handleClick);
      // Bersihkan peta saat unmount/ganti fallback agar tak leak.
      map.remove();
      markerRef.current = null;
    };
    // why: re-init HANYA saat transisi tampil/sembunyi fallback (offline ⇄
    // online, gagal ⇄ coba-lagi); nilai live dibaca via ref di atas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFallback]);

  if (showFallback) {
    return (
      <div
        role="status"
        className="flex h-[240px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 text-center"
      >
        <MapOffIcon size={32} aria-hidden="true" className="text-muted-foreground" />
        <p className="text-sm font-medium">{strings.locationOfflineTitle}</p>
        <p className="text-sm text-muted-foreground">
          {strings.locationOfflineHint}
        </p>
        <button
          type="button"
          onClick={() => setTileErrors(0)}
          className="mt-1 min-h-11 rounded-md border border-input bg-background px-4 text-sm font-medium"
        >
          {strings.locationRetryMap}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={strings.locationLabel}
      className="z-0 h-[240px] w-full overflow-hidden rounded-xl border border-border"
    />
  );
}
