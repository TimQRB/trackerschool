import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

function isEmulator(): boolean {
  return Platform.OS === 'android' && !Device.isDevice;
}

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  const hostUri = (Constants.expoConfig as any)?.hostUri;

  // On Android emulator, 10.0.2.2 is the only way to reach host
  if (isEmulator()) {
    return 'http://10.0.2.2:8080';
  }

  // In Expo Go, hostUri is the LAN address the device is already connected to
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:8080`;
  }

  // Explicit env var override
  if (envUrl) return envUrl;

  return Platform.select({
    ios: 'http://localhost:8080',
    default: 'http://localhost:8080',
  });
}

const API_URL = resolveApiUrl();

function resolveWsUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_WS_URL;
  const hostUri = (Constants.expoConfig as any)?.hostUri;

  if (isEmulator()) {
    return 'ws://10.0.2.2:8080';
  }

  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `ws://${host}:8080`;
  }

  if (envUrl) return envUrl;

  return Platform.select({
    ios: 'ws://localhost:8080',
    default: 'ws://localhost:8080',
  });
}

export const WS_URL = resolveWsUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

let _token: string | null = null;

export function setToken(token: string | null) {
  _token = token;
}

export function getToken(): string | null {
  return _token;
}

api.interceptors.request.use((config) => {
  if (_token) {
    config.headers.Authorization = `Bearer ${_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      _token = null;
    }
    return Promise.reject(error);
  },
);

export { api, API_URL };
