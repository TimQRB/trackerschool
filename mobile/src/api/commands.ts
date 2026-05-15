import { api } from './client';

interface BatchResult {
  device_id: number;
  imei: string;
  student_id: number;
  sent: boolean;
}

interface BatchResponse {
  ok: boolean;
  results: BatchResult[];
}

export async function batchCommand(
  studentIds: number[],
  command: string,
  payload: any = {},
): Promise<BatchResponse> {
  const res = await api.post<BatchResponse>('/api/commands/batch', {
    student_ids: studentIds,
    command,
    payload,
  });
  return res.data;
}
