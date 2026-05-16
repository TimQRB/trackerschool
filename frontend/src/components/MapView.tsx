import { useEffect, useRef, useState} from "react";
import L from "leaflet";
import { Geofence, LocationPoint, Student, Event } from "../api";

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
  focusTrigger?: number;
  events: Event[];
}

const ZONE_COLORS: Record<string, string> = {
  school: "#3b82f6",
  home: "#22c55e",
  route: "#f59e0b",
};

export default function MapView({ students, geofences, selectedStudentId, center, focusTrigger, events }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Храним ID студента, на которого мы УЖЕ сфокусировались, чтобы не прыгать постоянно
  const [lastCenteredId, setLastCenteredId] = useState<number | null>(null);
  const lastTriggerRef = useRef<number>(0);

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
    if (selectedStudentId !== lastCenteredId) {
      setLastCenteredId(null);
    }
  }, [selectedStudentId]);

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
        fillOpacity: 0.12,
        weight: 2,
        dashArray: "4, 4",
      })
        .bindTooltip(`${g.name} (${g.zone_type})`, { sticky: true })
        .addTo(layers);
    });

    students.forEach(({ student, point, track }) => {
      if (track.length > 1) {
        // Берём только последние 90 точек, чтобы симулятор не копил бесконечные круги
        const recentTrack = track.slice(-90);
        const isSelected = selectedStudentId === student.id;

        for (let i = 0; i < recentTrack.length - 1; i++) {
          const p1 = recentTrack[i];
          const p2 = recentTrack[i + 1];
          const segment = [
            [p1.lat, p1.lon] as [number, number],
            [p2.lat, p2.lon] as [number, number]
          ];

          const progress = i / (recentTrack.length - 1);
          const baseOpacity = isSelected ? 0.8 : 0.25;
          const opacity = baseOpacity * progress;

          L.polyline(segment, {
            color: isSelected ? "#6366f1" : "#94a3b8",
            weight: isSelected ? 3 : 2,
            opacity: opacity < 0.08 ? 0.08 : opacity,
            dashArray: "4, 4",
          }).addTo(layers);
        }
      }
      if (point) {
        const isSelected = selectedStudentId === student.id;
        const isLowBattery = (point.battery ?? 100) <= 15;
        const hasActiveSos = events.some(
          (e) => e.student_id === student.id && 
               e.event_type === "sos" && 
               e.severity === "critical" && 
               !e.acknowledged
        );

        const isCritical = isLowBattery || hasActiveSos;
        const icon = L.divIcon({
          className: "custom-student-marker-wrapper",
          html: `
            <div class="marker-avatar ${isSelected ? 'selected' : ''} ${isCritical ? 'pulse-critical' : ''}" 
                 style="background: ${hasActiveSos ? '#dc2626' : (isSelected ? '#6366f1' : '#1e3a8a')};">
              <span>${hasActiveSos ? '🚨' : '🚸'}</span>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18],   
          tooltipAnchor: [0, -18],
        });

        const marker = L.marker([point.lat, point.lon], { icon })
          // Тултип с именем всплывает ТОЛЬКО при наведении мыши
          .bindTooltip(`<b>${student.full_name}</b>`, { 
            direction: "top",
            opacity: 0.9 
          })
          // Детальный попап открывается по клику
          .bindPopup(
            `<div style="font-family: sans-serif; padding: 2px;">
              <b style="font-size: 14px;">${student.full_name}</b><br/>
              <span style="display:block; margin-top:4px;"><b>Класс:</b> ${student.class_name}</span>
              <span style="display:block; color: ${isLowBattery ? '#dc2626' : '#16a34a'}">
                <b>Заряд:</b> ${point.battery ?? "—"}%
              </span>
              <span style="display:block; font-size: 10px; color: #666; margin-top: 4px;">
                <b>Обновлено:</b> ${new Date(point.recorded_at).toLocaleTimeString()}
              </span>
            </div>`
          )
          .addTo(layers);

        if (isSelected && lastCenteredId === null) {
          marker.openPopup();
        }
      }
    });

    if (selectedStudentId) {
      const sel = students.find((s) => s.student.id === selectedStudentId);

      const isNewStudent = lastCenteredId !== selectedStudentId;
      const isExplicitClick = focusTrigger !== undefined && focusTrigger > lastTriggerRef.current;

      if (sel?.point && (isNewStudent || isExplicitClick)) {
        map.setView([sel.point.lat, sel.point.lon], 16);
        
        setLastCenteredId(selectedStudentId);
        if (focusTrigger !== undefined) {
          lastTriggerRef.current = focusTrigger;
        }
      }
    }
  }, [students, geofences, selectedStudentId, lastCenteredId, focusTrigger, events]);

  return <div ref={containerRef} className="map-container" />;
}
