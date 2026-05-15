# SafeMektep Mobile App — Roadmap

> Поэтапный план разработки React Native (Expo) приложения.
> Каждый этап — законченный блок, который можно тестировать отдельно.

---

## Этап 1: Заготовка проекта и навигация

- [x] `npx create-expo-app@latest . --template blank-typescript`
- [x] Установить зависимости: `@react-navigation/native`, `native-stack`, `bottom-tabs`, `react-native-maps`, `axios`, `expo-secure-store`, `expo-notifications`, `expo-location`
- [x] Создать структуру папок: `src/api/`, `src/hooks/`, `src/navigation/`, `src/screens/`, `src/components/`, `src/context/`, `src/utils/`
- [x] Настроить TypeScript (strict mode) — уже включён в `tsconfig.json`
- [x] Настроить переменные окружения: `.env` с `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`

**Готовность**: приложение запускается на телефоне через Expo Go, показывает пустой экран.

---

## Этап 2: Auth (логин + JWT)

- [x] `src/api/client.ts` — axios instance с JWT interceptor
- [x] `src/api/types.ts` — все интерфейсы (User, Student, Device, LocationPoint, Event, Geofence, Contact, WSMessage)
- [x] `src/api/auth.ts` — `login(email, password)`, `me()`  
- [x] `src/hooks/useAuth.ts` — Auth hook (встроен в AuthContext)
- [x] `src/context/AuthContext.tsx` — провайдер для всего приложения (SecureStore + auto-login)
- [x] `src/screens/auth/LoginScreen.tsx` — форма входа (email, пароль, кнопка, ошибка, loading)
- [x] `src/navigation/AuthStack.tsx` — стек для неавторизованных
- [x] `src/navigation/RootNavigator.tsx` — проверка токена при старте

**Готовность**: можно войти с `parent@safemektep.kz` / `parent123`, токен сохраняется, при перезапуске не просит логин.

---

## Этап 3: WebSocket + Live State

- [x] `src/hooks/useWebSocket.ts` — WebSocket с auto-reconnect (как `useLiveBus.ts` в вебе)
- [x] `src/context/LiveContext.tsx` — централизованное состояние (students, location, events, geofences)
- [x] Обработка `location` сообщений — обновление координат в реальном времени
- [x] Обработка `event` сообщений — добавление в ленту
- [x] Обработка `ping` — keepalive
- [x] `loadInitialData()` — загрузка учеников, геофенсов, событий, треков через REST
- [x] `RootNavigator.tsx` — показывает список учеников + события + статус подключения

**Готовность**: подключение к WS, сообщения логируются в консоль.

---

## Этап 4: Главный экран — Карта (родитель)

- [x] `src/screens/parent/MapScreen.tsx` — `react-native-maps` с центром на Алматы
- [x] `src/components/StudentMarker.tsx` — Marker + Callout с именем, классом, батареей
- [x] `src/components/GeofencePolygon.tsx` — Polygon с цветом по zone_type (школа синий, дом зелёный)
- [x] `src/components/RoutePolyline.tsx` — пунктирная линия трека с затемнением невыбранного
- [x] Отображение текущей позиции ребёнка из LiveContext
- [x] Обновление маркера через WebSocket (LiveContext обновляет location)
- [x] Bottom card с информацией: имя, класс, батарея, last seen + кнопки
- [x] Кнопка "Найти сейчас" (`POST /api/devices/{id}/locate-now`)
- [x] Кнопка центрирования на ребёнка (animateToRegion)
- [x] `src/navigation/ParentTabs.tsx` — таб Карта (ещё будут Events, Health, Contacts, Settings)

**Готовность**: карта показывает маркер ребёнка, геофенсы, трек; маркер двигается в реальном времени; можно запросить локацию.

---

## Этап 5: Лента событий + SOS

- [x] `src/api/events.ts` — `listEvents(hours)`, `ackEvent(id)`
- [x] `src/screens/parent/EventsScreen.tsx` — лента с цветными карточками, Pull-to-refresh, фильтр (Все/SOS/Геозоны/Батарея)
- [x] `src/components/EventCard.tsx` — иконка, тип, сообщение, время, цветная полоска слева
- [x] Pull-to-refresh
- [x] Фильтр по типу (SOS / геозоны / батарея)
- [x] `src/screens/sos/SOSAlertScreen.tsx` — полноэкранный red alert с картой, координатами, звонком
- [x] `ParentTabs.tsx` — добавлен таб "События"
- [x] `App.tsx` — NavigationContainer ref для навигации на SOSAlert при получении SOS
- [x] `RootNavigator.tsx` — RootStack с модальным экраном SOSAlert

