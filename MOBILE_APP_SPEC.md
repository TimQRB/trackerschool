# SafeMektep — Mobile Application Specification

> Полная спецификация для создания мобильного приложения (React Native).
> Все эндпоинты, модели данных, WebSocket-протокол и архитектура бэкенда.
> Создано на основе существующего проекта `trackerschool`.

---

## 1. Стек технологий

### Мобильное приложение
| Компонент | Технология |
|---|---|
| Framework | **React Native 0.76+** (Expo managed workflow) |
| Навигация | `@react-navigation/native` + `bottom-tabs` + `native-stack` |
| Карта | `react-native-maps` (Google Maps на Android, Apple Maps на iOS) |
| HTTP | `axios` (с JWT-интерцептором) |
| WebSocket | Нативный `WebSocket` (встроен в RN) |
| Push | `expo-notifications` (FCM через Expo) |
| Хранилище токена | `expo-secure-store` |
| Локация | `expo-location` (для будущего использования родителем) |

### Бэкенд (уже существует)
| Компонент | Технология |
|---|---|
| API | FastAPI 0.115 (Python 3.12) |
| База данных | PostgreSQL 16 + PostGIS 3.4 |
| Кеш/Команды | Redis 7 (Pub/Sub для gateway) |
| Real-time | WebSocket (in-process pub/sub) |
| JWT | python-jose + bcrypt |

---

## 2. Архитектура системы

```
┌─────────────────────────────────────────────────────┐
│                   Mobile App (React Native)          │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐   │
│  │ Auth      │ │ Map      │ │ Settings / Contacts │   │
│  │ Screens   │ │ Screens  │ │ Screens            │   │
│  └─────┬─────┘ └────┬─────┘ └─────────┬──────────┘   │
│        │            │                 │              │
│  ┌─────┴────────────┴─────────────────┴──────────┐   │
│  │         API Client (axios + JWT)               │   │
│  │         WebSocket Hook (useLiveBus)             │   │
│  └─────────────────────┬──────────────────────────┘   │
└────────────────────────┼──────────────────────────────┘
                         │
              HTTPS / WSS │
                         │
┌────────────────────────┼──────────────────────────────┐
│  Backend (FastAPI)    │                              │
│  ┌────────────────────┴──────────────────────────┐   │
│  │  REST API (port 8000) │ WebSocket (/ws)        │   │
│  └────────────────────┬──────────────────────────┘   │
│                       │                              │
│  ┌────────────────────┴──────────────────────────┐   │
│  │  PostgreSQL + PostGIS                          │   │
│  │  Redis (Pub/Sub)                               │   │
│  └────────────────────────────────────────────────┘   │
│                                                      │
│  ┌────────────────────────────────────────────────┐   │
│  │  TCP Gateway (port 13000/13001) ←→ HC02 Device │   │
│  └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Связь компонентов

```
Устройство (браслет) ←TCP→ Gateway ←Redis Pub/Sub→ Backend ←HTTP/WS→ Mobile App
                                                            ←FCM→ Mobile App (Push)
```

- **Браслет → Сервер**: TCP-пакеты (позиция, heartbeat, SOS) → Gateway парсит → пишет в БД → публикует в WebSocket
- **Сервер → Браслет**: REST-эндпоинт → Redis Pub/Sub → Gateway → TCP-пакет
- **Сервер → Мобильное приложение**: через WebSocket (live-обновления) и FCM (push-уведомления)
- **Мобильное приложение → Сервер**: через REST API (JWT-авторизация)

---

## 3. Аутентификация

### 3.1 Login

**`POST /api/auth/login`**

Request:
```json
{
  "email": "parent@safemektep.kz",
  "password": "parent123"
}
```

Response (200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "role": "parent",
  "full_name": "Айгуль Касымова",
  "user_id": 2
}
```

Error (401):
```json
{
  "detail": "Неверный email или пароль"
}
```

**Важно**: JWT живёт 7 дней (`jwt_expire_minutes = 10080`). После логина сохраняем `access_token` в SecureStore.

### 3.2 Get current user

**`GET /api/auth/me`**

Headers: `Authorization: Bearer <token>`

Response:
```json
{
  "id": 2,
  "email": "parent@safemektep.kz",
  "full_name": "Айгуль Касымова",
  "role": "parent"
}
```

### 3.3 JWT Payload

```json
{
  "sub": "2",
  "role": "parent",
  "exp": 1700000000
}
```

JWT передаётся:
- в REST: `Authorization: Bearer <token>`
- в WebSocket: `ws://host/ws?token=<token>`

### 3.4 Регистрация нового пользователя

Через админку (роль admin/school) — **`POST /api/users`**:
```json
{
  "email": "newparent@mail.com",
  "password": "securepass",
  "full_name": "Имя Фамилия",
  "role": "parent"
}
```

**Для мобильного приложения нужно будет добавить self-registration эндпоинт** (см. секцию 11 "Что нужно добавить на бэкенд").

---

## 4. Полная API-спецификация

### 4.1 Ученики (Students)

#### `GET /api/students`
Роль: parent, school, admin
- Parent видит только своих детей
- School/admin видят всех

Response:
```json
[
  {
    "id": 1,
    "full_name": "Ержан Касымов",
    "class_name": "5А",
    "parent_id": 2,
    "device": {
      "id": 1,
      "identifier": "DEMO-001",
      "student_id": 1,
      "api_key": "...",
      "last_seen_at": "2025-01-15T10:30:00Z",
      "last_battery": 85,
      "is_active": true
    }
  }
]
```

#### `POST /api/students` (admin/school only)
```json
{
  "full_name": "Новый Ученик",
  "class_name": "5А",
  "parent_id": 2
}
```

### 4.2 Локация (Location)

#### `POST /api/ingest/location` (device ingest)
Headers: `X-API-Key: <device_api_key>`

```json
{
  "lat": 43.2390,
  "lon": 76.9290,
  "accuracy": 8.0,
  "speed": 1.2,
  "battery": 85,
  "sos": false
}
```

