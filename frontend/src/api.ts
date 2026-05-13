const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "parent" | "school" | "admin";
}

export interface Device {
  id: number;
  identifier: string;
  student_id: number | null;
  api_key: string;
  last_seen_at: string | null;
  last_battery: number | null;
  is_active: boolean;
}

export interface Student {
  id: number;
  full_name: string;
  class_name: string;
  parent_id: number | null;
  device: Device | null;
}

export interface Geofence {
  id: number;
  name: string;
  zone_type: "school" | "home" | "route";
  student_id: number | null;
  coordinates: number[][];
}

export interface LocationPoint {
  id: number;
  device_id: number;
  lat: number;
  lon: number;
  battery: number | null;
  speed: number | null;
  recorded_at: string;
}

export interface Event {
  id: number;
  student_id: number;
  event_type: string;
  severity: "info" | "warning" | "critical";
  geofence_id: number | null;
  message: string;
  lat: number | null;
  lon: number | null;
  acknowledged: boolean;
  created_at: string;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; role: string; full_name: string; user_id: number }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),
  me: () => request<User>("/api/auth/me"),

  listStudents: () => request<Student[]>("/api/students"),
  createStudent: (data: { full_name: string; class_name: string; parent_id: number | null }) =>
    request<Student>("/api/students", { method: "POST", body: JSON.stringify(data) }),

  listDevices: () => request<Device[]>("/api/devices"),
  createDevice: (data: { identifier: string; student_id: number | null }) =>
    request<Device>("/api/devices", { method: "POST", body: JSON.stringify(data) }),
  assignDevice: (deviceId: number, studentId: number) =>
    request<Device>(`/api/devices/${deviceId}/assign/${studentId}`, { method: "POST" }),
  locateNow: (deviceId: number) =>
    request<{ ok: boolean; reason?: string; task_id: string }>(
      `/api/devices/${deviceId}/locate-now`,
      { method: "POST" },
    ),

  listGeofences: () => request<Geofence[]>("/api/geofences"),
  createGeofence: (data: {
    name: string;
    zone_type: string;
    coordinates: number[][];
    student_id: number | null;
  }) => request<Geofence>("/api/geofences", { method: "POST", body: JSON.stringify(data) }),
  deleteGeofence: (id: number) => request<void>(`/api/geofences/${id}`, { method: "DELETE" }),

  listEvents: (hours = 24) => request<Event[]>(`/api/events?hours=${hours}`),
  ackEvent: (id: number) => request<Event>(`/api/events/${id}/ack`, { method: "POST" }),

  lastLocation: (studentId: number) =>
    request<LocationPoint | null>(`/api/students/${studentId}/last-location`),
  track: (studentId: number, hours = 24) =>
    request<LocationPoint[]>(`/api/students/${studentId}/track?hours=${hours}`),

  createUser: (data: { email: string; password: string; full_name: string; role: string }) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  listUsers: () => request<User[]>("/api/users"),

  listContacts: (deviceId: number) =>
    request<Contact[]>(`/api/contacts?device_id=${deviceId}`),
  createContact: (data: {
    device_id: number;
    contact_type: string;
    number: string;
    display_name: string;
    serial_no: number;
  }) => request<Contact>("/api/contacts", { method: "POST", body: JSON.stringify(data) }),
  deleteContact: (id: number) => request<void>(`/api/contacts/${id}`, { method: "DELETE" }),
};

export interface Contact {
  id: number;
  device_id: number;
  contact_type: "family" | "sos" | "whitelist";
  number: string;
  display_name: string;
  serial_no: number;
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}