**Готовность**: события показываются, SOS-тревога открывается, можно подтвердить (ack).

---

## Этап 6: Push-уведомления (FCM)

- [x] `src/utils/notifications.ts` — запрос разрешения, получение Expo push token, регистрация на бэкенде
- [x] Регистрация токена на бэкенде: `POST /api/notifications/register-fcm`
- [x] Обработка получения push (setNotificationHandler — alert + sound)
- [x] Обработка нажатия на push — навигация на SOSAlert
- [x] Настройка `app.json` — permissions для Android (POST_NOTIFICATIONS)
- [x] `App.tsx` — вызов `registerForPushNotifications()` после логина

**Готовность**: приходит push при SOS (можно проверить из симулятора или через POST запрос к FCM).

---

## Этап 7: Контакты и здоровье

- [x] `src/screens/parent/ContactsScreen.tsx` — быстрые вызовы, SOS номера, белый список (группировка)
- [x] Кнопка "Позвонить" рядом с каждым номером (`Linking.openURL('tel:...')`)
- [x] `src/api/health.ts` — `getHealth(studentId, date)`
- [x] `src/screens/parent/HealthScreen.tsx` — шаги (прогресс-бар 10k), пульс (средний), SpO₂ (последний)
- [x] `ParentTabs.tsx` — добавлены табы Здоровье и Семья

**Готовность**: контакты отображаются, здоровье показывает данные с бэкенда.

---

## Этап 8: Настройки устройства

- [x] `src/screens/parent/SettingsScreen.tsx` — полный экран настроек
- [x] Режим урока: кнопки Вкл/Выкл (команда `lesson_mode` через `/api/commands/batch`)
- [x] Интервал GPS: ввод секунд + кнопка "Установить" (`set_gps_interval`)
- [x] Интервал пульса: ввод минут + кнопка "Установить" (`set_heart_rate_interval`)
- [x] Блокировка SMS: радио-кнопки (без блокировки / семья+белый / все) + "Применить" (`set_sms_block`)
- [x] Информация об устройстве: модель, тип, ID, IMEI, статус, last seen
- [x] `ParentTabs.tsx` — добавлен таб Настройки (⚙️)

**Готовность**: настройки отображаются, можно менять интервалы (через batch commands).

---

## Этап 9: Школьный модуль

- [x] `src/navigation/SchoolTabs.tsx` — 3 таба: 📍 Карта, 📋 Посещаемость, 📢 Команды
- [x] `src/screens/school/ClassMapScreen.tsx` — карта + список всех учеников (зелёный=онлайн, серый=офлайн)
- [x] `src/api/attendance.ts` — `getClassAttendance()`, `markAttendance()`
- [x] `src/screens/school/AttendanceScreen.tsx` — сводка (здесь/опоздали/нет) + список с временем входа/выхода
- [x] `src/api/commands.ts` — `batchCommand(student_ids, command, payload)`
- [x] `src/screens/school/BatchCommandsScreen.tsx` — 5 команд: режим урока вкл/выкл, найти всех, GPS 60с/5мин
- [x] `RootNavigator.tsx` — `MainTabs` выбирает `SchoolTabs` или `ParentTabs` по роли

**Готовность**: школа видит всех учеников на карте, может отмечать посещаемость и отправлять команды классу.

---

## Этап 10: Полировка, стабильность и адаптивность

- [x] `ErrorBoundary.tsx` — глобальный перехватчик ошибок с кнопкой "Повторить"
- [x] **Обработка ошибок сети**: axios interceptor с 401 → logout, таймаут 15с
- [x] **WebSocket reconnect**: auto-reconnect каждые 2с, индикатор connected в LiveContext
- [x] **Pull-to-refresh**: EventsScreen, AttendanceScreen, все списки
- [x] **Offline статус**: ClassMapScreen — зелёные (онлайн) и серые (офлайн) маркеры
- [x] **Анимации**: Marker animateToRegion при выборе ученика, WebSocket обновления
- [x] **Мемоизация**: useMemo/Fragment разделение на карте
- [x] **Пустые состояния**: все экраны показывают "Нет данных" / "Нет учеников"

**Готовность**: приложение стабильно работает, не падает, корректно обрабатывает ошибки.

---

## Этап 11: iOS (опционально)

- [ ] Проверка на iOS (симулятор)
- [ ] Настройка GoogleService-Info.plist для FCM на iOS
- [ ] Адаптация под SafeArea, notch, разные экраны
- [ ] Проверка push на реальном iOS устройстве

---

## Условные обозначения

| Статус | Значение |
|---|---|
| `- [ ]` | Не начато |
| `- [/]` | В процессе |
| `- [x]` | Готово |