Response:
```json
{
  "ok": true,
  "events_created": 0
}
```

**Важно для мобильного приложения**: этот эндпоинт НЕ вызывается из приложения. Это эндпоинт для самих устройств (браслетов) — они шлют координаты POST-запросами на `/api/ingest/location` с API-ключом в заголовке.

**Для получения локации учеников приложение использует:**

#### `GET /api/students/{student_id}/last-location`
Response:
```json
{
  "id": 1234,
  "device_id": 1,
  "lat": 43.2390,
  "lon": 76.9290,
  "battery": 85,
  "speed": 1.2,
  "recorded_at": "2025-01-15T10:30:00+00:00"
}
```
или `null`, если данных нет.

#### `GET /api/students/{student_id}/track?hours=24`
Response: `[...LocationPoint]`

Параметры:
- `hours` — от 1 до 168 (7 дней), default 24
- Точки возвращаются от более старых к новым (`ORDER BY recorded_at ASC`)

```json
[
  {
    "id": 1234,
    "device_id": 1,
    "lat": 43.2310,
    "lon": 76.9190,
    "battery": 95,
    "speed": null,
    "recorded_at": "2025-01-15T08:00:00+00:00"
  }
]
```

### 4.3 Геофенсы (Geofences)

#### `GET /api/geofences`
Response:
```json
[
  {
    "id": 1,
    "name": "Школа №42",
    "zone_type": "school",
    "student_id": null,
    "coordinates": [
      [76.9280, 43.2380],
      [76.9300, 43.2380],
      [76.9300, 43.2400],
      [76.9280, 43.2400],
      [76.9280, 43.2380]
    ]
  }
]
```
- `coordinates` — GeoJSON-like: `[lon, lat]`
- Если `student_id === null` — глобальная зона (для всех учеников)

#### `POST /api/geofences` (admin/school only)
```json
{
  "name": "Новая зона",
  "zone_type": "school",
  "coordinates": [
    [76.9280, 43.2380],
    [76.9300, 43.2380],
    [76.9300, 43.2400],
    [76.9280, 43.2400],
    [76.9280, 43.2380]
  ],
  "student_id": null
}
```

#### `DELETE /api/geofences/{id}` (admin/school only)

### 4.4 События (Events)

#### `GET /api/events?hours=24&only_unack=false`
Response:
```json
[
  {
    "id": 1,
    "student_id": 1,
    "event_type": "enter_zone",
    "severity": "info",
    "geofence_id": 1,
    "message": "Ержан Касымов вошёл в зону «Школа №42»",
    "lat": 43.2390,
    "lon": 76.9290,
    "acknowledged": false,
    "created_at": "2025-01-15T09:00:00+00:00"
  }
]
```

`event_type` может быть: `enter_zone`, `exit_zone`, `sos`, `low_battery`, `lost_signal`

`severity`: `info`, `warning`, `critical`

#### `POST /api/events/{id}/ack` (school/admin only)
Отметить событие как обработанное.

### 4.5 Устройства (Devices)

#### `GET /api/devices` (admin/school only)
Список всех устройств.

#### `POST /api/devices/{id}/locate-now`
Запросить немедленную локацию у устройства (шлёт команду через gateway).

Response:
```json
{
  "ok": true,
  "task_id": "loc-1705312345678"
}
```
Если устройство офлайн:
```json
{
  "ok": false,
  "reason": "Устройство сейчас не на связи",
  "task_id": "loc-..."
}
```

#### `POST /api/devices/{device_id}/assign/{student_id}` (admin only)

### 4.6 Контакты (Contacts)

#### `GET /api/contacts?device_id=1` (admin/school only)
```json
[
  {
    "id": 1,
    "device_id": 1,
    "contact_type": "family",
    "number": "+77011234567",
    "display_name": "Мама",
    "serial_no": 1
  }
]
```

`contact_type`: `family` (быстрый вызов), `sos` (SOS-номера), `whitelist` (белый список)

#### `POST /api/contacts` (admin/school only)
Добавление номера (автоматически пушится на устройство через gateway):
```json
{
  "device_id": 1,
  "contact_type": "family",
  "number": "+77011234567",
  "display_name": "Мама",
  "serial_no": 1
}
```

Лимиты:
- `family`: макс 3
- `sos`: макс 3
- `whitelist`: макс 20

#### `DELETE /api/contacts/{id}` (admin/school only)

### 4.7 Пользователи (Users) — admin only

#### `GET /api/users`
#### `POST /api/users`
```json
{
  "email": "user@mail.com",
  "password": "password123",
  "full_name": "Имя Фамилия",
  "role": "parent"
}
```

### 4.8 Boot Config (HC02 Device)

**`POST /getDevParam`** — эндпоинт без аутентификации (по IMEI). Вызывается самим браслетом при включении.

Запрос:
```json
{
  "identity": "865687062604820",
  "type": "2"
}
```
`type`: `2` — whitelist, `3` — classroom mode, `5` — family numbers, `6` — SOS numbers

### 4.9 Health

**`GET /api/health`**
```json
{
  "status": "ok"
}
```

### 4.10 Push Notifications (NOVO! Добавлено)

#### `POST /api/notifications/register-fcm`
Регистрация FCM-токена устройства для push-уведомлений.

Заголовки: `Authorization: Bearer <token>`
```json
{
  "fcm_token": "fM7Gx2k...",
  "platform": "android"
}
```
Response: `{"ok": true}`

#### `DELETE /api/notifications/unregister-fcm`
Отмена регистрации push.

### 4.11 Attendance — Посещаемость (NOVO! Добавлено)

#### `GET /api/attendance/class?class_name=5А&date=2025-01-15`
Список учеников с временем входа/выхода за указанную дату.

Response:
```json
[
  {
    "student_id": 1,
    "full_name": "Ержан Касымов",
    "class_name": "5А",
    "date": "2025-01-15",
    "enter_time": "2025-01-15T08:15:00+00:00",
    "exit_time": null,
    "status": "present"
  }
]
```

