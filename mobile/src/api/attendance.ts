import { api } from './client';

export interface AttendanceRecord {
  student_id: number;
  full_name: string;
  class_name: string;
  date: string;
  enter_time: string | null;
  exit_time: string | null;
  status: string;
}

export async function getClassAttendance(
  className?: string,
  date?: string,
): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams();
  if (className) params.append('class_name', className);
  if (date) params.append('date', date);
  const qs = params.toString();
  const res = await api.get<AttendanceRecord[]>(`/api/attendance/class${qs ? `?${qs}` : ''}`);
  return res.data;
}

export async function markAttendance(data: {
  student_id: number;
  date: string;
  status: string;
  enter_time?: string;
  exit_time?: string;
}): Promise<void> {
  await api.post('/api/attendance/mark', data);
}
