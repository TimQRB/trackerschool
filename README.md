# SafeMektep — MVP

Система отслеживания геопозиции школьников. Родители используют мобильное приложение (Expo/React Native), школа работает через веб.

## Стек

| Слой | Технология |
|---|---|
| Backend | Python 3.12 + FastAPI + WebSocket |
| БД | PostgreSQL 16 + PostGIS 3.4 |
| Frontend | React 18 + TypeScript + Vite + Leaflet |
| Mobile | React Native (Expo 54) + TypeScript + react-native-maps |
| Симулятор устройства | Python (HTTP POST) |
| Запуск | Docker Compose |

## Запуск

```bash
docker compose up --build
```

Что поднимется:
- **Frontend** → http://localhost:5173
- **Backend API** → http://localhost:8000 (Swagger: http://localhost:8000/docs)
- **PostgreSQL** → localhost:5432
- **Redis** → localhost:6379

При первом запуске backend автоматически:
1. Создаёт расширение PostGIS.
2. Создаёт таблицы.
3. Засеивает демо-данные: пользователей, ученика, устройство, школу и дом как геозоны (район пр. Абая, Алматы).

В логах backend увидишь API-key демо-устройства — он понадобится симулятору.

## Демо-аккаунты

| Роль | Email | Пароль |
|---|---|---|
| Администратор | `admin@safemektep.kz` | `admin123` |
| Школа | `school@safemektep.kz` | `school123` |
| Родитель | `parent@safemektep.kz` | `parent123` |

## Мобильное приложение

React Native (Expo 54) приложение для родителей и школы.

```bash
cd mobile
npm install
npx expo start
```

Сканируй QR-код через Expo Go (Android/iOS) или запусти на эмуляторе:
- **Android эмулятор**: `npx expo start` → `a`
- **Локально**: IP сервера определяется автоматически через `expo-constants`

Настройки подключения к бэкенду — `mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://192.168.8.100:8080
EXPO_PUBLIC_WS_URL=ws://192.168.8.100:8080
```

Для push-уведомлений и production сборки нужен development build:
```bash
npx expo prebuild
npx expo run:android
```

## Запуск симулятора устройства

В отдельном терминале:

```bash
cd simulator
pip install -r requirements.txt
python simulate.py --api-key <API_KEY_из_логов_backend>
```

Симулятор имитирует движение ребёнка дом → школа → дом и шлёт координаты раз в 2 секунды.

В терминале симулятора можно ввести:
- `s` + Enter — отправить SOS (срочное событие, красное в интерфейсе)
- `b` + Enter — уронить заряд до 10% (триггер события «низкий заряд»)
- `q` + Enter — выйти

Альтернатива: API-key можно взять из админ-панели → вкладка «Устройства».

## Что внутри MVP

- Роли: **родитель / школа / администратор**
- Сущности: **ученик, устройство, геозона (полигон), точка трека, событие**
- Карта в реальном времени (WebSocket): живые позиции, треки за последние 6ч, полигоны зон
- Геозоны: автоматическое детектирование входа/выхода через PostGIS
- События: вход/выход зоны, SOS, низкий заряд
- Админка: CRUD по ученикам, устройствам, геозонам, пользователям

## Что осталось «на будущее»

- Уведомления (Telegram-бот / push / email)
- AI-модуль (отклонение от маршрута, аномалии в движении)
- Реальное устройство (ESP32 + GPS + GSM/NB-IoT, MQTT)
- Журнал посещаемости
- Экстренные службы как отдельная роль
- Маршрут «школа ↔ дом» как именованная зона со временем прохождения

## Структура

```
trecker/
├── docker-compose.yml
├── backend/             # FastAPI + SQLAlchemy + PostGIS
│   └── app/
│       ├── main.py
│       ├── models.py
│       ├── schemas.py
│       ├── security.py
│       ├── geofence_service.py
│       ├── bus.py            # in-process pub/sub для WS
│       ├── init_db.py        # миграция + сид
│       └── routers/
├── frontend/            # React + Vite + Leaflet
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── useLiveBus.ts
│       ├── components/MapView.tsx
│       └── pages/
├── mobile/              # React Native (Expo) приложение
│   ├── App.tsx
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── navigation/
│   │   ├── screens/
│   │   └── utils/
│   └── app.json
└── simulator/
    └── simulate.py
```

## Безопасность (что уже есть)

- JWT-аутентификация
- Bcrypt-хеширование паролей
- Раздельные права по ролям (родитель видит только своих детей)
- Устройства аутентифицируются через `X-API-Key`

## Безопасность (то, что для прод-версии нужно добавить)

- HTTPS везде
- Шифрование чувствительных полей в БД (`pgcrypto`)
- Rate-limiting на ingest-endpoint
- Аудит-лог доступа к данным детей
- Хостинг данных на территории Казахстана (требование закона о ПДн)