#### `POST /api/attendance/mark` (school/admin only)
Ручная отметка посещаемости.
```json
{
  "student_id": 1,
  "date": "2025-01-15",
  "status": "present",
  "enter_time": "08:15",
  "exit_time": "16:30"
}
```

### 4.12 Batch Commands (NOVO! Добавлено)

#### `POST /api/commands/batch` (school/admin only)
Пакетная отправка команд на группу устройств.

```json
{
  "student_ids": [1, 2, 3],
  "command": "lesson_mode",
  "payload": {
    "swit": 1,
    "list": [{"week": "1", "timeList": [{"begTime": "0800", "endTime": "1600"}]}]
  }
}
```

| Команда | Protocol | Payload |
|---|---|---|
| `lesson_mode` | 0x03D7 | `{ swit: 1\|3, list: [{ week, timeList }] }` |
| `locate_now` | 0x03DD | `{}` |
| `set_gps_interval` | 0x03D1 | `{ posPeriod: "60" }` |
| `set_heart_rate_interval` | 0x110D | `{ heartRatePeriod: "60" }` |
| `set_sms_block` | 0x1015 | `{ interceptorMode: "1"\|"2"\|"3" }` |

Response:
```json
{
  "ok": true,
  "results": [
    { "device_id": 1, "imei": "865687062604820", "student_id": 1, "sent": true }
  ]
}
```

### 4.13 Health Records (NOVO! Добавлено)

#### `GET /api/students/{id}/health?date=2025-01-15`
Данные пульса, SpO2, шагов за дату.

Response:
```json
[
  {
    "id": 1,
    "device_id": 1,
    "heart_rate": 72,
    "spo2": 98.0,
    "steps": 10016,
    "recorded_at": "2025-01-15T10:00:00+00:00"
  }
]
```

---

## 5. WebSocket Протокол (Real-time)

### Подключение

```
ws://<host>:8000/ws?token=<JWT_TOKEN>
```

- JWT передаётся в query-параметре
- При невалидном токене — `4401` close
- Сервер шлёт `{"type":"ping"}` каждые 30 секунд (keepalive)
- Если не получать ping 30 сек — соединение закрывается

### Сообщения от сервера

#### 5.1 Location Update
```json
{
  "type": "location",
  "payload": {
    "student_id": 1,
    "student_name": "Ержан Касымов",
    "device_id": 1,
    "lat": 43.2390,
    "lon": 76.9290,
    "battery": 85,
    "speed": 1.2,
    "recorded_at": "2025-01-15T10:30:00.123456+00:00"
  }
}
```

#### 5.2 Event
```json
{
  "type": "event",
  "payload": {
    "id": 42,
    "student_id": 1,
    "student_name": "Ержан Касымов",
    "event_type": "sos",
    "severity": "critical",
    "message": "SOS! Ученик Ержан Касымов нажал тревожную кнопку",
    "lat": 43.2390,
    "lon": 76.9290,
    "created_at": "2025-01-15T10:31:00+00:00"
  }
}
```

#### 5.3 Ping (keepalive)
```json
{
  "type": "ping"
}
```

### Типы событий, которые приходят через WebSocket:

| event_type | severity | meaning |
|---|---|---|
| `enter_zone` | info/warning | Вошёл в геозону |
| `exit_zone` | info/warning | Вышел из геозоны |
| `sos` | critical | Тревожная кнопка |
| `low_battery` | warning | Заряд ≤ 15% |
| `power_on` | info | Устройство включено |
| `power_off` | warning | Устройство выключено |

### Reconnect logic

```typescript
// Псевдокод для реализации WebSocket хука
function useWebSocket(token: string, onMessage: (msg) => void) {
  let ws: WebSocket | null = null;
  let stopped = false;

  function connect() {
    ws = new WebSocket(`ws://HOST/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      if (!stopped) setTimeout(connect, 2000); // retry через 2 сек
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "ping") return;
      onMessage(msg);
    };
  }
  connect();
  return () => { stopped = true; ws?.close(); };
}
```

---

## 6. Модели данных (TypeScript)

```typescript
// Полные интерфейсы для мобильного приложения

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
  coordinates: number[][];  // GeoJSON: [lon, lat][]
}

export interface LocationPoint {
  id: number;
  device_id: number;
  lat: number;
  lon: number;
  battery: number | null;
  speed: number | null;
  recorded_at: string;  // ISO datetime
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

// WebSocket message
export interface WSMessage {
  type: 'location' | 'event' | 'ping';
  payload: any;
}

// Login
export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
  full_name: string;
  user_id: number;
}
```

---

## 7. Типы событий и цвета для UI

```typescript
const EVENT_LABELS: Record<string, string> = {
  enter_zone: 'Вход в зону',
  exit_zone: 'Выход из зоны',
  sos: 'SOS',
  low_battery: 'Низкий заряд',
  lost_signal: 'Потеря связи',
  power_on: 'Устройство включено',
  power_off: 'Устройство выключено',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',    // синий
  warning: '#f59e0b', // жёлтый
  critical: '#ef4444', // красный
};

