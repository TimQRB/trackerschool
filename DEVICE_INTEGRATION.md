# Подключение устройств HC02

Документ для разработчиков и инженеров, которые подключают реальные GPS-трекеры HC02 к серверу SafeMektep. Описывает протокол, схему сети, форматы команд и типичные грабли.

> Если расходится с кодом — **приоритет у кода** (`backend/gateway/`). Этот файл нужно тогда обновить.

---

## 1. Что должно произойти, чтобы устройство заработало

1. **Прошивка устройства настроена** на ваш registration center (TCP, порт 13000) и URL `/getDevParam` (HTTP). Это делается через AT-команды на этапе провижна устройства, см. документацию производителя.
2. **Сервер доступен из мобильной сети устройства**: порты 13000, 13001 и порт backend (по умолчанию 8080) открыты на firewall и привязаны к публичному IP / домену.
3. **Переменные окружения gateway** настроены так, чтобы `proaddr` указывал на достижимый из мобильной сети адрес — **не на docker-internal hostname**.
4. **Запись `Device` в БД** существует (создаётся автоматически при первом TCP-handshake) и связана с учеником через админ-панель.
5. **Контакты семьи/SOS/whitelist** добавлены в админке — backend сам пушит их на устройство через TCP-команду 0x03D0 и одновременно делает их доступными через `/getDevParam` для boot-pull.

---

## 2. Сетевая схема

```
                           ┌─────────────────────┐
   GSM/LTE                 │  Firewall / NAT     │
   (мобильная сеть)        │  пробрасывает:      │
                           │   80/443 → :8080    │
   ┌──────────────┐        │   13000 → :13000    │
   │ HC02 Device  │───────►│   13001 → :13001    │
   └──────────────┘        └──────────┬──────────┘
                                      │
                            ┌─────────┴──────────┐
                            │   Docker host       │
                            │  ┌──────────────┐   │
                            │  │  gateway     │   │
                            │  │  :13000 reg  │   │
                            │  │  :13001 svc  │   │
                            │  └──────┬───────┘   │
                            │  ┌──────┴───────┐   │
                            │  │ redis pub/sub│   │
                            │  └──────┬───────┘   │
                            │  ┌──────┴───────┐   │
                            │  │  backend     │   │
                            │  │  :8000       │   │
                            │  └──────────────┘   │
                            └─────────────────────┘
```

Три канала с устройством:

| Канал | Протокол | Назначение |
|---|---|---|
| Registration Center, порт 13000 | TCP бинарный (HC02) | Одноразовый handshake при первом включении: возвращает адрес service-node |
| Service Node, порт 13001 | TCP бинарный (HC02), long-lived | Position, heartbeat, alarms, healt, SMS/call logs, push команд от платформы |
| `/getDevParam` | HTTP POST JSON | Boot-pull: устройство при включении тянет контакты и расписание |

---

## 3. Конфигурация деплоя для реальных устройств

В `docker-compose.yml` сервиса `gateway` нужны переменные:

```yaml
gateway:
  build: ./backend
  command: python -m gateway.main
  environment:
    DATABASE_URL: postgresql+psycopg://safemektep:<пароль>@db:5432/safemektep
    REDIS_URL: redis://redis:6379/0
    JWT_SECRET: <тот же, что у backend>
    REG_PORT: "13000"
    SVC_PORT: "13001"
    PUBLIC_HOST: tracker.example.kz       # ← реальный домен или IP, доступный из GSM-сети
    PUBLIC_SVC_PORT: "13001"              # ← порт, который видит устройство снаружи
  ports:
    - "13000:13000"
    - "13001:13001"
```

**Самая частая ошибка**: оставить `PUBLIC_HOST: gateway` (это hostname внутри docker network). Тогда устройство получит в ответ `proaddr=gateway:13001`, не сможет разрешить hostname и не сможет открыть основное соединение. **`PUBLIC_HOST` должен быть адресом, который разрешается с мобильной сети оператора устройства.**

Если service-node слушает на другом порту наружу (например, 13001 проброшен через nginx на 50001) — `PUBLIC_SVC_PORT` должен указывать на внешний (50001).

