# SafeMektep

Система отслеживания геопозиции школьников. Веб-панель для школы и админа, мобильное приложение для родителей и школы, бэкенд с поддержкой реальных GPS-трекеров HC02.

> Подключение реальных устройств — отдельный документ: **[DEVICE_INTEGRATION.md](./DEVICE_INTEGRATION.md)**.

## Быстрый старт

```bash
docker compose up --build
```

Поднимется:

| Сервис | Порт | Назначение |
|---|---|---|
| Frontend (React/Vite) | `5173` | http://localhost:5173 |
| Backend (FastAPI) | `8080` → 8000 | http://localhost:8080/docs |
| TCP Gateway (HC02) | `13000`, `13001` | Регистрация + сервис-нода для трекеров |
| PostgreSQL + PostGIS | `5435` → 5432 | БД |
| Redis | `6379` | Pub/Sub для WebSocket и команд устройствам |

При первом запуске backend засеивает демо-данные и печатает API-key демо-устройства в логах — он нужен симулятору.

## Демо-аккаунты

| Роль | Email | Пароль |
|---|---|---|
| Администратор | `admin@safemektep.kz` | `admin123` |
| Школа | `school@safemektep.kz` | `school123` |
| Родитель | `parent@safemektep.kz` | `parent123` |

> Перед выкладкой в прод обязательно сменить — см. раздел "Production checklist" ниже.

## Стек

| Слой | Технология |
|---|---|
| Backend | Python 3.12 + FastAPI + asyncio TCP Gateway |
| БД | PostgreSQL 16 + PostGIS 3.4 |
| Очереди / Pub/Sub | Redis 7 |
| Frontend | React 18 + TypeScript + Vite + Leaflet |
| Mobile | React Native (Expo 54) + react-native-maps |
| Симулятор HTTP | Python + `requests` |
| Симулятор TCP (HC02) | Python (бинарный протокол) |
| Push | Firebase Cloud Messaging |

## Структура проекта