const ZONE_COLORS: Record<string, string> = {
  school: '#3b82f6',  // синий
  home: '#22c55e',    // зелёный
  route: '#f59e0b',   // жёлтый
};
```

---

## 8. Адреса и порты (Docker/localhost)

| Сервис | Внутри Docker | Снаружи (localhost) |
|---|---|---|
| Backend API | `backend:8000` | `localhost:8080` |
| WebSocket | `backend:8000/ws` | `localhost:8080/ws` |
| Frontend | `frontend:5173` | `localhost:5173` |
| PostgreSQL | `db:5432` | `localhost:5432` |
| Redis | `redis:6379` | `localhost:6379` |
| Gateway Reg | `gateway:13000` | `localhost:13000` |
| Gateway Svc | `gateway:13001` | `localhost:13001` |

---

## 9. Навигация и структура экранов

### 9.1 Auth Stack (нe залогинен)

```
AuthStack (NativeStackNavigator)
├── LoginScreen
├── RegisterScreen         # (нужно добавить)
└── BindDeviceScreen       # (нужно добавить — привязка IMEI)
```

### 9.2 Main Tabs (залогинен — родитель)

```
MainTabs (BottomTabNavigator)
├── 📍 Карта (MapTab)
│   └── MapScreen
│       ├── Карта с маркером ребёнка
│       ├── Bottom sheet: батарея, статус, last seen
│       └── Кнопка "Найти сейчас"
│
├── 📋 События (EventsTab)
│   └── EventsScreen
│       ├── Лента событий (цветные карточки)
│       └── Pull-to-refresh
│
├── ❤️ Здоровье (HealthTab)          # если браслет шлёт
│   └── HealthScreen
│       ├── Шаги (прогресс-бар)
│       ├── Пульс (график)
│       └── SpO2
│
├── 👨‍👩‍👧 Семья (ContactsTab)
│   └── ContactsScreen
│       ├── Быстрые номера (1-3)
│       ├── SOS номера (1-3)
│       └── Белый список (до 20)
│
└── ⚙️ Настройки (SettingsTab)
    └── SettingsScreen
        ├── Режим урока (расписание)
        ├── Интервал GPS
        ├── Интервал пульса
        └── Блокировка SMS
```

### 9.3 School Tabs (залогинен — школа)

```
SchoolTabs (BottomTabNavigator)
├── 📍 Карта (ClassMapTab)
│   └── ClassMapScreen
│       ├── Все ученики класса на карте
│       └── Фильтр по классу
│
├── 📋 Посещаемость (AttendanceTab)
│   └── AttendanceScreen
│       ├── Список учеников
│       ├── Время прихода
│       └── Статус (здесь/нет)
│
├── 📢 Команды (BatchTab)
│   └── BatchCommandsScreen
│       ├── "Включить режим урока"
│       └── Отправить команду всему классу
│
└── 📋 События (EventsTab)
    └── EventsScreen (те же события, но для всех учеников)
```

### 9.4 Modal Screens (поверх всего)

```
ModalStack
├── SOSAlertScreen
│   └── Полноэкранная тревога
│       ├── Имя ученика
│       ├── Координаты на карте
│       ├── Кнопка "Позвонить"
│       └── Кнопка "Подтвердить" (acknowledge)
│
└── StudentDetailScreen
    └── Детальная информация об ученике
        ├── Трек за день (маршрут)
        ├── Статистика
        └── История событий
```

---

## 10. Push-уведомления (FCM)

### 10.1 Что нужно добавить на бэкенд для push

Создать файл `backend/app/routers/notifications.py`:

```python
"""
Push notifications router + FCM integration.
"""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..security import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# --- Модель для FCM токена в БД ---
# Нужно добавить таблицу device_tokens или поле fcm_token в users
# class User(Base):
#     fcm_token: Mapped[str | None] = mapped_column(String(512), nullable=True)

class FCMTokenRequest(BaseModel):
    fcm_token: str
    platform: str  # 'ios' | 'android'

@router.post("/register-fcm")
def register_fcm(
    payload: FCMTokenRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    """Сохраняет FCM-токен устройства для push-уведомлений."""
    user.fcm_token = payload.fcm_token  # добавить поле в модель
    db.commit()
    return {"ok": True}

@router.delete("/unregister-fcm")
def unregister_fcm(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    user.fcm_token = None
    db.commit()
    return {"ok": True}
```

### 10.2 Модель уведомлений

Создать файл `backend/app/notify.py`:

```python
"""
Firebase Cloud Messaging sender.
Установить: pip install firebase-admin
"""
import firebase_admin
from firebase_admin import credentials, messaging
from sqlalchemy import select
from .database import SessionLocal
from .models import User

# Инициализация (при запуске)
# cred = credentials.Certificate("path/to/serviceAccountKey.json")
# firebase_admin.initialize_app(cred)

def send_push(user_id: int, title: str, body: str, data: dict | None = None):
    """Отправить push-уведомление пользователю."""
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user or not user.fcm_token:
            return
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=user.fcm_token,
        )
        messaging.send(message)
    finally:
        db.close()
```

### 10.3 Типы push-уведомлений

| Событие | Тайтл | Body | Data | Кому |
|---|---|---|---|---|
| SOS | 🆘 SOS! | [Имя] нажал тревожную кнопку | `{type: "sos", student_id, lat, lon}` | Родитель |
| Enter zone | 📍 Вход в зону | [Имя] вошёл в [название] | `{type: "geofence", student_id}` | Родитель |
| Exit zone | 📍 Выход из зоны | [Имя] вышел из [название] | `{type: "geofence", student_id}` | Родитель |
| Low battery | 🔋 Низкий заряд | У [Имя] заряд [X]% | `{type: "low_battery", student_id, battery}` | Родитель |
| Device offline | 📡 Потеря связи | [Имя] не выходит на связь | `{type: "offline", student_id}` | Родитель |

### 10.4 Обработка push на мобильном

```typescript
// hooks/useNotifications.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: 'your-expo-project-id', // из app.json
  });

  // Отправляем на бэкенд
  await api.registerFCM(token.data, Platform.OS);
  return token.data;
}

