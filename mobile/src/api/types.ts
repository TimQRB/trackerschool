export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'parent' | 'school' | 'admin';
}

export interface Device {
  id: number;
  identifier: string;
  imei: string | null;
  dev_type: string | null;
  model_name: string | null;
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
  zone_type: 'school' | 'home' | 'route';
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

export interface TrackEvent {
  id: number;
  student_id: number;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
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
  contact_type: 'family' | 'sos' | 'whitelist';
  number: string;
  display_name: string;
  serial_no: number;
}

export interface WSMessage {
  type: 'location' | 'event' | 'ping';
  payload: any;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
  full_name: string;
  user_id: number;
}
