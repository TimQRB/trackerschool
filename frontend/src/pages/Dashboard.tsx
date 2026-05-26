import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, Event, Geofence, LocationPoint, Student, User } from "../api";
import MapView from "../components/MapView";
import TrackHistoryPanel from "../components/TrackHistoryPanel";
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
  const [focusTrigger, setFocusTrigger] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [pageSize, setPageSize] = useState<number>(20);
  const [historyTrack, setHistoryTrack] = useState<any[] | null>(null);

  async function handleAck(eventId: number) {
    try {
      await api.ackEvent(eventId);
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, acknowledged: true } : e))
      );
    } catch (err) {
      console.error("Не удалось подтвердить событие:", err);
      alert("Ошибка при подтверждении события");
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [students, fences, evts] = await Promise.all([
        api.listStudents(),
        api.listGeofences(),
        api.listEvents(24),
      ]);
      setGeofences(fences);
      setEvents(evts);

      // Оптимизация: Если учеников слишком много, для защиты от падения 
      // запрашиваем гео-данные только для первой сотни при старте.
      const initialBatch = students.slice(0, 100);

      const enriched = await Promise.all(
        initialBatch.map(async (s) => {
          const [point, track] = await Promise.all([
            api.lastLocation(s.id).catch(() => null),
            api.track(s.id, 6).catch(() => []),
          ]);
          return { student: s, point, track };
        })
      );

      // Для остальных учеников создаем пустые заготовки локаций (они догрузятся по вебсокету или при клике)
      const remaining = students.slice(100).map(s => ({ student: s, point: null, track: [] }));
      
      const allEnriched = [...enriched, ...remaining];
      setLive(allEnriched);
      
      if (allEnriched.length > 0 && !selectedId) {
        setSelectedId(allEnriched[0].student.id);
      }
    } catch (err) {
      console.error("Ошибка инициализации дашборда:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const uniqueClasses = useMemo(() => {
    return Array.from(new Set(live.map((item) => item.student.class_name)))
      .filter(Boolean)
      .sort();
  }, [live]);

  const filteredLive = useMemo(() => {
    return live.filter(({ student }) => {
      const matchesSearch = student.full_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClass = selectedClass === "" || student.class_name === selectedClass;
      return matchesSearch && matchesClass;
    });
  }, [live, searchQuery, selectedClass]);

  const visibleLive = useMemo(() => {
    return filteredLive.slice(0, pageSize);
  }, [filteredLive, pageSize]);

  const filteredEvents = useMemo(() => {
  // Если фильтры не выбраны (поиск пустой и класс не выбран), возвращаем все события без изменений
  if (searchQuery === "" && selectedClass === "") {
    return events;
  }

  const allowedStudentIds = new Set(filteredLive.map(item => item.student.id));

  // Оставляем только те события, которые принадлежат отфильтрованным ученикам
  return events.filter(event => allowedStudentIds.has(event.student_id));
}, [events, filteredLive, searchQuery, selectedClass]);

  const connected = useLiveBus((msg) => {
    if (msg.type === "location") {
      const p = msg.payload;
      setLive((prev) => {
        const idx = prev.findIndex((x) => x.student.id === p.student_id);
        if (idx === -1) return prev;
        const newPoint: LocationPoint = {
          id: 0, device_id: p.device_id, lat: p.lat, lon: p.lon,
          battery: p.battery, speed: p.speed, recorded_at: p.recorded_at,
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
          id: p.id, student_id: p.student_id, event_type: p.event_type,
          severity: p.severity, geofence_id: null, message: p.message,
          lat: p.lat, lon: p.lon, acknowledged: false, created_at: p.created_at,
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
            <Link to="/admin" style={{ color: "white", marginRight: 8 }}>Управление</Link>
          )}
          <button onClick={onLogout}>Выйти</button>
        </div>
      </div>

      <div className="layout">
        <aside className="sidebar" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden" }}>
          
          <div style={{ padding: "12px 0", borderBottom: "1px solid #e2e8f0" }}>
            <input 
              type="text"
              placeholder="🔍 Поиск ученика..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", marginBottom: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
            />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, background: "white" }}
            >
              <option value="">Все классы</option>
              {uniqueClasses.map(c => (
                <option key={c} value={c}>{c} класс</option>
              ))}
            </select>
          </div>

          <TrackHistoryPanel 
            selectedStudentId={selectedId}
            onTrackLoaded={(points) => setHistoryTrack(points)} 
          />

          <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginTop: 8 }}>
            <h3>Ученики ({filteredLive.length})</h3>
            {loading && <div style={{ fontSize: 13, color: "#64748b" }}>Загрузка данных...</div>}
            {!loading && filteredLive.length === 0 && <div style={{ fontSize: 13, color: "#64748b" }}>Никого не найдено</div>}
            
            {visibleLive.map(({ student, point }) => (
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
                      setSelectedId(student.id);
                      setFocusTrigger(prev => prev + 1);
                      try {
                        const r = await api.locateNow(student.device!.id);                      
                        if (!r.ok) {
                          console.warn(`Устройство ${student.full_name} не ответило на пинг:`, r.reason);
                        }
                      } catch (err: any) {
                        console.error("Ошибка фонового поиска:", err.message);
                      }
                    }}
                  >
                    📍 Найти сейчас
                  </button>
                )}
              </div>
            ))}

            {filteredLive.length > pageSize && (
              <button
                onClick={() => setPageSize(prev => prev + 20)}
                style={{ width: "100%", padding: "8px", marginTop: 8, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#475569" }}
              >
                Показать ещё ({filteredLive.length - pageSize})
              </button>
            )}
          </div>
          <div style={{ height: "250px", borderTop: "2px solid #e2e8f0", overflowY: "auto", paddingTop: 8 }}>
            <h3>События (24ч)</h3>
            {filteredEvents.length === 0 && <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: "10px 0" }}>Нет событий для выбранных фильтров</div>}
            {filteredEvents.slice(0, 30).map((e) => (
              <div 
                key={e.id} 
                className={`event-item ${e.severity}`}
                style={{
                  padding: "10px",
                  marginBottom: "8px",
                  borderRadius: "8px",
                  borderLeft: e.severity === "critical" || e.event_type === "sos" ? "4px solid #dc2626" : "4px solid #3b82f6",
                  background: e.acknowledged ? "#f8fafc" : "#ffffff",
                  opacity: e.acknowledged ? 0.6 : 1,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <b>{EVENT_LABELS[e.event_type] || e.event_type}</b>
                  {(user.role === "admin" || user.role === "school") && !e.acknowledged && (
                    <button
                      onClick={() => handleAck(e.id)}
                      style={{
                        padding: "2px 8px",
                        fontSize: "11px",
                        background: "#10b981",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: 600
                      }}
                    >
                      ✓ Ок
                    </button>
                  )}
                </div>
                <div style={{ fontSize: "13px", marginTop: "4px", color: "#334155" }}>{e.message}</div>
                <div className="time" style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                  {new Date(e.created_at).toLocaleString()} 
                  {e.acknowledged && <span style={{ color: "#10b981", marginLeft: "6px", fontWeight: 600 }}>[Проверено]</span>}
                </div>
              </div>
              
            ))}
          </div>
        </aside>

        <main style={{ flex: 1, position: "relative" }}>
          <MapView
            students={filteredLive}
            geofences={geofences}
            selectedStudentId={selectedId}
            focusTrigger={focusTrigger}
            events={events}
            historyTrack={historyTrack}
          />
        </main>
      </div>
    </div>
  );
}

function roleLabel(r: string) {
  return { parent: "Родитель", school: "Школа", admin: "Администратор" }[r] || r;
}