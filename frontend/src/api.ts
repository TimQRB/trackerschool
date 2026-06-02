const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
// Data interfaces
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "parent" | "school" | "admin";
  school_id: number | null;
  is_onboarded: boolean;
  must_change_password: boolean;
}

export interface Device {
  id: number;
  identifier: string;
  imei: string | null;
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
  parent_email?: string | null;
  device: Device | null;
  school_id: number | null;
}

export interface School {
  id: number;
  name: string;
  address?: string | null;
}

export interface Geofence {
  id: number;
  name: string;
  zone_type: "school" | "home" | "route";
  student_id: number | null;
  school_id: number | null;
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

export interface Contact {
  id: number;
  device_id: number;
  contact_type: "family" | "sos" | "whitelist";
  number: string;
  display_name: string;
  serial_no: number;
}

export interface SerialPort {
  port: string;
  description: string;
  hwid: string;
}

export interface AtTemplate {
  command: string;
  label: string;
  description: string;
}

export interface AtLogEntry {
  id: number;
  device_id: number | null;
  command: string;
  response: string | null;
  source: string;
  success: boolean;
  created_at: string;
}
// Response interfaces
export interface BaseResponse {
  status: string;
  message: string;
}

export interface LoginResponse {
  access_token: string;
  role: string;
  full_name: string;
  user_id: number;
  must_change_password: boolean;
  is_onboarded: boolean;
}

export interface LocateNowResponse {
  ok: boolean;
  reason?: string;
  task_id: string;
}

export interface RemoteCommandResponse {
  ok: boolean;
  reason?: string;
  imei: string;
  command: string;
}
//  Dto interfaces for creating/updating entities
export interface CreateStudentDto {
  full_name: string;
  class_name: string;
  parent_id: number | null;
  school_id: number | null;
}

export interface PatchStudentDto {
  full_name?: string;
  class_name?: string;
  parent_id?: number | null;
  school_id?: number | null;
}

export interface CreateSchoolDto {
  name: string;
  address?: string;
}

export interface PatchSchoolDto {
  name?: string;
  address?: string;
}

export interface CreateUserDto {
  email: string;
  password?: string;
  full_name: string;
  role: string;
  school_id?: number | null;
}

export interface PatchUserDto {
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  school_id?: number | null;
}

export interface CreateDeviceDto {
  identifier: string;
  student_id: number | null;
}

export interface CreateGeofenceDto {
  name: string;
  zone_type: "school" | "home" | "route";
  coordinates: number[][];
  student_id: number | null;
  school_id: number | null;
}

export interface CreateContactDto {
  device_id: number;
  contact_type: "family" | "sos" | "whitelist";
  number: string;
  display_name: string;
  serial_no: number;
}

export interface SaveAtHistoryDto {
  device_id?: number | null;
  command: string;
  response?: string;
  source?: string;
  success?: boolean;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const incomingHeaders = (options.headers as Record<string, string>) || {};
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...incomingHeaders,
  };

