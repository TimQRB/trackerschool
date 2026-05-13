import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Event, Geofence, LocationPoint, Student, User } from "../api";
import MapView from "../components/MapView";
import { useLiveBus } from "../useLiveBus";

interface Props {
  user: User;
  onLogout: () => void;
}

interface LiveStudent {
  student: Student;
  point: LocationPoint | null;
  track: LocationPoint[];
}

const EVENT_LABELS: Record<string, string> = {
  enter_zone: "Вход в зону",
  exit_zone: "Выход из зоны",
  sos: "SOS",
  low_battery: "Низкий заряд",
  lost_signal: "Потеря связи",
};

export default function Dashboard({ user, onLogout }: Props) {
  const [live, setLive] = useState<LiveStudent[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  async function loadAll() {
    const [students, fences, evts] = await Promise.all([
      api.listStudents(),
      api.listGeofences(),
      api.listEvents(24),
    ]);
    setGeofences(fences);
    setEvents(evts);

    const enriched = await Promise.all(
      students.map(async (s) => {
        const [point, track] = await Promise.all([
          api.lastLocation(s.id),
          api.track(s.id, 6),
        ]);
        return { student: s, point, track };
      }),
    );
    setLive(enriched);
    if (enriched.length > 0 && !selectedId) setSelectedId(enriched[0].student.id);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const connected = useLiveBus((msg) => {
    if (msg.type === "location") {
      const p = msg.payload;
      setLive((prev) => {
        const idx = prev.findIndex((x) => x.student.id === p.student_id);
        if (idx === -1) return prev;
        const newPoint: LocationPoint = {
          id: 0,
          device_id: p.device_id,
          lat: p.lat,
          lon: p.lon,
          battery: p.battery,
          speed: p.speed,
          recorded_at: p.recorded_at,
        };
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          point: newPoint,
          track: [...next[idx].track.slice(-200), newPoint],
        };
        return next;
      });
    } else if (msg.type === "event") {
      const p = msg.payload;
      setEvents((prev) => [
        {
          id: p.id,
          student_id: p.student_id,
          event_type: p.event_type,
          severity: p.severity,
          geofence_id: null,
          message: p.message,
          lat: p.lat,
          lon: p.lon,
          acknowledged: false,
          created_at: p.created_at,
        },
        ...prev,
      ]);
    }
  });

  return (
    <div className="app">
      <div className="topbar">
        <h1>SafeMektep — {roleLabel(user.role)}</h1>
        <div className="topbar-actions">
          <span>
            <span className={`connection-dot ${connected ? "online" : "offline"}`} />
            {connected ? "Онлайн" : "Нет связи"}
          </span>
          <span>{user.full_name}</span>
          {(user.role === "admin" || user.role === "school") && (
            <Link to="/admin" style={{ color: "white" }}>Управление</Link>
          )}
          <button onClick={onLogout}>Выйти</button>
        </div>
      </div>

      <div className="layout">
        <aside className="sidebar">
          <h3>Ученики</h3>
          {live.length === 0 && <div style={{ fontSize: 13, color: "#64748b" }}>Нет учеников</div>}
          {live.map(({ student, point }) => (
            <div
              key={student.id}
              className={`student-card ${selectedId === student.id ? "active" : ""}`}
              onClick={() => setSelectedId(student.id)}
            >
              <div className="name">{student.full_name}</div>
              <div className="meta">
                Класс {student.class_name}
                {student.device ? ` • ${student.device.identifier}` : " • без устройства"}
              </div>
              <div className="meta">
                {point
                  ? `Заряд: ${point.battery ?? "—"}% • ${new Date(point.recorded_at).toLocaleTimeString()}`
                  : "Нет данных"}
              </div>
              {student.device && (
                <button
                  className="btn-secondary"
                  style={{ marginTop: 8, padding: "4px 8px", fontSize: 12 }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const r = await api.locateNow(student.device!.id);
                      if (!r.ok) alert(r.reason || "Устройство не на связи");
                    } catch (err: any) {
                      alert("Ошибка: " + err.message);
                    }
                  }}
                >
                  📍 Найти сейчас
                </button>
              )}
            </div>
          ))}

          <h3 style={{ marginTop: 20 }}>События (24ч)</h3>
          {events.length === 0 && <div style={{ fontSize: 13, color: "#64748b" }}>Пока пусто</div>}
          {events.slice(0, 30).map((e) => (
            <div key={e.id} className={`event-item ${e.severity}`}>
              <div><b>{EVENT_LABELS[e.event_type] || e.event_type}</b></div>
              <div>{e.message}</div>
              <div className="time">{new Date(e.created_at).toLocaleString()}</div>
            </div>
          ))}
        </aside>

        <main>
          <MapView
            students={live}
            geofences={geofences}
            selectedStudentId={selectedId}
          />
        </main>
      </div>
    </div>
  );
}

function roleLabel(r: string) {
  return { parent: "Родитель", school: "Школа", admin: "Администратор" }[r] || r;
}