// Обработка получения push (когда приложение открыто)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Ответ на нажатие на уведомление
Notifications.addNotificationResponseReceivedListener(response => {
  const data = response.notification.request.content.data;
  if (data.type === 'sos') {
    navigation.navigate('SOSAlert', { studentId: data.student_id, lat: data.lat, lon: data.lon });
  }
});
```

---

## 11. ✅ Что уже добавлено на бэкенд

> Все перечисленные ниже модули **уже реализованы** в коде.

### 11.1 Push-уведомления ✅

Файлы:
- `backend/app/routers/notifications.py` — `POST /api/notifications/register-fcm`, `DELETE /api/notifications/unregister-fcm`
- `backend/app/notify.py` — FCM sender (send_push, send_push_to_parents)
- `backend/app/models.py` — поле `User.fcm_token`

Интеграция:
- В `locations.py` — вызов `send_push_to_parents()` при SOS, enter/exit zone, low battery
- В `gateway/main.py` — вызов `send_push_to_parents()` при тех же событиях от TCP-устройства

### 11.2 Health records ✅

Таблица `health_records`:
- `id`, `device_id` (FK), `heart_rate`, `spo2`, `steps`, `recorded_at`

Приём данных:
- `gateway/main.py` — `_handle_heart_rate()` (протокол 0x105E) и `_handle_blood_oxygen()` (протокол 0x1063)
- Автоматически сохраняются при получении пакетов от браслета

Эндпоинт:
- `GET /api/students/{id}/health?date=YYYY-MM-DD`

### 11.3 Attendance (посещаемость) ✅

Таблица `attendance_logs`:
- `id`, `student_id` (FK), `date`, `enter_time`, `exit_time`, `status`

Эндпоинты:
- `GET /api/attendance/class?class_name=5А&date=YYYY-MM-DD`
- `POST /api/attendance/mark` — ручная отметка (school/admin)

### 11.4 Batch commands ✅

Эндпоинт:
- `POST /api/commands/batch` — пакетная отправка команд

Поддерживаемые команды: `lesson_mode`, `locate_now`, `set_gps_interval`, `set_heart_rate_interval`, `set_sms_block`

### 11.5 Device call log ✅

Таблица `call_logs`:
- `id`, `device_id` (FK), `number`, `direction`, `duration`, `called_at`

Приём:
- `gateway/main.py` — `_handle_call_log()` (протокол 0x0312)
- Автоматически сохраняется при получении от браслета

### 11.6 Registration endpoint (TODO)

```python
# backend/app/routers/auth.py — добавить
@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session):
    """Самостоятельная регистрация родителя."""
```
Это единственное, что осталось не реализованным.

---

## 12. Настройки устройства

### 12.1 Режим урока (Classroom mode)

Хранить в новой таблице `device_classroom_schedules`:
```python
class ClassroomSchedule(Base):
    __tablename__ = "classroom_schedules"
    id: int
    device_id: int (FK)
    day_of_week: int  # 0=Mon … 6=Sun
    start_time: str   # "08:00"
    end_time: str     # "16:00"
```

Эндпоинт `POST /getDevParam?type=3` уже отдаёт `timeList` и `swit`.

Эндпоинты для мобилки:
- `GET /api/devices/{id}/classroom-schedule`
- `PUT /api/devices/{id}/classroom-schedule`

### 12.2 Интервал GPS

Команда на устройство: протокол 0x03D1 (`P_SET_POS_PERIOD`).

Эндпоинт: `POST /api/devices/{id}/settings`
```json
{
  "gps_interval_sec": 60,
  "heartbeat_interval_min": 10,
  "heart_rate_interval_min": 30
}
```

### 12.3 Блокировка SMS

Команда на браслет (зависит от модели HC02).

---

## 13. Детальный план экранов

### 13.1 LoginScreen

- Поле email
- Поле пароль
- Кнопка "Войти"
- Ссылка "Зарегистрироваться" (на RegisterScreen)
- При успехе: сохраняем token в SecureStore, переходим на Main
- При ошибке: показываем "Неверный email или пароль"

### 13.2 MapScreen (главный экран)

```
┌──────────────────────────────┐
│ 🔋 85%  📍 Онлайн  15:30     │ ← TopBar
├──────────────────────────────┤
│                              │
│        Карта (react-native-maps)
│   [Маркер ребёнка]           │
│   [Полигон школы]            │
│   [Полигон дома]             │
│   [Трек за сегодня]          │
│                              │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ 👤 Ержан Касымов       ● │ │ ← Bottom sheet
│ │ 📍 Обновлено: 15:30     │ │
│ │ 🔋 Заряд: 85%           │ │
│ │ 📱 Найти сейчас [→]     │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Реализация:**
- `react-native-maps` с `MapView`, `Marker`, `Polygon`, `Polyline`
- Маркер ребёнка — кастомный с именем
- Полигоны геофенсов — полупрозрачные
- Полилиния трека — пунктирная (dashed)
- Кнопка центрирования на ребёнка
- Нижняя панель (Bottom Sheet) с информацией

**WebSocket: при получении `location` — плавно двигаем маркер.**

### 13.3 EventsScreen

```
┌──────────────────────────────┐
│ ← События                    │
├──────────────────────────────┤
│ 🔴 SOS!                    │ │ ← critical
│ Ержан нажал тревожную кнопку│
│ 15:30                        │
├──────────────────────────────┤
│ 🟡 Выход из зоны           │ │ ← warning
│ Ержан вышел из зоны "Дом"   │
│ 14:15                        │
├──────────────────────────────┤
│ 🔵 Вход в зону             │ │ ← info
│ Ержан вошёл в зону "Школа"  │
│ 08:30                        │
└──────────────────────────────┘
```

- Цветная полоска слева (красный/жёлтый/синий)
- Pull-to-refresh
- Кнопка "Показать на карте" (если есть координаты)
- Фильтр: все / SOS / геозоны / батарея

### 13.4 SOSAlertScreen (MODAL — поверх всего)

```
┌──────────────────────────────┐
│ 🆘 SOS! ТРЕВОГА              │ ← Красный фон
│                              │
│  Ержан Касымов               │
│  Класс: 5А                   │
│                              │
│  📍 Координаты:              │
│  43.2390, 76.9290            │
│                              │
│  ┌────────────────────┐      │
│  │  Маленькая карта    │     │
│  └────────────────────┘      │
│                              │
│  [📞 Позвонить ребёнку]      │
│  [✅ Подтвердить]            │ ← Acknowledge
│  [✕ Закрыть]                 │
└──────────────────────────────┘
```

