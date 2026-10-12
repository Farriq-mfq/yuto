import "leaflet/dist/leaflet.css";
import L, {
  type LatLngExpression,
  type LeafletMouseEvent,
  type Marker,
} from "leaflet";
import { useEffect, useRef } from "react";
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

/**
 * Peta kecil OpenStreetMap: ketuk untuk menaruh pin, seret pin untuk
 * menggeser. Modul ini di-load malas (React.lazy) dari TransactionForm dan
 * hanya di-render bila `mapEnabled`, sehingga MAP_ENABLED=false berarti
 * tidak ada request tile sama sekali.
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
  // Pin awal (mode Edit) dibaca sekali saat peta dibuat.
  const initialRef = useRef({ latitude, longitude });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const start = initialRef.current;
    const center: LatLngExpression =
      start.latitude !== null && start.longitude !== null
        ? [start.latitude, start.longitude]
        : [JAKARTA_CENTER.lat, JAKARTA_CENTER.lng];
    const map = L.map(el).setView(center, MAP_ZOOM);
    L.tileLayer(OSM_TILE_URL, {
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
    }).addTo(map);

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
      // Bersihkan peta saat unmount agar tak leak antar navigasi.
      map.remove();
      markerRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={strings.locationLabel}
      className="z-0 h-[240px] w-full overflow-hidden rounded-xl border border-border"
    />
  );
}