### Backend и /getDevParam

`/getDevParam` подключён к тому же FastAPI, что и REST. По умолчанию это порт 8000 внутри контейнера, проброс `8080:8000` наружу. URL для прошивки:

```
http://tracker.example.kz:8080/getDevParam
```

или (если перед backend стоит reverse-proxy с HTTPS):
```
https://tracker.example.kz/getDevParam
```

Endpoint **без авторизации** — устройство идентифицируется по IMEI в payload, токенов на этапе boot нет. Это by-design согласно HC02-спеке.

---

## 4. Бинарный протокол HC02

### 4.1 Формат кадра

```
┌─────────┬────────────┬──────────┬──────────────────┐
│ Sync    │ Proto Type │ Data Len │ JSON Body         │
│ 2 bytes │ 2 bytes BE │ 2 bytes  │ variable length   │
│ 0x4050  │            │ BE       │ UTF-8 JSON        │
└─────────┴────────────┴──────────┴──────────────────┘
```

Кодек: `backend/gateway/protocol.py` (`Frame.encode`, `read_frame`).

### 4.2 Типы протоколов

| Константа | Hex | Направление | Обработчик |
|---|---|---|---|
| `P_LINK` | `0x0000` | Device → GW (reg) | `reg_handler` |
| `P_LINK` | `0x0000` | Device → GW (svc) | `svc_handler` |
| `P_HEARTBEAT` | `0x03DC` | Device → GW | `_handle_heartbeat` |
| `P_POSITION` | `0x03E1` | Device → GW | `_handle_position` |
| `P_ALARM` | `0x03DB` | Device → GW | `_handle_alarm` |
| `P_IMMEDIATE_LOC` | `0x03DD` | GW ↔ Device | команда + ответ через `_handle_position` |
| `P_SET_CONTACTS` | `0x03D0` | GW → Device | пушится из `routers/contacts.py` |
| `P_SET_CLASSROOM` | `0x03D7` | GW → Device | команда `lesson_mode` |
| `P_SET_POS_PERIOD` | `0x03D1` | GW → Device | команда `set_gps_interval` |
| `P_SET_SMS_BLOCK` | `0x1015` | GW → Device | команда `set_sms_block` |
| `P_SET_HEART_RATE_PERIOD` | `0x110D` | GW → Device | команда `set_heart_rate_interval` |
| `P_HEART_RATE` | `0x105E` | Device → GW | `_handle_heart_rate` |
| `P_BLOOD_OXYGEN` | `0x1063` | Device → GW | `_handle_blood_oxygen` |
| `P_CALL_LOG` | `0x0312` | Device → GW | `_handle_call_log` |
| `P_SMS_REPORT` | `0x1016` | Device → GW | `_handle_sms_report` |

mode=2 (cell tower) и mode=3 (WiFi) геолокация **сейчас не резолвится** — точка с пустыми lat/lon молча игнорируется. Чтобы поддержать, нужно интегрировать внешний сервис (Google Geolocation API, unwiredlabs и т.п.) — см. ограничения ниже.

---

## 5. Команды от backend к устройству

Все команды отправляются через REST `POST /api/commands/batch`:

```json
{
  "student_ids": [1, 2, 3],
  "command": "set_gps_interval",
  "payload": { "posPeriod": "5" }
}
```

Backend публикует команду в Redis канал `dev_cmd:<IMEI>`, gateway-подписчик пересылает в TCP-сокет устройства как `Frame(proto_type, {"req": payload})`.

### 5.1 `lesson_mode` — режим урока (0x03D7)

```json
{
  "swit": 3,
  "list": [
    {
      "week": "1,2,3,4,5",
      "timeList": [{ "begTime": "0800", "endTime": "1600" }]
    }
  ]
}
```

- `swit`: `0`=выкл, `1`=вкл без SOS-звонков, `3`=вкл с SOS-звонками
- `week`: строка цифр через запятую. **`0`=Sunday, `1`=Monday, …, `6`=Saturday** (HC02 spec 4.7). `"1,2,3,4,5"` = Пн-Пт.
- `begTime`/`endTime`: формат `HHMM` (24-часовой)