```
trecker/
├── docker-compose.yml         # 5 сервисов: db, redis, backend, gateway, frontend
├── README.md                  # этот файл
├── DEVICE_INTEGRATION.md      # для интеграторов устройств
│
├── backend/                   # Python: REST API + TCP Gateway
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/                   # FastAPI приложение
│   │   ├── main.py              # точка входа, lifespan, CORS, роутеры
│   │   ├── config.py            # settings из env (DATABASE_URL, REDIS_URL, JWT_SECRET, ...)
│   │   ├── database.py          # SQLAlchemy engine + SessionLocal
│   │   ├── models.py            # ORM-модели всех таблиц
│   │   ├── schemas.py           # Pydantic схемы для REST
│   │   ├── security.py          # JWT, bcrypt, require_roles()
│   │   ├── bus.py               # Redis Pub/Sub bus (канал safemektep:events)
│   │   ├── device_commands.py   # Redis publish команд для gateway
│   │   ├── geofence_service.py  # PostGIS ST_Covers + детекция enter/exit
│   │   ├── notify.py            # FCM push wrapper
│   │   ├── init_db.py           # PostGIS extension, create_all, seed демо-данных
│   │   └── routers/
│   │       ├── auth.py             # POST /api/auth/login, GET /api/auth/me
│   │       ├── users.py            # CRUD пользователей (admin)
│   │       ├── students.py         # CRUD учеников + фильтр по родителю
│   │       ├── devices.py          # CRUD устройств, /assign, /locate-now
│   │       ├── geofences.py        # CRUD геозон (PostGIS POLYGON)
│   │       ├── locations.py        # POST /api/ingest/location (X-API-Key), треки
│   │       ├── events.py           # лента событий + ack
│   │       ├── contacts.py         # семья/SOS/whitelist (auto-push на устройство)
│   │       ├── device_config.py    # POST /getDevParam (boot-pull от устройства)
│   │       ├── commands.py         # POST /api/commands/batch (lesson, GPS, SMS...)
│   │       ├── attendance.py       # посещаемость + ручная отметка
│   │       ├── health.py           # пульс / SpO2 / шаги
│   │       ├── sms.py              # история SMS-отчётов от устройства
│   │       ├── notifications.py    # регистрация FCM-токена
│   │       └── ws.py               # WebSocket /ws?token=JWT
│   │
│   └── gateway/               # Отдельный процесс, общается с устройствами по TCP
│       ├── main.py              # asyncio listeners на :13000 и :13001
│       └── protocol.py          # Кадр-кодек 0x4050 + константы P_*
│
├── frontend/                  # React + Vite
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                 # роутер, auth-guard
│       ├── styles.css
│       ├── api.ts                  # типы + fetch-обёртки + WS_URL
│       ├── useLiveBus.ts           # WebSocket hook с reconnect
│       ├── components/
│       │   └── MapView.tsx         # Leaflet, маркеры, треки, геозоны
│       └── pages/
│           ├── Login.tsx
│           ├── Dashboard.tsx       # карта + сайдбар "Ученики" + "События"
│           └── Admin.tsx           # вкладки: ученики, устройства, геозоны, контакты, юзеры
│
├── mobile/                    # React Native (Expo 54)
│   ├── App.tsx                  # provider'ы + NavigationContainer + SOS-listener
│   ├── app.json                 # Expo config (permissions, plugins)
│   ├── package.json
│   ├── tsconfig.json
│   ├── index.ts
│   ├── assets/                  # иконки/сплеш
│   └── src/
│       ├── api/
│       │   ├── client.ts           # axios, auto-resolve API_URL для эмулятора/Expo Go
│       │   ├── types.ts            # все DTO (User, Student, LocationPoint, ...)
│       │   ├── auth.ts             # login, me
│       │   ├── attendance.ts
│       │   ├── commands.ts         # batch командой на /api/commands/batch
│       │   ├── events.ts
│       │   └── health.ts
│       ├── context/
│       │   ├── AuthContext.tsx     # JWT, current user, login/logout
│       │   └── LiveContext.tsx     # students/events/geofences + WS-обновления
│       ├── hooks/
│       │   └── useWebSocket.ts     # auto-reconnect WS
│       ├── navigation/
│       │   ├── RootNavigator.tsx   # роутинг по роли
│       │   ├── AuthStack.tsx       # экран логина
│       │   ├── ParentTabs.tsx      # 5 табов: Карта/События/Здоровье/Семья/Настройки
│       │   └── SchoolTabs.tsx      # 3 таба: Карта/Посещаемость/Команды
│       ├── screens/
│       │   ├── auth/
│       │   │   └── LoginScreen.tsx
│       │   ├── parent/
│       │   │   ├── MapScreen.tsx
│       │   │   ├── EventsScreen.tsx
│       │   │   ├── HealthScreen.tsx
│       │   │   ├── ContactsScreen.tsx
│       │   │   └── SettingsScreen.tsx
│       │   ├── school/
│       │   │   ├── ClassMapScreen.tsx
│       │   │   ├── AttendanceScreen.tsx
│       │   │   └── BatchCommandsScreen.tsx
│       │   └── sos/
│       │       └── SOSAlertScreen.tsx   # полноэкранный red alert
│       ├── components/
│       │   ├── StudentMarker.tsx
│       │   ├── GeofencePolygon.tsx
│       │   ├── RoutePolyline.tsx
│       │   ├── EventCard.tsx
│       │   └── ErrorBoundary.tsx
│       └── utils/
│           └── notifications.ts    # expo-notifications, register-fcm
│
└── simulator/                 # Тестовые симуляторы устройства
    ├── requirements.txt
    ├── simulate.py              # HTTP-симулятор (X-API-Key → /api/ingest/location)
    └── hc02_sim.py              # TCP-симулятор реального HC02 (бинарный протокол)
```

## Архитектура: общая схема

```
┌─────────────────┐     HTTP/WS     ┌──────────────┐
│  Mobile App     │◄────────────────│              │
│  (Expo RN)      │                 │              │
└─────────────────┘                 │              │
                                    │   Backend    │
┌─────────────────┐     HTTP/WS     │  (FastAPI)   │
│  Web Frontend   │◄────────────────│  :8080       │
│  (React/Vite)   │                 │              │
└─────────────────┘                 └──────┬───────┘
                                           │
              ┌────────────────────────────┼─────────────────────────┐
              │ Redis Pub/Sub              │                         │
              │ • dev_cmd:<IMEI>           │ SQLAlchemy              │
              │ • safemektep:events        │                         │
              ▼                            ▼                         ▼
   ┌──────────────────┐         ┌──────────────────┐      ┌──────────────────┐
   │  TCP Gateway     │         │   PostgreSQL     │      │     Redis        │
   │  (asyncio)       │         │   + PostGIS      │      │                  │
   │  :13000 (reg)    │         │   :5432          │      │   :6379          │
   │  :13001 (svc)    │         └──────────────────┘      └──────────────────┘
   └────────┬─────────┘
            │ TCP (HC02 binary)  +  HTTP POST /getDevParam
            ▼
   ┌──────────────────┐
   │  HC02 Device     │
   │  (bracelet)      │
   └──────────────────┘
```