- Показывается при получении push с типом `sos`
- Воспроизводит звук тревоги
- Не закрывается без явного действия (кроме кнопки "Подтвердить")
- При нажатии "Позвонить" — открывает системный dialer с номером браслета

### 13.5 HealthScreen

```
┌──────────────────────────────┐
│ ❤️ Здоровье                  │
├──────────────────────────────┤
│                              │
│ Шаги: 6 430 / 10 000        │
│ ██████████░░░░░░░ 64%       │
│                              │
│ Пульс: 72 уд/мин            │
│ ┌─┐                          │
│ │ │  График за день          │
│ └─┘                          │
│                              │
│ SpO₂: 98%                    │
│ Норма: 95-100%               │
│                              │
│ Последнее обновление: 15:30  │
└──────────────────────────────┘
```

### 13.6 ContactsScreen

```
┌──────────────────────────────┐
│ ← Контакты                   │
├──────────────────────────────┤
│ 📞 Быстрый вызов (1-3)       │
│  Мама: +7 701 123 45 67     │
│  Папа: +7 702 234 56 78     │
│                              │
│ 🆘 SOS (1-3)                 │
│  Бабушка: +7 705 345 67 89  │
│                              │
│ 📋 Белый список (до 20)      │
│  +7 707 456 78 90           │
│  +7 708 567 89 01           │
└──────────────────────────────┘
```

- Только просмотр (редактирование через админку школы)
- Кнопка "Позвонить" рядом с каждым номером (через `Linking.openURL('tel:...')`)

### 13.7 SettingsScreen

```
┌──────────────────────────────┐
│ ← Настройки браслета         │
├──────────────────────────────┤
│ 📚 Режим урока              │
│  Пн-Пт: 08:00-16:00         │
│  [Настроить →]              │
│                              │
│ 📡 Интервал GPS             │
│  Каждые 60 секунд           │
│  [Изменить]                  │
│                              │
│ ❤️ Интервал пульса          │
│  Каждые 30 минут            │
│  [Изменить]                  │
│                              │
│ 🔇 Блокировка SMS           │
│  Включено                   │
│  [Изменить]                  │
│                              │
│ ─────────────────────────    │
│ 📱 Информация об устройстве  │
│  Модель: HC02               │
│  IMEI: 865687062604820      │
│  Версия: 1032               │
└──────────────────────────────┘
```

### 13.8 ClassMapScreen (школьная роль)

```
┌──────────────────────────────┐
│ 🏫 5А класс — 28 учеников   │
├──────────────────────────────┤
│                              │
│   [Все маркеры учеников]     │
│   [Каждый — кружок с +/--]  │
│   [Зелёный = онлайн]         │
│   [Серый = офлайн]           │
│                              │
│ Легенда:                     │
│ ● 20 онлайн                  │
| ○ 8 офлайн                   │
└──────────────────────────────┘
```

### 13.9 AttendanceScreen (школьная роль)

```
┌──────────────────────────────┐
│ ← Посещаемость  15.01.2025   │
├──────────────────────────────┤
│ ✅ Присутствует: 25          │
│ ❌ Отсутствует: 3            │
│                              │
│ ┌────────────────────────┬──┐│
│ │ Ержан Касымов          │✅││
│ │ Пришёл: 08:15          │  ││
│ ├────────────────────────┼──┤│
│ │ Алия Нургалиева        │✅││
│ │ Пришла: 08:05          │  ││
│ ├────────────────────────┼──┤│
│ │ Руслан Ахметов         │❌││
│ │ Не пришёл              │  ││
│ └────────────────────────┴──┘│
└──────────────────────────────┘
```

---

## 14. Обработка состояний загрузки и ошибок

Каждый экран должен обрабатывать:

```typescript
// Паттерн для всех экранов
type ScreenState<T> = 
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: T }
  | { status: 'empty' };

// Пример использования
function MapScreen() {
  const [students, setStudents] = useState<ScreenState<Student[]>>({ status: 'loading' });

  useEffect(() => {
    loadStudents();
  }, []);

  if (students.status === 'loading') return <LoadingIndicator />;
  if (students.status === 'error') return <ErrorView message={students.error} onRetry={loadStudents} />;
  if (students.status === 'empty') return <EmptyView message="Нет учеников" />;
  
  // render map
}
```

---

## 15. Интеграция с картой

### 15.1 react-native-maps — основные компоненты

```typescript
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';

<MapView
  ref={mapRef}
  initialRegion={{
    latitude: 43.238,
    longitude: 76.9,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }}
>
  {/* Маркер ученика */}
  <Marker
    coordinate={{ latitude: point.lat, longitude: point.lon }}
    title={student.full_name}
    description={`Заряд: ${point.battery}%`}
  >
    <CustomMarkerComponent />
  </Marker>

  {/* Полигон геофенса */}
  <Polygon
    coordinates={coordinates.map(c => ({ latitude: c[1], longitude: c[0] }))}
    fillColor="rgba(59, 130, 246, 0.15)"
    strokeColor="#3b82f6"
    strokeWidth={2}
  />

  {/* Трек */}
  <Polyline
    coordinates={track.map(p => ({ latitude: p.lat, longitude: p.lon }))}
    strokeColor="#6366f1"
    strokeWidth={2}
    lineDashPattern={[4, 6]}
  />
</MapView>
```

### 15.2 Обновление маркера из WebSocket

```typescript
// При получении location через WebSocket — анимируем маркер
useEffect(() => {
  if (!markerRef.current || !newPoint) return;
  markerRef.current.animateToCoordinate({
    latitude: newPoint.lat,
    longitude: newPoint.lon,
  }, { duration: 1000 });
}, [newPoint]);
```

---

## 16. Пакет для Expo (зависимости)

