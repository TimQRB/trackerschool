import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Student, LocationPoint, TrackEvent, Geofence, WSMessage } from '../api/types';

interface LiveStudent {
  student: Student;
  location: LocationPoint | null;
  track: LocationPoint[];
}

interface LiveState {
  connected: boolean;
  students: LiveStudent[];
  events: TrackEvent[];
  geofences: Geofence[];
  selectedStudentId: number | null;
  setSelectedStudentId: (id: number | null) => void;
  loadInitialData: () => Promise<void>;
}

const LiveContext = createContext<LiveState>({
  connected: false,
  students: [],
  events: [],
  geofences: [],
  selectedStudentId: null,
  setSelectedStudentId: () => {},
  loadInitialData: async () => {},
});

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<LiveStudent[]>([]);
  const [events, setEvents] = useState<TrackEvent[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const studentsRef = useRef(students);
  studentsRef.current = students;

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'location') {
      const p = msg.payload;
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.student.id === p.student_id);
        if (idx === -1) return prev;
        const newPoint: LocationPoint = {
          id: p.id || 0,
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
          location: newPoint,
          track: [...next[idx].track.slice(-200), newPoint],
        };
        return next;
      });
    } else if (msg.type === 'event') {
      const p = msg.payload;
      const evt: TrackEvent = {
        id: p.id,
        student_id: p.student_id,
        event_type: p.event_type,
        severity: p.severity,
        geofence_id: p.geofence_id || null,
        message: p.message,
        lat: p.lat || null,
        lon: p.lon || null,
        acknowledged: p.acknowledged || false,
        created_at: p.created_at,
      };
      setEvents((prev) => [evt, ...prev]);
    }
  }, []);

  const connected = useWebSocket(handleMessage);

  const loadInitialData = useCallback(async () => {
    let studentList, fences, evts;
    try {
      [studentList, fences, evts] = await Promise.all([
        api.get<Student[]>('/api/students'),
        api.get<Geofence[]>('/api/geofences'),
        api.get<TrackEvent[]>('/api/events?hours=24'),
      ]);
    } catch (e) {
      console.error('Ошибка загрузки начальных данных:', e);
      return;
    }
    setGeofences(fences.data);
    setEvents(evts.data);

    const enriched = await Promise.all(
      studentList.data.map(async (s) => {
        try {
          const [locRes, trackRes] = await Promise.all([
            api.get<LocationPoint | null>(`/api/students/${s.id}/last-location`),
            api.get<LocationPoint[]>(`/api/students/${s.id}/track?hours=6`),
          ]);
          return { student: s, location: locRes.data, track: trackRes.data };
        } catch {
          return { student: s, location: null, track: [] };
        }
      }),
    );
    setStudents(enriched);
    if (enriched.length > 0) {
      setSelectedStudentId(enriched[0].student.id);
    }
  }, []);

  return (
    <LiveContext.Provider
      value={{
        connected,
        students,
        events,
        geofences,
        selectedStudentId,
        setSelectedStudentId,
        loadInitialData,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);
