import { api } from './client';

export interface HealthRecord {
  id: number;
  device_id: number;
  heart_rate: number | null;
  spo2: number | null;
  steps: number | null;
  recorded_at: string;
}

export async function getHealth(studentId: number, date?: string): Promise<HealthRecord[]> {
  const params = date ? `?date=${date}` : '';
  const res = await api.get<HealthRecord[]>(`/api/students/${studentId}/health${params}`);
  return res.data;
}
