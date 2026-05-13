import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Contact, Device, Geofence, Student, User } from "../api";

interface Props {
  user: User;
  onLogout: () => void;
}

type Tab = "students" | "devices" | "geofences" | "contacts" | "users";

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
