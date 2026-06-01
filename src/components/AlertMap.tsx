import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPoint } from '../types';
import 'leaflet/dist/leaflet.css';

// Default Leaflet marker icons reference assets by relative path, which breaks
// under Vite's bundler. Re-point them at the bundled image URLs. See CLAUDE.md.
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function AlertMap({ point, height = 220 }: { point: GeoPoint; height?: number }) {
  return (
    <MapContainer center={[point.lat, point.lng]} zoom={14}
      style={{ height, width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[point.lat, point.lng]} />
    </MapContainer>
  );
}
