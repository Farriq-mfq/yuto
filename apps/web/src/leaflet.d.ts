/**
 * Deklarasi minimal untuk `leaflet` (tanpa @types/leaflet agar dependency
 * tetap hanya `leaflet`). Hanya mencakup permukaan API yang dipakai
 * LocationPicker: map, tileLayer OSM, marker draggable.
 */
declare module "leaflet" {
  export interface LatLng {
    lat: number;
    lng: number;
  }

  export type LatLngExpression = [number, number] | LatLng;

  export interface LeafletMouseEvent {
    latlng: LatLng;
  }

  export interface Map {
    setView(center: LatLngExpression, zoom?: number): Map;
    on(type: "click", fn: (event: LeafletMouseEvent) => void): Map;
    off(type: "click", fn: (event: LeafletMouseEvent) => void): Map;
    invalidateSize(): Map;
    remove(): void;
  }

  export interface MapOptions {
    attributionControl?: boolean;
  }

  export interface TileLayer {
    addTo(map: Map): TileLayer;
  }

  export interface TileLayerOptions {
    maxZoom?: number;
    attribution?: string;
  }

  export interface Marker {
    addTo(map: Map): Marker;
    setLatLng(latlng: LatLngExpression): Marker;
    on(type: "dragend", fn: () => void): Marker;
    getLatLng(): LatLng;
  }

  export interface MarkerOptions {
    draggable?: boolean;
  }

  const L: {
    map(el: HTMLElement, options?: MapOptions): Map;
    tileLayer(url: string, options?: TileLayerOptions): TileLayer;
    marker(latlng: LatLngExpression, options?: MarkerOptions): Marker;
  };

  export default L;
}