### 5.2 `locate_now` — найти сейчас (0x03DD)

```json
{ "taskId": "loc-1715000000123" }
```

Устройство отвечает кадром `P_IMMEDIATE_LOC` с `res.lat`, `res.lon`, `res.mode`. Обработка — та же функция, что и для периодической геолокации.

### 5.3 `set_gps_interval` — интервал GPS (0x03D1)

```json
{ "posPeriod": "5" }
```

> ⚠️ **`posPeriod` в МИНУТАХ**, диапазон 1–60 (HC02 spec 4.14). Не в секундах. Один из самых частых багов интеграции.

### 5.4 `set_heart_rate_interval` — интервал пульса/SpO2 (0x110D)

```json
{ "heartRatePeriod": "60" }
```

В минутах, диапазон 5–120 (spec 4.13).

### 5.5 `set_sms_block` — блокировка SMS (0x1015)

```json
{ "interceptorMode": "1" }
```

- `"1"` — нет блокировки
- `"2"` — пропускать только семью и whitelist
- `"3"` — блокировать все

### 5.6 Контакты — НЕ через `/api/commands/batch`

Семья/SOS/whitelist пушатся **автоматически** при добавлении через `POST /api/contacts`. Внутри `contacts.py` формируется правильная структура (учтены вендорские особенности):

```json
{
  "req": {
    "pkId": 0,
    "pkCount": 1,
    "list": [
      {
        "type": "1",
        "typelist": [
          { "number": "+77001234567", "disname": "Мама", "serialNo": 1 },
          { "number": "+77007654321", "disname": "Папа", "serialNo": 2 }
        ]
      }
    ]
  }
}
```

Ключевое:
- `type`: `"1"`=family, `"2"`=SOS, `"3"`=whitelist
- Поле имени контакта — **`disname`**, не `displayName`. Прошивка проверяет именно это имя поля.
- Структура **вложенная**: `list[].typelist[]`. Плоская `{type, list:[...]}` устройством отвергнется.
- Лимиты: family и SOS — до 3 номеров, whitelist — до 40.

---

## 6. Данные от устройства к backend

### 6.1 Position (0x03E1, периодика)

```json
{ "req": { "mode": 4, "lat": "43.2380", "lon": "76.9290", "battery": "85", "step": 1234 } }
```

`mode`: `2`=cell tower, `3`=WiFi, `4`=raw GPS. Backend MVP читает только `mode=4`.

### 6.2 Heartbeat (0x03DC)

```json
{ "req": { "battery": "85" } }
```

Battery ≤ 15% → событие `low_battery` (rate-limit 1 час).

### 6.3 Alarm (0x03DB)

```json
{ "req": { "type": 3, "lat": "43.2380", "lon": "76.9290" } }
```

`type`: `1`=power-on, `2`=power-off, `3`=SOS. SOS триггерит push родителю и WebSocket-уведомление.

### 6.4 Heart Rate / шаги (0x105E)

```json
{ "req": { "heartRate": 72, "step": 1234, "time": "20251015080100" } }
```

### 6.5 SpO2 (0x1063)

```json
{ "req": { "value": 98, "type": 1, "time": "20251015080100" } }
```

### 6.6 Call log (0x0312)

```json
{ "req": { "number": "+77001234567", "direction": "1", "duration": "120", "time": "2025-05-15 14:30:00" } }
```

`direction`: `"1"`=исходящий, иначе входящий.

### 6.7 SMS report (0x1016)

```json
{ "req": { "list": [{ "sendNum": "+7700...", "sendContent": "...", "sendTime": "20251015080100" }] } }
```

Хранится в таблице `sms_logs`. Просмотр через `GET /api/students/{id}/sms`.

### 6.8 Immediate location reply (0x03DD)

Структура `res.{lat, lon, mode, battery}` — приходит в ответ на команду `locate_now`. Обрабатывается тем же кодом, что и периодическая позиция.