Ключевое:
- **Backend** и **TCP Gateway** — два независимых процесса с общим кодом (`./backend`), оба ходят в общую БД.
- **Redis Pub/Sub** связывает их: канал `dev_cmd:<IMEI>` для команд REST → устройство, канал `safemektep:events` для real-time событий обратно в WebSocket-клиенты.
- **PostGIS** для геозон (POLYGON SRID 4326, `ST_Covers` для вхождения точки).
- **Состояние "внутри/снаружи"** хранится в `device_zone_states` для каждой пары `device × geofence`, что позволяет детектировать переходы и формировать события `enter_zone` / `exit_zone`.

## Сущности БД

```
users(id, email, password_hash, full_name, role, fcm_token)
students(id, full_name, class_name, parent_id → users)
devices(id, identifier, imei UNIQUE, dev_type, model_name, student_id, api_key, last_seen_at, last_battery, is_active)
geofences(id, name, zone_type, polygon GEOMETRY, student_id NULL)
location_points(id, device_id, lat, lon, accuracy, speed, battery, recorded_at)
events(id, student_id, event_type, severity, geofence_id, message, lat, lon, acknowledged, created_at)
device_zone_states(id, device_id, geofence_id, is_inside, updated_at)
contacts(id, device_id, contact_type, number, display_name, serial_no)
health_records(id, device_id, heart_rate, spo2, steps, recorded_at)
attendance_logs(id, student_id, date, enter_time, exit_time, status)
call_logs(id, device_id, number, direction, duration, called_at)
sms_logs(id, device_id, number, content, sent_at)
```

Миграций нет — `Base.metadata.create_all` + ручные `ALTER TABLE ADD COLUMN IF NOT EXISTS` в `init_db.py`. Для прода — подключить Alembic.

## REST API

Swagger: http://localhost:8080/docs

Группы:
- `/api/auth/*` — login, `/me`
- `/api/users` — CRUD пользователей (admin)
- `/api/students` — CRUD учеников (school/admin), родитель видит только своих
- `/api/devices` — CRUD, `/assign/{student_id}`, `/locate-now`
- `/api/geofences` — CRUD геозон
- `/api/ingest/location` — POST с `X-API-Key` (только симулятор; реальные HC02 не используют этот путь)
- `/api/students/{id}/track`, `/last-location` — треки и последняя точка
- `/api/students/{id}/health`, `/sms` — данные с устройства
- `/api/events` — лента событий, ack
- `/api/contacts` — семья/SOS/whitelist (auto-push на устройство через 0x03D0)
- `/api/commands/batch` — команды устройствам класса (lesson_mode, set_gps_interval, locate_now, set_sms_block, set_heart_rate_interval)
- `/api/attendance/class`, `/mark` — посещаемость
- `/api/notifications/register-fcm` — регистрация push-токена
- `/getDevParam` — boot-pull от устройства HC02 (без авторизации, по IMEI)
- `/ws?token=JWT` — WebSocket для real-time локаций и событий

## WebSocket

```
ws://<host>:8080/ws?token=<JWT>
```

Сообщения:
```json
{ "type": "location", "payload": { "student_id": 1, "lat": 43.238, "lon": 76.929, "battery": 85, ... } }
{ "type": "event",    "payload": { "event_type": "sos", "severity": "critical", "message": "...", ... } }
{ "type": "ping" }
```

Источник — Redis-канал `safemektep:events`. И backend, и gateway шлют события через `bus.publish(...)`, listener в backend читает Redis и фанит локальным WS-клиентам.

## Запуск компонентов отдельно

