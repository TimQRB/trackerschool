import { useEffect, useRef } from "react";
import L from "leaflet";
import { Geofence, LocationPoint, Student } from "../api";

interface LiveStudent {
  student: Student;
  point: LocationPoint | null;
  track: LocationPoint[];
}

interface Props {
  students: LiveStudent[];
  geofences: Geofence[];
  selectedStudentId: number | null;
  center?: [number, number];
}

const ZONE_COLORS: Record<string, string> = {
  school: "#3b82f6",
  home: "#22c55e",
  route: "#f59e0b",
};

export default function MapView({ students, geofences, selectedStudentId, center }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(center || [43.238, 76.9], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    geofences.forEach((g) => {
      const latlngs = g.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
      const color = ZONE_COLORS[g.zone_type] || "#64748b";
      L.polygon(latlngs, {
        color,
        fillColor: color,
        fillOpacity: 0.15,
        weight: 2,
      })
        .bindTooltip(`${g.name} (${g.zone_type})`)
        .addTo(layers);
    });

    students.forEach(({ student, point, track }) => {
      if (track.length > 1) {
        const trackLine = track.map((p) => [p.lat, p.lon] as [number, number]);
        L.polyline(trackLine, {
          color: "#6366f1",
          weight: 2,
          opacity: selectedStudentId === student.id ? 0.8 : 0.3,
          dashArray: "4,6",
        }).addTo(layers);
      }
      if (point) {
        const isSelected = selectedStudentId === student.id;
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            background: ${isSelected ? '#dc2626' : '#1e3a8a'};
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            border: 2px solid white;
          ">${student.full_name}</div>`,
          iconAnchor: [40, 12],
        });
        const marker = L.marker([point.lat, point.lon], { icon })
          .bindPopup(
            `<b>${student.full_name}</b><br/>Класс: ${student.class_name}<br/>` +
              `Заряд: ${point.battery ?? "—"}%<br/>` +
              `Обновлено: ${new Date(point.recorded_at).toLocaleTimeString()}`,
          )
          .addTo(layers);
        if (isSelected) marker.openPopup();
      }
    });

    if (selectedStudentId) {
      const sel = students.find((s) => s.student.id === selectedStudentId);
      if (sel?.point) map.setView([sel.point.lat, sel.point.lon], 16);
    }
  }, [students, geofences, selectedStudentId]);

  return <div ref={containerRef} className="map-container" />;
}
