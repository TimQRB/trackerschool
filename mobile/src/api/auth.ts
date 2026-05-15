import { api } from './client';
import type { LoginResponse, User } from './types';

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/api/auth/login', { email, password });
  return res.data;
}

export async function me(): Promise<User> {
  const res = await api.get<User>('/api/auth/me');
  return res.data;
}