### Backend (без docker)
```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://safemektep:safemektep@localhost:5435/safemektep \
REDIS_URL=redis://localhost:6379/0 \
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Gateway (если нужны реальные устройства)
```bash
cd backend
DATABASE_URL=... REDIS_URL=... PUBLIC_HOST=<your_host> python -m gateway.main
```

### Frontend (dev)
```bash
cd frontend
npm install
npm run dev
```

### Mobile (Expo)
```bash
cd mobile
npm install
npx expo start
```
Сканировать QR через Expo Go или нажать `a` для Android-эмулятора. Адрес backend подхватывается автоматически через `Constants.expoConfig.hostUri`. Для push-уведомлений нужен development build:
```bash
npx expo prebuild
npx expo run:android
```

### Симулятор (HTTP)
```bash
cd simulator
pip install -r requirements.txt
python simulate.py --api-key <API_KEY_из_логов_backend>
```
Команды в терминале симулятора: `s` — SOS, `b` — батарея до 10%, `q` — выход.

### Симулятор TCP HC02
Для теста gateway end-to-end без реального устройства:
```bash
cd simulator
python hc02_sim.py --gateway-host localhost --reg-port 13000 --imei 999999999999999
```

## Production checklist ⚠️

Дефолтный `docker-compose.yml` подходит только для dev. Перед публичной выкладкой:

| # | Что | Где | Почему |
|---|---|---|---|
| 1 | Сменить `ADMIN_PASSWORD` (по умолчанию `admin123`) | `docker-compose.yml` → `backend.environment` | Дефолт = полный admin доступ |
| 2 | Сменить `JWT_SECRET` (по умолчанию `change-me-in-prod`) | `backend` + `gateway` env (должны совпадать) | Подделка токенов |
| 3 | Сменить `POSTGRES_PASSWORD` | `db.environment` + строки подключения | Дефолт `safemektep`/`safemektep` |
| 4 | Убрать проброс Postgres наружу | удалить `ports: ["5435:5432"]` у `db` | Не выставлять БД в публичный интернет |
| 5 | Сузить CORS | `backend/app/main.py` — `allow_origins=["https://your-domain"]` | Защита от cross-origin |
| 6 | HTTPS перед backend и frontend | nginx/Caddy reverse proxy | JWT и данные детей в шифре |
| 7 | Rate-limit на `/api/ingest/location` | slowapi или nginx `limit_req` | Утёкший API-key даст спам |
| 8 | FCM credentials | смонтировать `firebase-credentials.json` в backend + gateway | Без этого push не работает |
| 9 | Persistent volume для Redis | `volumes:` для redis | Иначе очередь команд теряется при рестарте |
| 10 | Alembic-миграции | заменить `create_all` в `init_db.py` | Эволюция схемы |

## Что уже есть по безопасности

- JWT-аутентификация
- Bcrypt-хеширование паролей
- Раздельные права по ролям (parent видит только своих детей, school — всех, admin — всё)
- Устройства аутентифицируются по `X-API-Key` (HTTP ingest) или по IMEI (TCP gateway)
- `/getDevParam` без авторизации по дизайну (устройство не имеет токенов на boot)

## Известные ограничения

| # | Проблема | Где |
|---|---|---|
| 1 | mode=2 (cell tower) и mode=3 (WiFi) геолокация не резолвится — точка отбрасывается | `gateway._handle_position` |
| 2 | Команды устройству при offline не ставятся в очередь — теряются | `device_commands.send_command` |
| 3 | Расписание `lesson_mode` не персистируется → теряется на перезагрузке устройства | `device_config.get_dev_param` (type=3) |
| 4 | Нет миграций Alembic | `init_db.py` |
| 5 | JWT передаётся в query при WS-handshake (попадает в логи прокси) | `routers/ws.py` |
| 6 | Нет rate-limit на `/api/ingest/location` | `routers/locations.py` |
| 7 | CORS `allow_origins=["*"]` | `main.py` |
| 8 | Reconnect-backoff устройства (30s/3m/8m/18m per HC02 spec 1.1-1.6) — не имитирован в `hc02_sim.py` | `simulator/hc02_sim.py` |
| 9 | Нет аудит-лога доступа к данным детей | — |

## AT Command Web Terminal

The admin panel includes a built-in **AT Command Web Terminal** that replaces the need for separate serial terminal software (such as sscom, PuTTY, or minicom) when configuring tracker devices via USB.

### Features

- **Serial Terminal** — send AT commands to the tracker over USB and see live responses
- **Command Templates** — 25+ pre-built AT commands with descriptions (signal check, APN config, GPS toggle, factory reset, etc.)
- **Command History** — every command and its response is logged to the database
- **Remote AT over TCP** — send AT commands to devices already connected via the HC02 TCP protocol (requires firmware with 0x10FF support)

### Step-by-Step: First-time tracker setup

#### 1. Physical connection

1. Install the **ASR Modem** drivers for your tracker (Windows may require disabling driver signature enforcement).
2. Connect the tracker to your computer using a **data-capable USB cable** (the charging-only cable that comes with the device will not work).
3. Open **Device Manager** — look for a new port named *"ASR Modem Device"*. Note the COM port number (e.g., `COM3`).

#### 2. Open the terminal

1. Log in as **admin** or **school** role.
2. Navigate to `/admin` and click the **AT Terminal** tab.
3. Make sure the sub-tab **Terminal** is selected.

#### 3. Connect

1. **Port** dropdown — select the COM port matching *ASR Modem Device* (ports are auto-detected on the server).
2. **Baud** — leave at `115200` (standard for ASR modems).
3. Click **Open** — the terminal window should show: `Connected to COMx @ 115200`.

#### 4. Test communication

1. Type `AT` in the input field and press **Enter**.
2. The device should reply with `OK`.

#### 5. Essential diagnostic commands

| Command | What it checks | Expected response |
|---------|---------------|-------------------|
| `AT` | Basic modem communication | `OK` |
| `AT+CPIN?` | SIM card status | `+CPIN: READY` |
| `AT+CSQ` | Signal strength (0–31) | `+CSQ: 15,0` (higher is better) |
| `AT+CREG?` | Network registration | `+CREG: 0,1` (home network) |
| `AT+CGATT?` | GPRS attachment | `+CGATT: 1` (attached) |
| `AT+CGDCONT?` | Current APN settings | Shows configured APN |
| `AT+COPS?` | Current operator | Operator name |
| `AT+CIMI` | SIM card IMSI | 15-digit number |
| `AT+CCID` | SIM card serial number | 20-digit number |

#### 6. Configure APN (if internet is not working)

Click the **Templates** sub-tab and tap the command for your operator:

- **Beeline KZ**: `AT+CGDCONT=1,"IP","internet.beeline.kz"`
- **Tele2 KZ**: `AT+CGDCONT=1,"IP","internet.tele2.kz"`
- **Activ KZ**: `AT+CGDCONT=1,"IP","internet.activ.kz"`
- **Other**: type your custom APN manually

After setting APN, send `AT+CGATT=1` to attach GPRS.

#### 7. GPS and device commands

| Command | Action |
|---------|--------|
| `AT+QGPS=1` | Enable GNSS (Qualcomm-based trackers) |
| `AT+QGPS=0` | Disable GNSS |
| `AT+HEART=300` | Set heartbeat interval to 300 seconds |
| `AT+SLEEP=0` | Disable sleep mode |
| `AT+RESET` | **Restart the device** (required for many settings to take effect) |

#### 8. Using Templates

Switch to the **Templates** sub-tab:
- Browse 25+ categorized commands with Russian labels and descriptions
- **Click any template** — if the serial port is open, the command is sent immediately; if closed, it is copied to the input field

#### 9. Remote AT via TCP

Switch to the **Remote** sub-tab:
1. Select a device from the dropdown (filtered by IMEI).
2. Type an AT command or click one of the quick-action buttons.
3. Click **Send** — the command is forwarded through the existing TCP connection.
4. *Note: requires tracker firmware that handles protocol type `0x10FF`.*

#### 10. Viewing history

Switch to the **History** sub-tab:
- All AT commands (both serial and remote) are logged with timestamps
- Filter by device, view commands, responses, and success/failure status
- History is stored in the `at_command_logs` database table

### REST API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/at/ports` | List available serial COM ports |
| `GET` | `/api/at/templates` | List AT command templates |
| `GET` | `/api/at/history` | Get AT command history (query: `device_id`, `limit`, `offset`) |
| `POST` | `/api/at/history` | Save an AT command to history |
| `POST` | `/api/at/remote` | Send an AT command to an online device via TCP |
| `WS` | `/api/at/ws?token=<JWT>` | WebSocket serial terminal — bidirectional command/response |

## Контакты разработки

- Issues / TODO — внутри файлов через `# TODO:` (`grep -rn "TODO" backend frontend mobile`)
- Подключение реального HC02 — см. **[DEVICE_INTEGRATION.md](./DEVICE_INTEGRATION.md)**