```bash
npx create-expo-app@latest safemektep-mobile --template blank-typescript

cd safemektep-mobile

# Навигация
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context

# Карта
npx expo install react-native-maps

# Push-уведомления
npx expo install expo-notifications expo-device

# HTTP клиент
npx expo install axios

# Secure storage для JWT
npx expo install expo-secure-store

# Location (для определения местоположения родителя)
npx expo install expo-location

# Shared Element Transition (опционально)
npx expo install react-native-reanimated

# Анимации
npx expo install react-native-gesture-handler
```

---

## 17. API Client (TypeScript)

```typescript
// src/api/client.ts
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:8080';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// JWT interceptor
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 handler
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('token');
      // redirect to login
    }
    return Promise.reject(error);
  }
);

export { api, API_URL, WS_URL };
```

Полный список методов API — см. в `frontend/src/api.ts` существующего проекта. Все методы HTTP (не WS) повторяют те же эндпоинты.

---

## 18. Структура файлов мобильного приложения

```
safemektep-mobile/
├── app.json
├── App.tsx                           # Корневой компонент, навигация
├── tsconfig.json
├── package.json
├── src/
│   ├── api/
│   │   ├── client.ts                 # axios instance + JWT interceptor
│   │   ├── auth.ts                   # login, register, me
│   │   ├── students.ts               # listStudents, etc.
│   │   ├── locations.ts              # track, lastLocation
│   │   ├── events.ts                 # listEvents, ackEvent
│   │   ├── geofences.ts              # listGeofences, createGeofence
│   │   ├── devices.ts                # listDevices, locateNow
│   │   ├── contacts.ts               # listContacts
│   │   └── types.ts                  # Все интерфейсы
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts           # WebSocket с auto-reconnect
│   │   ├── useNotifications.ts       # FCM регистрация + обработка
│   │   └── useAuth.ts                # Auth state management
│   │
│   ├── navigation/
│   │   ├── AuthStack.tsx             # Login / Register
│   │   ├── ParentTabs.tsx            # Bottom tabs для родителя
│   │   ├── SchoolTabs.tsx            # Bottom tabs для школы
│   │   └── RootNavigator.tsx         # Auth check → нужный стек
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── BindDeviceScreen.tsx
│   │   ├── parent/
│   │   │   ├── MapScreen.tsx
│   │   │   ├── EventsScreen.tsx
│   │   │   ├── HealthScreen.tsx
│   │   │   ├── ContactsScreen.tsx
│   │   │   └── SettingsScreen.tsx
│   │   ├── school/
│   │   │   ├── ClassMapScreen.tsx
│   │   │   ├── AttendanceScreen.tsx
│   │   │   └── BatchCommandsScreen.tsx
│   │   └── sos/
│   │       ├── SOSAlertScreen.tsx
│   │       └── SOSHistoryScreen.tsx
│   │
│   ├── components/
│   │   ├── StudentMarker.tsx          # Кастомный маркер на карте
│   │   ├── GeofencePolygon.tsx        # Полигон геофенса
│   │   ├── RoutePolyline.tsx          # Трек маршрута
│   │   ├── EventCard.tsx              # Карточка события
│   │   ├── BatteryIndicator.tsx       # Индикатор батареи
│   │   ├── LoadingIndicator.tsx       # Спиннер загрузки
│   │   ├── ErrorView.tsx              # Экран ошибки с retry
│   │   └── EmptyView.tsx              # Пустое состояние
│   │
│   ├── context/
│   │   ├── AuthContext.tsx            # Контекст аутентификации
│   │   └── LiveContext.tsx            # WebSocket state
│   │
│   └── utils/
│       ├── formatDate.ts              # Форматирование дат
│       ├── mapHelpers.ts              # Преобразование координат
│       └── notifications.ts           # FCM handlers
```

---

## 19. Важные моменты для реализации

### 19.1 Роли и права доступа

```typescript
// В зависимости от роли пользователя — показываем разные табы
function RootNavigator() {
  const { user } = useAuth();

  if (!user) return <AuthStack />;
  if (user.role === 'parent') return <ParentTabs />;
  if (user.role === 'school') return <SchoolTabs />;
  if (user.role === 'admin') return <SchoolTabs />; // admin видит то же что школа
}
```

- **Parent**: видит ТОЛЬКО своих детей, только свои геофенсы, только события своих детей
- **School**: видит всех учеников, все геофенсы, все события, может подтверждать события
- **Admin**: то же что школа + управление пользователями/устройствами

### 19.2 Получение локации — не через мобильный GPS

Важно: **приложение не запрашивает GPS телефона**. Локация берётся:
1. REST: `GET /api/students/{id}/last-location` при начальной загрузке
2. WebSocket: `location` сообщения в реальном времени
3. REST: `GET /api/students/{id}/track` для истории

### 19.3 Формат координат

- **REST API (Geofence)**: `[lon, lat]` — GeoJSON стандарт
- **REST API (LocationPoint)**: отдельные поля `lat` и `lon`
- **react-native-maps**: `{ latitude, longitude }` — стандарт RN
- **Leaflet (веб)**: `[lat, lon]` — обратный порядок

Всегда преобразовывать:
```typescript
// Для геофенсов: coordinates = [[lon, lat], ...]
const polygonCoords = geofence.coordinates.map(([lon, lat]) => ({
  latitude: lat,
  longitude: lon,
}));

// Для трека: point.lat, point.lon
const markerCoord = {
  latitude: point.lat,
  longitude: point.lon,
};
```

### 19.4 Offline Detection

Устройство считается офлайн, если `last_seen_at` > N минут назад.

```typescript
function isDeviceOnline(device: Device): boolean {
  if (!device.last_seen_at) return false;
  const lastSeen = new Date(device.last_seen_at).getTime();
  const now = Date.now();
  return (now - lastSeen) < 5 * 60 * 1000; // 5 минут
}
```

---

## 20. Seed Data (демо-аккаунты)