---

## 7. Boot-up Pull Protocol (HTTP)

Устройство при включении (до подключения к service-node) шлёт:

```
POST /getDevParam
Content-Type: application/json

{ "identity": "865687062604820", "type": "5" }
```

| `type` | Что просит | Ключ в ответе |
|---|---|---|
| `"2"` | whitelist | `whiteNumber` |
| `"3"` | classroom mode | `timeList`, `swit` |
| `"5"` | family | `familyNumber` |
| `"6"` | SOS | `sosNumber` |

Пример ответа:

```json
{
  "familyNumber": [
    { "number": "+77001112233", "serialnumber": "0", "name": "Мама", "url": null }
  ],
  "success": "true",
  "message": "Operation successful"
}
```

Реализация: `backend/app/routers/device_config.py`. При неизвестном IMEI возвращает `success: true` с пустым списком — это требование спеки, иначе прошивка может прервать boot-цикл.

> **Известное ограничение**: classroom mode (`type=3`) пока возвращает пустой `timeList` + `swit=0`. Когда школа выставляет расписание через `/api/commands/batch lesson_mode`, оно идёт **только** push'ем по TCP. Если устройство перезагрузится — расписание потеряется. TODO: персистировать на `Device` и возвращать через pull.

---

## 8. Сценарии и flow

### 8.1 Первое включение устройства

```
[Device]                          [Gateway :13000]                 [Backend]
   │                                     │                              │
   │ 1) TCP connect                      │                              │
   │ ──── P_LINK (req: identity, ...) ──►│                              │
   │ ◄── P_LINK (res: proaddr=...) ──────│                              │
   │ close connection                    │                              │
   │                                     │                              │
   │ 2) HTTP POST /getDevParam type=5    │                              │
   │ ─────────────────────────────────────────────────────────────────► │
   │ ◄────────────── { familyNumber: [...], success: "true" } ────────  │
   │ (повтор для type=2, 3, 6)                                          │
   │                                     │                              │
   │ 3) TCP connect to proaddr           │                              │
   │ ──── P_LINK ───────────► [:13001]   │                              │
   │ ◄── P_LINK (Time, ok) ──            │                              │
   │                                     │                              │
   │ → авто-создаётся Device row в БД (auto-provision)                  │
   │ → НО без student_id, точки геолокации игнорируются                 │
   │                                     │                              │
   │ ──── heartbeat / position ─────────►                               │
   │                                                                    │
   │              [админ привязывает Device к ученику через UI]         │
   │                                                                    │
   │ ──── position ─────────────────────► → пишется в БД, broadcast в WS│
```

### 8.2 Команда от школы → устройство

```
[School Web]                  [Backend]                  [Redis]              [Gateway]            [Device]
     │                            │                         │                     │                    │
     │ POST /api/commands/batch   │                         │                     │                    │
     │ ──────────────────────────►│                         │                     │                    │
     │                            │ PUBLISH dev_cmd:<IMEI>  │                     │                    │
     │                            │ ───────────────────────►│                     │                    │
     │                            │                         │ message             │                    │
     │                            │                         │ ───────────────────►│                    │
     │                            │                         │                     │ Frame.encode()     │
     │                            │                         │                     │ ──────────────────►│
     │ ◄── { ok: true, results }──│                         │                     │                    │
```

`results[i].sent === true` если у Redis-канала был хотя бы один подписчик. **Если устройство офлайн — команда теряется**, retry-очередь не реализована.

### 8.3 SOS от устройства → дашборд

```
[Device]              [Gateway]              [DB]              [Redis]              [Backend]              [WS-клиенты]
   │                     │                     │                  │                     │                       │
   │ Alarm type=3        │                     │                  │                     │                       │
   │ ───────────────────►│                     │                  │                     │                       │
   │                     │ INSERT events       │                  │                     │                       │
   │                     │ ───────────────────►│                  │                     │                       │
   │                     │ bus.publish()       │                  │                     │                       │
   │                     │ PUBLISH safemektep:events ──────────►  │                     │                       │
   │                     │                     │                  │ listener            │                       │
   │                     │                     │                  │ ───────────────────►│                       │
   │                     │                     │                  │                     │ для каждого WS:       │
   │                     │                     │                  │                     │ ─────────────────────►│
   │                     │ send_push_to_parents() (FCM, отдельный путь)                                         │
```