  if ("Content-Type" in incomingHeaders && incomingHeaders["Content-Type"] === undefined) {
    delete headers["Content-Type"];
  }
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.replace("/login"); 
    throw new Error("Сессия истекла. Пожалуйста, войдите снова.");
  }
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorData = await res.json();
      if (errorData && errorData.detail) {
        if (typeof errorData.detail === "string") {
          errorMessage = errorData.detail;
        } else if (typeof errorData.detail === "object" && errorData.detail.message) {
          errorMessage = errorData.detail.message;
        }
      }
    } catch {
      const text = await res.text().catch(() => "");
      if (text) errorMessage = text.substring(0, 200);
    }
    
    throw new Error(errorMessage);
  }
  
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),

  completeOnboarding: (fullName: string, newPassword: string) =>
    request<{ status: string; detail: string }>("/api/auth/complete-onboarding", {
      method: "POST",
      body: JSON.stringify({
        full_name: fullName,
        new_password: newPassword,
      }),
    }),
    
  me: () => request<User>("/api/auth/me"),

  // Students
  listStudents: () => request<Student[]>("/api/students"),
  
  createStudent: (data: CreateStudentDto) =>
    request<Student>("/api/students", { method: "POST", body: JSON.stringify(data) }),
    
  patchStudent: (id: number, data: PatchStudentDto) => 
    request<Student>(`/api/students/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    
  deleteStudent: (id: number) => request<void>(`/api/students/${id}`, { method: "DELETE" }),
  
  bulkDeleteStudents: (ids: number[]) => 
    request<BaseResponse>("/api/students/bulk-delete", {
      method: "POST",
      body: JSON.stringify(ids),
    }),

  importStudentsCSV: async (file: File, schoolId: string) => {
    const formData = new FormData();
    formData.append("file", file);
    const queryParam = schoolId ? `?school_id=${schoolId}` : "";

    return request<BaseResponse>(`/api/students/import-csv${queryParam}`, {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": undefined as any, 
      },
    });
  },

  // Schools
  listSchools: () => request<School[]>("/api/schools"),
  
  createSchool: (data: CreateSchoolDto) =>
    request<School>("/api/schools", { method: "POST", body: JSON.stringify(data) }),
    
  deleteSchool: (id: number) => 
    request<BaseResponse>(`/api/schools/${id}`, { method: "DELETE" }),
    
  patchSchool: (id: number, data: PatchSchoolDto) => 
    request<School>(`/api/schools/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    
  bulkDeleteSchools: (ids: number[]) => 
    request<BaseResponse>("/api/schools/bulk-delete", { 
      method: "POST", 
      body: JSON.stringify(ids) 
    }),

  // Devices
  listDevices: () => request<Device[]>("/api/devices"),
  
  createDevice: (data: CreateDeviceDto) =>
    request<Device>("/api/devices", { method: "POST", body: JSON.stringify(data) }),
    
  assignDevice: (deviceId: number, studentId: number) =>
    request<Device>(`/api/devices/${deviceId}/assign/${studentId}`, { method: "POST" }),
    
  locateNow: (deviceId: number) =>
    request<LocateNowResponse>(
      `/api/devices/${deviceId}/locate-now`,
      { method: "POST" },
    ),

  // Geofences
  listGeofences: () => request<Geofence[]>("/api/geofences"),
  
  createGeofence: (data: CreateGeofenceDto) => 
    request<Geofence>("/api/geofences", { method: "POST", body: JSON.stringify(data) }),
    
  deleteGeofence: (id: number) => request<void>(`/api/geofences/${id}`, { method: "DELETE" }),

  // Events
  listEvents: (hours = 24) => request<Event[]>(`/api/events?hours=${hours}`),
  ackEvent: (id: number) => request<Event>(`/api/events/${id}/ack`, { method: "POST" }),

  lastLocation: (studentId: number) =>
    request<LocationPoint | null>(`/api/students/${studentId}/last-location`),
  track: (studentId: number, hours = 24) =>
    request<LocationPoint[]>(`/api/students/${studentId}/track?hours=${hours}`),
  
  // Users
  createUser: (data: CreateUserDto) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(data) }),
    
  listUsers: () => request<User[]>("/api/users"),
  
  patchUser: (id: number, data: PatchUserDto) => 
    request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    
  deleteUser: (id: number) => 
    request<BaseResponse>(`/api/users/${id}`, { method: "DELETE" }),
    
  bulkDeleteUsers: (ids: number[]) => 
    request<BaseResponse>("/api/users/bulk-delete", { 
      method: "POST", 
      body: JSON.stringify(ids) 
    }),

  // Contacts
  listContacts: (deviceId: number) =>
    request<Contact[]>(`/api/contacts?device_id=${deviceId}`),
    
  createContact: (data: CreateContactDto) => 
    request<Contact>("/api/contacts", { method: "POST", body: JSON.stringify(data) }),
    
  deleteContact: (id: number) => request<void>(`/api/contacts/${id}`, { method: "DELETE" }),  
};

export const atApi = {
  listPorts: () => request<SerialPort[]>("/api/at/ports"),
  listTemplates: () => request<AtTemplate[]>("/api/at/templates"),
  
  getHistory: (deviceId?: number, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (deviceId !== undefined) params.set("device_id", String(deviceId));
    return request<AtLogEntry[]>(`/api/at/history?${params}`);
  },
  
  saveHistory: (data: SaveAtHistoryDto) => 
    request<AtLogEntry>("/api/at/history", { method: "POST", body: JSON.stringify(data) }),
    
  remoteCommand: (imei: string, command: string) =>
    request<RemoteCommandResponse>(
      "/api/at/remote",
      { method: "POST", body: JSON.stringify({ imei, command }) },
    ),
    
  wsUrl: () => {
    const token = getToken();
    const base = WS_URL.replace(/^http/, "ws");
    return `${base}/api/at/ws${token ? `?token=${token}` : ""}`;
  },
};

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}