| Роль | Email | Пароль |
|---|---|---|
| Администратор | `admin@safemektep.kz` | `admin123` |
| Школа | `school@safemektep.kz` | `school123` |
| Родитель | `parent@safemektep.kz` | `parent123` |

Демо-ученик: **Ержан Касымов**, класс 5А
Демо-устройство: IMEI `865687062604820`, identifier `DEMO-001`
Демо-геофенсы: "Школа №42" (global) и "Дом Ержана" (привязан к ученику)

Координаты (Алматы):
- Дом: `43.2310, 76.9190`
- Школа: `43.2390, 76.9290`
- Центр карты: `43.238, 76.9`

---

## 21. Docker для разработки (нужен только бэкенд)

```bash
# Запустить бэкенд
cd trackerschool
docker compose up db redis backend gateway -d

# API будет на http://localhost:8080
# WebSocket на ws://localhost:8080/ws
# Swagger на http://localhost:8080/docs
```

Для мобильного приложения:
```bash
cd safemektep-mobile
# если на эмуляторе:
EXPO_PUBLIC_API_URL=http://10.0.2.2:8080 npx expo start
# если на реальном устройстве:
EXPO_PUBLIC_API_URL=http://<ваш-IP>:8080 npx expo start
```

---

## 22. Типичные ошибки при разработке

1. **Order of coordinates**: REST API использует `[lon, lat]`, react-native-maps — `{latitude, longitude}`. Всегда внимательно преобразовывайте.

2. **WebSocket token encoding**: токен нужно encodeURIComponent при передаче в URL: `ws://host/ws?token=${encodeURIComponent(token)}`

3. **FCM on iOS**: для push на iOS нужен APNs ключ в Firebase Console + реальное устройство (симулятор не получает push).

4. **SecureStore на iOS**: работает только на реальном устройстве; на симуляторе используйте AsyncStorage для отладки.

5. **WebSocket keepalive**: сервер шлёт `{"type":"ping"}` каждые 30 сек. Если не получили — закрывайте и переподключайтесь.

6. **Battery уровень**: приходит как int (0-100), может быть `null`.

7. **Parent — один ребёнок**: в текущей модели у родителя может быть несколько детей (через `parent_id` в Student). Родитель на карте видит всех своих детей.

---

## 23. Приложение НЕ делает (границы ответственности)

- **Не общается с браслетом напрямую** — только через REST API / WebSocket бэкенда
- **Не инициирует GSM звонки** — звонки идут напрямую через SIM браслета (приложение открывает dialer)
- **Не настраивает сервер** — для этого есть AT-команды по USB
- **Не заменяет админку** — создание учеников/устройств/пользователей делается через веб-интерфейс

---

## Приложение A: Быстрый старт

```bash
# 1. Клонировать существующий бэкенд
git clone <repo> trackerschool
cd trackerschool

# 2. Запустить бэкенд
docker compose up -d db redis backend gateway

# 3. Создать мобильное приложение (в отдельном терминале)
npx create-expo-app@latest safemektep-mobile --template blank-typescript
cd safemektep-mobile

# 4. Установить зависимости
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
npx expo install react-native-maps
npx expo install expo-notifications expo-device
npx expo install axios expo-secure-store

# 5. Создать структуру директорий
mkdir -p src/{api,hooks,navigation,screens/{auth,parent,school,sos},components,context,utils}

# 6. Установить API_URL
echo "EXPO_PUBLIC_API_URL=http://localhost:8080" > .env
echo "EXPO_PUBLIC_WS_URL=ws://localhost:8080" >> .env

# 7. Запустить
npx expo start
```

## Приложение B: Проверочный список для AI агента

При реализации мобильного приложения AI агент должен:

- [ ] Прочитать `MOBILE_APP_SPEC.md` полностью
- [ ] Создать структуру директорий как в секции 18
- [ ] Реализовать `src/api/types.ts` — все интерфейсы
- [ ] Реализовать `src/api/client.ts` — axios + JWT interceptor
- [ ] Реализовать `src/api/auth.ts` — login, me
- [ ] Реализовать `src/api/students.ts` — listStudents
- [ ] Реализовать `src/api/locations.ts` — lastLocation, track
- [ ] Реализовать `src/api/events.ts` — listEvents
- [ ] Реализовать `src/api/geofences.ts` — listGeofences
- [ ] Реализовать `src/hooks/useWebSocket.ts` — WS с auto-reconnect
- [ ] Реализовать `src/hooks/useAuth.ts` — auth state
- [ ] Реализовать `src/context/AuthContext.tsx`
- [ ] Реализовать `src/context/LiveContext.tsx` — WebSocket state
- [ ] Реализовать `src/navigation/AuthStack.tsx`
- [ ] Реализовать `src/navigation/ParentTabs.tsx`
- [ ] Реализовать `src/navigation/SchoolTabs.tsx`
- [ ] Реализовать `src/navigation/RootNavigator.tsx`
- [ ] Реализовать `src/screens/auth/LoginScreen.tsx`
- [ ] Реализовать `src/screens/parent/MapScreen.tsx` — главный экран
- [ ] Реализовать `src/screens/parent/EventsScreen.tsx`
- [ ] Реализовать `src/screens/parent/HealthScreen.tsx`
- [ ] Реализовать `src/screens/parent/ContactsScreen.tsx`
- [ ] Реализовать `src/screens/parent/SettingsScreen.tsx`
- [ ] Реализовать `src/screens/school/ClassMapScreen.tsx`
- [ ] Реализовать `src/screens/school/AttendanceScreen.tsx`
- [ ] Реализовать `src/screens/school/BatchCommandsScreen.tsx`
- [ ] Реализовать `src/screens/sos/SOSAlertScreen.tsx`
- [ ] Реализовать `src/components/StudentMarker.tsx`
- [ ] Реализовать `src/components/EventCard.tsx`
- [ ] Реализовать `src/components/LoadingIndicator.tsx`
- [ ] Реализовать `src/components/ErrorView.tsx`
- [ ] Подключить `App.tsx` к `RootNavigator`
