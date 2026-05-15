import { api } from './client';
import type { TrackEvent } from './types';

export async function listEvents(hours = 24, onlyUnack = false): Promise<TrackEvent[]> {
  const res = await api.get<TrackEvent[]>(`/api/events?hours=${hours}&only_unack=${onlyUnack}`);
  return res.data;
}

export async function ackEvent(id: number): Promise<TrackEvent> {
  const res = await api.post<TrackEvent>(`/api/events/${id}/ack`);
  return res.data;
}