---

## 9. Тестирование без реального устройства

### TCP-симулятор (рекомендуется)

```bash
cd simulator
python hc02_sim.py --gateway-host localhost --reg-port 13000 --imei 999999999999999
```

Реализует HC02 binary-протокол, проходит весь handshake, шлёт периодическую геолокацию. Лучший способ проверить gateway end-to-end.

### HTTP-симулятор (только проверка backend)

```bash
cd simulator
python simulate.py --api-key <API_KEY>
```

Идёт через `/api/ingest/location` с `X-API-Key`. **НЕ HC02 protocol** — реальные устройства этот путь не используют.

---

## 10. Подготовка устройств для раздачи

### 10.1 Авто-провижн

При первом TCP-handshake gateway автоматически создаёт `Device` row:
- `imei` = IMEI устройства
- `identifier` = `HC02-{imei}` (полный IMEI, никаких коллизий)
- `dev_type`, `model_name` — из payload устройства
- `api_key` = `hc02-<random>` (генерируется, но устройство его не использует — нужен только для HTTP ingest)
- `student_id = NULL`
- `is_active = true`

До привязки к ученику все геолокации с устройства **молча отбрасываются** (`_handle_position` ранний return). Это by-design — иначе orphan-точки в БД.

### 10.2 Ручной flow привязки

1. Завести родителя и ученика в админ-панели (`/admin` → вкладка "Пользователи" и "Ученики").
2. Включить устройство, дождаться первого heartbeat. В админке появится новая запись `HC02-<IMEI>`.
3. Открыть вкладку "Устройства" → нажать "Привязать" → выбрать ученика.
4. Открыть "Контакты" → добавить семью / SOS / whitelist. Backend сам сделает:
   - `INSERT contacts ...`
   - `PUBLISH dev_cmd:<IMEI>` с протоколом 0x03D0 — устройство получит контакты "сейчас"
   - Эти же контакты будут возвращаться через `/getDevParam` при следующих перезагрузках устройства

### 10.3 Заранее выставленный API-key (опционально)

Если хочется заранее создать устройство (не дожидаясь первого подключения), можно через `POST /api/devices` от admin:
```json
{ "identifier": "HC02-865687062604820", "student_id": 5 }
```
Получите `api_key` в ответе. Дальше при первом подключении устройства gateway найдёт его по IMEI и не будет авто-провижнить.

---

## 11. Единицы измерения — шпаргалка

| Команда | Поле | Единицы | Диапазон |
|---|---|---|---|
| `set_gps_interval` | `posPeriod` | **минуты** | 1–60 |
| `set_heart_rate_interval` | `heartRatePeriod` | **минуты** | 5–120 |
| `lesson_mode.list[].week` | csv цифр | 0=Вс, 1=Пн, …, 6=Сб | — |
| `lesson_mode.list[].timeList[].begTime` / `endTime` | HHMM | 24h | — |
| `set_sms_block.interceptorMode` | строка `"1"`/`"2"`/`"3"` | `1`=без блока, `2`=family+white, `3`=всё | — |
| Battery (heartbeat, position, alarm) | строка int | проценты | 0–100 |

---

## 12. Что НЕ делать

