import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, atApi, Contact, Device, Geofence, Student, User } from "../api";
import { WS_URL } from "../api";

interface Props {
  user: User;
  onLogout: () => void;
}

type Tab = "students" | "devices" | "geofences" | "contacts" | "users" | "at";

export default function Admin({ user, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("students");

  return (
    <div className="app">
      <div className="topbar">
        <h1>SafeMektep — Управление</h1>
        <div className="topbar-actions">
          <Link to="/" style={{ color: "white" }}>← К карте</Link>
          <span>{user.full_name}</span>
          <button onClick={onLogout}>Выйти</button>
        </div>
      </div>

      <div style={{ padding: 24, overflowY: "auto" }}>
        <div className="tabs" style={{ maxWidth: 600 }}>
          <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>
            Ученики
          </button>
          <button className={tab === "devices" ? "active" : ""} onClick={() => setTab("devices")}>
            Устройства
          </button>
          <button className={tab === "geofences" ? "active" : ""} onClick={() => setTab("geofences")}>
            Геозоны
          </button>
          <button className={tab === "contacts" ? "active" : ""} onClick={() => setTab("contacts")}>
            Контакты
          </button>
          <button className={tab === "at" ? "active" : ""} onClick={() => setTab("at")}>
            AT-терминал
          </button>
          {user.role === "admin" && (
            <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
              Пользователи
            </button>
          )}
        </div>

        <div style={{ marginTop: 16, background: "white", padding: 20, borderRadius: 8 }}>
          {tab === "students" && <StudentsTab />}
          {tab === "devices" && <DevicesTab isAdmin={user.role === "admin"} />}
          {tab === "geofences" && <GeofencesTab />}
          {tab === "contacts" && <ContactsTab />}
          {tab === "at" && <AtTerminalTab />}
          {tab === "users" && <UsersTab />}
        </div>
      </div>
    </div>
  );
}

function StudentsTab() {
  const [items, setItems] = useState<Student[]>([]);
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [parents, setParents] = useState<User[]>([]);

  async function load() {
    setItems(await api.listStudents());
    try {
      const users = await api.listUsers();
      setParents(users.filter((u) => u.role === "parent"));
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.createStudent({
      full_name: name,
      class_name: cls,
      parent_id: parentId ? Number(parentId) : null,
    });
    setName(""); setCls(""); setParentId("");
    load();
  }

  return (
    <div>
      <h3>Ученики</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
            <th style={{ padding: 8 }}>ФИО</th>
            <th style={{ padding: 8 }}>Класс</th>
            <th style={{ padding: 8 }}>Устройство</th>
            <th style={{ padding: 8 }}>Родитель ID</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{s.full_name}</td>
              <td style={{ padding: 8 }}>{s.class_name}</td>
              <td style={{ padding: 8 }}>{s.device?.identifier || "—"}</td>
              <td style={{ padding: 8 }}>{s.parent_id ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={submit} style={{ maxWidth: 400 }}>
        <h4>Добавить ученика</h4>
        <div className="form-row">
          <label>ФИО</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Класс</label>
          <input value={cls} onChange={(e) => setCls(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Родитель</label>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— без родителя —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" type="submit">Создать</button>
      </form>
    </div>
  );
}

function DevicesTab({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Device[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [studentId, setStudentId] = useState<string>("");

  async function load() {
    setItems(await api.listDevices());
    setStudents(await api.listStudents());
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.createDevice({
      identifier,
      student_id: studentId ? Number(studentId) : null,
    });
    setIdentifier(""); setStudentId("");
    load();
  }

  return (
    <div>
      <h3>Устройства</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
            <th style={{ padding: 8 }}>ID</th>
            <th style={{ padding: 8 }}>Идентификатор</th>
            <th style={{ padding: 8 }}>Ученик ID</th>
            <th style={{ padding: 8 }}>API key</th>
            <th style={{ padding: 8 }}>Заряд</th>
            <th style={{ padding: 8 }}>Активно</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{d.id}</td>
              <td style={{ padding: 8 }}>{d.identifier}</td>
              <td style={{ padding: 8 }}>{d.student_id ?? "—"}</td>
              <td style={{ padding: 8, fontFamily: "monospace", fontSize: 11 }}>{d.api_key}</td>
              <td style={{ padding: 8 }}>{d.last_battery ?? "—"}%</td>
              <td style={{ padding: 8 }}>{d.is_active ? "✓" : "✗"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {isAdmin && (
        <form onSubmit={submit} style={{ maxWidth: 400 }}>
          <h4>Добавить устройство</h4>
          <div className="form-row">
            <label>Идентификатор</label>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Ученик</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">— не привязано —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.class_name})</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" type="submit">Создать</button>
        </form>
      )}
    </div>
  );
}

function GeofencesTab() {
  const [items, setItems] = useState<Geofence[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState("");
  const [zoneType, setZoneType] = useState("school");
  const [studentId, setStudentId] = useState<string>("");
  const [coords, setCoords] = useState("");

  async function load() {
    setItems(await api.listGeofences());
    setStudents(await api.listStudents());
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let parsed: number[][];
    try {
      parsed = JSON.parse(coords);
      if (!Array.isArray(parsed) || parsed.length < 3) throw new Error();
    } catch {
      alert("Координаты должны быть JSON-массивом [[lon,lat], ...], минимум 3 точки");
      return;
    }
    await api.createGeofence({
      name,
      zone_type: zoneType,
      coordinates: parsed,
      student_id: studentId ? Number(studentId) : null,
    });
    setName(""); setCoords(""); setStudentId("");
    load();
  }

  async function remove(id: number) {
    if (!confirm("Удалить геозону?")) return;
    await api.deleteGeofence(id);
    load();
  }

  return (
    <div>
      <h3>Геозоны</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Название</th>
            <th style={{ padding: 8 }}>Тип</th>
            <th style={{ padding: 8 }}>Ученик ID</th>
            <th style={{ padding: 8 }}>Точек</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((g) => (
            <tr key={g.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{g.name}</td>
              <td style={{ padding: 8 }}>{g.zone_type}</td>
              <td style={{ padding: 8 }}>{g.student_id ?? "общая"}</td>
              <td style={{ padding: 8 }}>{g.coordinates.length}</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => remove(g.id)} style={{ color: "#dc2626" }}>удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={submit} style={{ maxWidth: 500 }}>
        <h4>Добавить геозону</h4>
        <div className="form-row">
          <label>Название</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Тип</label>
          <select value={zoneType} onChange={(e) => setZoneType(e.target.value)}>
            <option value="school">Школа</option>
            <option value="home">Дом</option>
            <option value="route">Маршрут</option>
          </select>
        </div>
        <div className="form-row">
          <label>Ученик (для зон типа «дом»)</label>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">— общая зона —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Координаты JSON [[долгота, широта], ...]</label>
          <input
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            placeholder='[[76.928,43.238],[76.930,43.238],[76.930,43.240],[76.928,43.240]]'
            required
          />
        </div>
        <button className="btn-primary" type="submit">Создать</button>
      </form>
    </div>
  );
}

const CONTACT_TYPE_LABEL: Record<string, string> = {
  family: "Семейный (один клик)",
  sos: "SOS",
  whitelist: "Белый список",
};

function ContactsTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<number | "">("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactType, setContactType] = useState("family");
  const [number, setNumber] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function loadDevices() {
    setDevices(await api.listDevices());
  }

  async function loadContacts(id: number) {
    setContacts(await api.listContacts(id));
  }

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (typeof deviceId === "number") loadContacts(deviceId);
    else setContacts([]);
  }, [deviceId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (typeof deviceId !== "number") return;
    const sameType = contacts.filter((c) => c.contact_type === contactType);
    await api.createContact({
      device_id: deviceId,
      contact_type: contactType,
      number,
      display_name: displayName,
      serial_no: sameType.length + 1,
    });
    setNumber("");
    setDisplayName("");
    loadContacts(deviceId);
  }

  async function remove(id: number) {
    if (!confirm("Удалить контакт? Изменение применится к устройству.")) return;
    await api.deleteContact(id);
    if (typeof deviceId === "number") loadContacts(deviceId);
  }

  const groups: Record<string, Contact[]> = { family: [], sos: [], whitelist: [] };
  contacts.forEach((c) => groups[c.contact_type]?.push(c));

  return (
    <div>
      <h3>Контакты устройства</h3>
      <p style={{ color: "#64748b", fontSize: 13 }}>
        После изменения список автоматически отправляется на устройство (если оно на связи)
        командой 0x03D0 по TCP-протоколу HC02.
      </p>

      <div className="form-row" style={{ maxWidth: 400 }}>
        <label>Устройство</label>
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">— выбрать —</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.identifier} {d.imei ? `(IMEI ${d.imei})` : ""}
            </option>
          ))}
        </select>
      </div>

      {typeof deviceId === "number" && (
        <>
          {(["family", "sos", "whitelist"] as const).map((t) => (
            <div key={t} style={{ marginTop: 16 }}>
              <h4>{CONTACT_TYPE_LABEL[t]}</h4>
              {groups[t].length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>Пока пусто</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: 6 }}>#</th>
                      <th style={{ padding: 6 }}>Имя</th>
                      <th style={{ padding: 6 }}>Номер</th>
                      <th style={{ padding: 6 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups[t].map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: 6 }}>{c.serial_no}</td>
                        <td style={{ padding: 6 }}>{c.display_name}</td>
                        <td style={{ padding: 6, fontFamily: "monospace" }}>{c.number}</td>
                        <td style={{ padding: 6 }}>
                          <button onClick={() => remove(c.id)} style={{ color: "#dc2626" }}>
                            удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          <form onSubmit={add} style={{ marginTop: 20, maxWidth: 400 }}>
            <h4>Добавить контакт</h4>
            <div className="form-row">
              <label>Тип</label>
              <select value={contactType} onChange={(e) => setContactType(e.target.value)}>
                <option value="family">Семейный (один клик)</option>
                <option value="sos">SOS</option>
                <option value="whitelist">Белый список</option>
              </select>
            </div>
            <div className="form-row">
              <label>Имя (как покажется на устройстве)</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>Номер телефона</label>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="+77001234567"
                required
              />
            </div>
            <button className="btn-primary" type="submit">
              Сохранить и отправить на устройство
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const AT_WS_PROTOCOL = [
  { type: "ports", label: "Список портов" },
  { type: "open", label: "Подключиться" },
  { type: "send", label: "Отправить команду" },
  { type: "close", label: "Отключиться" },
];

interface AtMessage {
  type: string;
  data?: string;
  port?: string;
  baud?: number;
  message?: string;
  ports?: { port: string; description: string; hwid: string }[];
}

function AtTerminalTab() {
  const [tab, setTab] = useState<"terminal" | "templates" | "history" | "remote">("terminal");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<{ dir: "in" | "out" | "sys"; text: string }[]>([]);
  const [ports, setPorts] = useState<{ port: string; description: string }[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baud, setBaud] = useState(115200);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [templates, setTemplates] = useState<AtTemplate[]>([]);
  const [atHistory, setAtHistory] = useState<AtLogEntry[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [remoteImei, setRemoteImei] = useState("");
  const [remoteCmd, setRemoteCmd] = useState("");
  const [remoteResult, setRemoteResult] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((dir: "in" | "out" | "sys", text: string) => {
    setLogs((prev) => [...prev.slice(-500), { dir, text }]);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    atApi.listTemplates().then(setTemplates).catch(() => {});
    atApi.listPorts()
      .then((p) => {
        setPorts(p);
        const asr = p.find((x) => x.description.toLowerCase().includes("asr"));
        if (asr) setSelectedPort(asr.port);
        else if (p.length > 0) setSelectedPort(p[0].port);
      })
      .catch(() => {});
    atApi.getHistory().then(setAtHistory).catch(() => {});
    api.listDevices().then(setDevices).catch(() => {});
  }, []);

  function connectWs() {
    if (ws) ws.close();
    const base = WS_URL.replace(/^http/, "ws");
    const token = localStorage.getItem("token");
    const sock = new WebSocket(`${base}/api/at/ws${token ? `?token=${token}` : ""}`);

    sock.onopen = () => {
      setConnected(true);
      addLog("sys", "WebSocket connected");
      sock.send(JSON.stringify({ type: "ports" }));
    };

    sock.onmessage = (e) => {
      try {
        const msg: AtMessage = JSON.parse(e.data);
        if (msg.type === "ports" && msg.ports) {
          setPorts(msg.ports);
          const asr = msg.ports.find((x) => x.description.toLowerCase().includes("asr"));
          if (asr && !selectedPort) setSelectedPort(asr.port);
        } else if (msg.type === "opened") {
          addLog("sys", `Connected to ${msg.port} @ ${msg.baud}`);
        } else if (msg.type === "data" && msg.data) {
          addLog("in", msg.data);
        } else if (msg.type === "sent" && msg.data) {
          addLog("out", msg.data);
        } else if (msg.type === "closed") {
          addLog("sys", "Disconnected");
          setConnected(false);
        } else if (msg.type === "error" && msg.message) {
          addLog("sys", `ERROR: ${msg.message}`);
        }
      } catch { /* ignore */ }
    };

    sock.onclose = () => {
      setConnected(false);
      addLog("sys", "WebSocket closed");
      setWs(null);
    };

    sock.onerror = () => {
      addLog("sys", "WebSocket error");
    };

    setWs(sock);
  }

  function sendMsg(msg: Record<string, unknown>) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      addLog("sys", "Not connected");
    }
  }

  function handleConnect() {
    if (connected) {
      sendMsg({ type: "close" });
      ws?.close();
    } else {
      connectWs();
      setTimeout(() => {
        if (selectedPort) sendMsg({ type: "open", port: selectedPort, baud });
      }, 500);
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    sendMsg({ type: "send", data: cmd + "\r\n" });
    setCmdHistory((prev) => [cmd, ...prev].slice(0, 100));
    setHistoryIdx(-1);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const next = Math.min(historyIdx + 1, cmdHistory.length - 1);
        setHistoryIdx(next);
        setInput(cmdHistory[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx > 0) {
        const next = historyIdx - 1;
        setHistoryIdx(next);
        setInput(cmdHistory[next]);
      } else {
        setHistoryIdx(-1);
        setInput("");
      }
    }
  }

  function sendTemplate(cmd: string) {
    sendMsg({ type: "send", data: cmd + "\r\n" });
    setCmdHistory((prev) => [cmd, ...prev].slice(0, 100));
  }

  async function handleRemote(e: React.FormEvent) {
    e.preventDefault();
    if (!remoteImei || !remoteCmd) return;
    setRemoteResult("Sending...");
    try {
      const res = await atApi.remoteCommand(remoteImei, remoteCmd);
      setRemoteResult(res.ok ? `Sent to ${remoteImei}` : `Failed: ${res.reason}`);
    } catch (err: unknown) {
      setRemoteResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const isConnected = connected && ws?.readyState === WebSocket.OPEN;

  return (
    <div>
      <div className="tabs" style={{ maxWidth: 500, marginBottom: 16 }}>
        <button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}>
          Терминал
        </button>
        <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>
          Шаблоны
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          История
        </button>
        <button className={tab === "remote" ? "active" : ""} onClick={() => setTab("remote")}>
          Удалённо
        </button>
      </div>

      {tab === "terminal" && (
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "end", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Порт
              </label>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cbd5e1" }}
                disabled={isConnected}
              >
                {ports.length === 0 && <option value="">— порты не найдены —</option>}
                {ports.map((p) => (
                  <option key={p.port} value={p.port}>
                    {p.port} — {p.description}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 100 }}>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Baud
              </label>
              <select
                value={baud}
                onChange={(e) => setBaud(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cbd5e1" }}
                disabled={isConnected}
              >
                {[9600, 19200, 38400, 57600, 115200, 230400].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleConnect}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                background: isConnected ? "#dc2626" : "#1e3a8a",
                color: "white",
                height: 32,
                whiteSpace: "nowrap",
              }}
            >
              {isConnected ? "Закрыть" : "Открыть"}
            </button>
            <button
              onClick={() => sendMsg({ type: "flush" })}
              disabled={!isConnected}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid #1e3a8a",
                cursor: "pointer",
                background: "white",
                color: "#1e3a8a",
                height: 32,
                whiteSpace: "nowrap",
              }}
            >
              Flush
            </button>
            <button
              onClick={() => { setLogs([]); }}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid #94a3b8",
                cursor: "pointer",
                background: "white",
                color: "#64748b",
                height: 32,
                whiteSpace: "nowrap",
              }}
            >
              Очистить
            </button>
          </div>

          <div
            ref={logRef}
            className="at-terminal"
            style={{
              background: "#0f172a",
              color: "#e2e8f0",
              fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
              fontSize: 13,
              padding: 12,
              borderRadius: 8,
              height: 360,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.5,
            }}
          >
            {logs.length === 0 && (
              <div style={{ color: "#64748b" }}>
                <div>Выберите порт и нажмите «Открыть» для подключения к устройству.</div>
                <div style={{ marginTop: 4 }}>После подключения вводите AT-команды в поле ниже.</div>
              </div>
            )}
            {logs.map((l, i) => (
              <div
                key={i}
                style={{
                  color: l.dir === "in" ? "#4ade80" : l.dir === "out" ? "#60a5fa" : "#f59e0b",
                }}
              >
                {l.text}
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConnected ? "AT+CSQ" : "Сначала откройте порт"}
              disabled={!isConnected}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              disabled={!isConnected || !input.trim()}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                border: "none",
                background: isConnected ? "#1e3a8a" : "#94a3b8",
                color: "white",
                cursor: isConnected ? "pointer" : "default",
                fontWeight: 600,
              }}
            >
              Отправить
            </button>
          </form>
        </div>
      )}

      {tab === "templates" && (
        <div>
          <h3>Шаблоны AT-команд</h3>
          <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
            Нажмите на команду, чтобы отправить её в терминал.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 8 }}>
            {templates.length === 0 && <div style={{ color: "#64748b" }}>Загрузка...</div>}
            {templates.map((t, i) => (
              <button
                key={i}
                onClick={() => {
                  if (isConnected) sendTemplate(t.command);
                  else setInput(t.command);
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  background: "white",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                title={`Отправить: ${t.command}`}
              >
                <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace", color: "#1e3a8a" }}>
                  {t.command}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{t.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div>
          <h3>История AT-команд</h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "end" }}>
            <div style={{ minWidth: 200 }}>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Устройство
              </label>
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : undefined;
                  atApi.getHistory(id).then(setAtHistory).catch(() => {});
                }}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cbd5e1" }}
              >
                <option value="">Все устройства</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.identifier} ({d.imei})</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => atApi.getHistory().then(setAtHistory).catch(() => {})}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid #1e3a8a",
                cursor: "pointer",
                background: "white",
                color: "#1e3a8a",
                height: 32,
              }}
            >
              Обновить
            </button>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {atHistory.length === 0 && (
              <div style={{ color: "#64748b", fontSize: 13 }}>История пуста</div>
            )}
            {atHistory.map((h) => (
              <div
                key={h.id}
                style={{
                  padding: "8px 12px",
                  marginBottom: 6,
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  background: h.success ? "#f0fdf4" : "#fef2f2",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    background: h.source === "remote" ? "#dbeafe" : "#f3e8ff",
                    color: h.source === "remote" ? "#1d4ed8" : "#7c3aed",
                  }}>
                    {h.source === "remote" ? "TCP" : "Serial"}
                  </span>
                  <span style={{ color: "#64748b", fontSize: 11 }}>
                    {new Date(h.created_at).toLocaleString()}
                  </span>
                  {h.device_id && (
                    <span style={{ color: "#64748b", fontSize: 11 }}>
                      device #{h.device_id}
                    </span>
                  )}
                </div>
                <div style={{ color: "#1e3a8a", fontWeight: 600 }}>{'>'} {h.command}</div>
                {h.response && (
                  <div style={{ color: h.success ? "#16a34a" : "#dc2626", marginTop: 2, whiteSpace: "pre-wrap" }}>
                    {h.response}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "remote" && (
        <div>
          <h3>Удалённая AT-команда через TCP</h3>
          <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
            Отправить AT-команду на устройство, которое уже на связи с сервером.
            <br />
            <strong>Важно:</strong> требует прошивки трекера с поддержкой протокола 0x10FF.
          </p>

          <form onSubmit={handleRemote} style={{ maxWidth: 500 }}>
            <div className="form-row">
              <label>Устройство (IMEI)</label>
              <select value={remoteImei} onChange={(e) => setRemoteImei(e.target.value)} required>
                <option value="">— выбрать —</option>
                {devices.filter((d) => d.imei).map((d) => (
                  <option key={d.id} value={d.imei!}>
                    {d.identifier} (IMEI: {d.imei})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>AT-команда</label>
              <input
                value={remoteCmd}
                onChange={(e) => setRemoteCmd(e.target.value)}
                placeholder="AT+CSQ"
                style={{ fontFamily: "monospace" }}
                required
              />
            </div>
            <div className="form-row" style={{ display: "flex", gap: 8 }}>
              {["AT", "AT+CSQ", "AT+CGATT?", "AT+CPIN?", "AT+CREG?"].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => setRemoteCmd(cmd)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: 11,
                  }}
                >
                  {cmd}
                </button>
              ))}
            </div>
            <button className="btn-primary" type="submit" style={{ maxWidth: 200 }}>
              Отправить
            </button>
          </form>

          {remoteResult && (
            <div style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              fontFamily: "monospace",
              fontSize: 13,
            }}>
              {remoteResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const [items, setItems] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("parent");

  async function load() {
    setItems(await api.listUsers());
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.createUser({ email, password, full_name: fullName, role });
    setEmail(""); setPassword(""); setFullName(""); setRole("parent");
    load();
  }

  return (
    <div>
      <h3>Пользователи</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
            <th style={{ padding: 8 }}>ID</th>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>ФИО</th>
            <th style={{ padding: 8 }}>Роль</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{u.id}</td>
              <td style={{ padding: 8 }}>{u.email}</td>
              <td style={{ padding: 8 }}>{u.full_name}</td>
              <td style={{ padding: 8 }}>{u.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={submit} style={{ maxWidth: 400 }}>
        <h4>Добавить пользователя</h4>
        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Пароль</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>ФИО</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Роль</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="parent">Родитель</option>
            <option value="school">Школа</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
        <button className="btn-primary" type="submit">Создать</button>
      </form>
    </div>
  );
}