- ❌ **Не использовать `POST /api/ingest/location` с реальными HC02** — этот endpoint только для упрощённых клиентов / симулятора. Реальные устройства общаются ТОЛЬКО через TCP gateway.
- ❌ **Не слать команды устройству, когда оно офлайн** — `send_command` вернёт `subscribers=0`, и команда **молча потеряется** (retry не реализован). Проверять `device.last_seen_at` перед отправкой.
- ❌ **Не менять `PUBLIC_HOST` "на лету"** — устройство сохраняет `proaddr` один раз при первом подключении к reg-центру. После этого оно идёт сразу на сохранённый адрес и не возвращается на reg до фабричного сброса или 2-часового fallback (per HC02 spec 1.6).
- ❌ **Не оставлять docker-internal hostname в `PUBLIC_HOST`** для прода — устройство не сможет разрешить его через мобильную сеть.
- ❌ **Не использовать `posPeriod` в секундах** — это минуты. Если послать `"60"` ожидая минуту, устройство будет апдейтить позицию раз в **час**.
- ❌ **Не отправлять контакты с полем `displayName`** — это `disname`. Прошивка проигнорирует.
- ❌ **Не блокировать `/getDevParam` фаерволом** — без него устройство при boot не получит начальную конфигурацию.

---

## 13. Известные ограничения и TODO

| # | Проблема | Где | Приоритет |
|---|---|---|---|
| 1 | mode=2 (cell tower) и mode=3 (WiFi) геолокация не резолвится | `gateway._handle_position` | Средний |
| 2 | Команды устройству при offline не ставятся в очередь — теряются | `device_commands.send_command` | Высокий, если устройства часто офлайн |
| 3 | Расписание `lesson_mode` не персистируется → теряется на перезагрузке устройства | `device_config.get_dev_param` (type=3) | Высокий |
| 4 | Reconnect-backoff устройства (30s/3m/8m/18m per HC02 spec) — не имитирован в `hc02_sim.py` | `simulator/hc02_sim.py` | Низкий |
| 5 | Heartbeat-таймаут gateway = 600s, но spec говорит heartbeat раз в 300s. При плохой сети устройство может уронить соединение | `gateway/main.py:454` | Низкий |
| 6 | `dev_type` и `model_name` из payload передаются как-есть, никакой проверки на supported моделях | `_get_or_create_device` | Низкий |

---

## 14. Куда копать при отладке

| Симптом | Что проверить |
|---|---|
| Устройство не подключается | 1) `PUBLIC_HOST` разрешается с GSM-сети? 2) Порты 13000/13001 открыты в firewall? 3) Логи `docker compose logs gateway` |
| Подключилось, но точек нет в UI | 1) `Device.student_id` не NULL? (без привязки точки дропаются) 2) `mode=4` в payload? (cell/wifi не резолвятся) 3) Логи gateway на predefined PATTERN `position imei=` |
| SOS в БД есть, но UI его не показывает | Раньше был баг in-process bus → починен. Если воспроизводится — проверь `docker compose logs backend` на ошибки Redis listener |
| Команда отправлена, но устройство не реагирует | 1) `subscribers > 0` в ответе? Если 0 — устройство офлайн 2) Правильные единицы? (`posPeriod` в минутах!) 3) `disname` а не `displayName` в контактах? |
| `/getDevParam` возвращает 422 | Прошивка шлёт что-то нестандартное — посмотри raw payload через nginx access log или mitmproxy |
| Контакты не синкаются на устройство | 1) `Device.imei` заполнен? Без IMEI `_push_contacts_for_type` сразу выходит 2) Устройство онлайн? 3) Логи gateway на `imei=... -> command 0x03d0 sent` |
| WebSocket не получает события | 1) JWT валиден и не истёк? 2) Redis listener в backend жив? Проверь `bus: subscribed to safemektep:events` в логах backend |

---

## 15. Полезные команды

```bash
# Логи только gateway
docker compose logs -f gateway

# Логи только backend
docker compose logs -f backend

# Узнать, какие устройства сейчас онлайн (по подпискам на dev_cmd:*)
docker compose exec redis redis-cli PUBSUB CHANNELS 'dev_cmd:*'

# Посмотреть события в real-time
docker compose exec redis redis-cli SUBSCRIBE safemektep:events

# Дёрнуть locate_now вручную
curl -X POST http://localhost:8080/api/devices/1/locate-now \
  -H "Authorization: Bearer <JWT>"

# Симулировать boot-pull HC02 для теста
curl -X POST http://localhost:8080/getDevParam \
  -H "Content-Type: application/json" \
  -d '{"identity":"865687062604820","type":"5"}'
```
