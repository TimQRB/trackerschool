import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents } from "react-leaflet";
import { Link } from "react-router-dom";
import { api, atApi, Contact, Device, Geofence, School, Student, User } from "../api";
import { WS_URL } from "../api";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Props {
  user: User;
  onLogout: () => void;
}

type Tab = "students" | "devices" | "geofences" | "contacts" | "users" | "at" | "schools";

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
          {user.role === "admin" && (
            <button className={tab === "schools" ? "active" : ""} onClick={() => setTab("schools")}>
              Школы
            </button>
          )}
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
          {tab === "students" && <StudentsTab user={user} />}
          {tab === "devices" && <DevicesTab isAdmin={user.role === "admin"} />}
          {tab === "geofences" && <GeofencesTab user={user} />}
          {tab === "contacts" && <ContactsTab />}
          {tab === "at" && <AtTerminalTab />}
          {tab === "users" && <UsersTab />}
          {tab === "schools" && <SchoolsTab />}
        </div>
      </div>
    </div>
  );
}

export function StudentsTab({ user }: { user: User }) {
  const [items, setItems] = useState<Student[]>([]);
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [parents, setParents] = useState<User[]>([]);
  const [schoolId, setSchoolId] = useState<string>("");
  const [schools, setSchools] = useState<School[]>([]);
  const [importSchoolId, setImportSchoolId] = useState<string>("");

  
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("");

  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  async function load() {
    try {
      const studs = await api.listStudents();
      setItems(studs);
      
      const allSchools = await api.listSchools();
      setSchools(allSchools);

      const allUsers = await api.listUsers();
      if (user.role === "school") {
        const schoolParents = allUsers.filter(u => 
          u.role === "parent" && 
          studs.some(s => s.parent_id === u.id && s.school_id === user.school_id)
        );
        setParents(schoolParents);
      } else {
        setParents(allUsers.filter(u => u.role === "parent"));
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (user.role === "school" && user.school_id) {
      const idStr = String(user.school_id);
      setSchoolId(idStr);
      setImportSchoolId(idStr);
    }
    load();
  }, [user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedClass, pageSize]);

  const uniqueClasses = Array.from(new Set(items.map((s) => s.class_name))).filter(Boolean).sort();

  const filteredItems = items.filter((student) => {
    const matchesSearch = student.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === "" || student.class_name === selectedClass;
    return matchesSearch && matchesClass;
  });

  const totalItems = filteredItems.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const currentIds = paginatedItems.map((s) => s.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    } else {
      const currentIds = paginatedItems.map((s) => s.id);
      setSelectedIds((prev) => prev.filter((id) => !currentIds.includes(id)));
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    const confirmDelete = window.confirm(`Вы уверены, что хотите удалить выбранных учеников (${selectedIds.length} шт.)?`);
    if (!confirmDelete) return;

    setDeleting(true);
    try {
      const res = await api.bulkDeleteStudents(selectedIds);
      alert(res.message || "Выбранные ученики успешно удалены");
      setSelectedIds([]);
      await load();
    } catch (err) {
      alert(`Ошибка при удалении: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !cls.trim()) return;
    
    setSubmitting(true);
    try {
      await api.createStudent({
        full_name: name.trim(),
        class_name: cls.trim(),
        parent_id: parentId ? Number(parentId) : null,
        school_id: schoolId ? Number(schoolId) : null,
      });
      setName(""); 
      setCls(""); 
      setParentId("");
      setSchoolId("");
      await load();
    } catch (err) {
      alert(`Ошибка при создании ученика: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!importSchoolId) {
      alert("Пожалуйста, выберите школу перед импортом CSV файла!");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const res = await api.importStudentsCSV(file, importSchoolId);
      alert(res.message || "Импорт успешно завершен!");
      await load();
    } catch (err) {
      alert(`Ошибка импорта: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function downloadCsvTemplate() {
    const headers = "full_name,class_name,parent_email";
    const rows = [
      "Иванов Алексей Петрович,5А,parent@safemektep.kz",
      "Петрова Мария Сергеевна,3Б,parent@safemektep.kz"
    ];
    
    const csvContent = "\uFEFF" + headers + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "students_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const isAllOnPageSelected = paginatedItems.length > 0 && paginatedItems.every((s) => selectedIds.includes(s.id));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#1e293b", padding: "8px 0" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Управление учениками</h3>
        
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={downloadCsvTemplate}
            style={{
              padding: "8px 14px",
              background: "#ffffff",
              color: "#475569",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            📋 Шаблон CSV
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user.role === "admin" && (
              <select
                value={importSchoolId}
                onChange={(e) => setImportSchoolId(e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, background: "white", fontWeight: 600 }}
              >
                <option value="">— Выберите школу для импорта —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <label style={{ 
                padding: "8px 14px", 
                background: !importSchoolId ? "#94a3b8" : "#1e3a8a", 
                color: "white", borderRadius: 8, 
                cursor: uploading || !importSchoolId ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 600 
            }}>
              {uploading ? "⏳ Загрузка..." : "📥 Импорт из CSV"}
              <input type="file" accept=".csv" onChange={handleCsvUpload} disabled={uploading || !importSchoolId} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input 
          type="text"
          placeholder="🔍 Поиск по ФИО ученика..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, minWidth: 260, outline: "none" }}
        />

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, background: "white", outline: "none" }}
        >
          <option value="">Все классы</option>
          {uniqueClasses.map((c) => (
            <option key={c} value={c}>{c} класс</option>
          ))}
        </select>

        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={deleting}
            style={{
              padding: "8px 14px",
              background: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.6 : 1,
              marginLeft: "auto"
            }}
          >
            🗑️ Удалить выбранных ({selectedIds.length})
          </button>
        )}
      </div>

      <div style={{ background: "white", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden", border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "14px 16px", width: 40 }}>
                <input type="checkbox" checked={isAllOnPageSelected} onChange={handleSelectAll} style={{ cursor: "pointer" }} />
              </th>
              <th style={{ padding: "14px 16px", fontWeight: 600, color: "#475569" }}>ФИО ученика</th>
              <th style={{ padding: "14px 16px", fontWeight: 600, color: "#475569" }}>Класс</th>
              <th style={{ padding: "14px 16px", fontWeight: 600, color: "#475569" }}>Устройство</th>
              <th style={{ padding: "14px 16px", fontWeight: 600, color: "#475569" }}>Родитель (Email)</th>
              <th style={{ padding: "14px 16px", fontWeight: 600, color: "#475569" }}>Школа</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                  Никого не найдено по заданным фильтрам.
                </td>
              </tr>
            ) : (
              paginatedItems.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(s.id)} 
                      onChange={(e) => handleSelectOne(s.id, e.target.checked)} 
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "14px 16px", fontWeight: 500, color: "#1e293b" }}>{s.full_name}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                      {s.class_name}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", color: s.device ? "#0f172a" : "#94a3b8" }}>
                    {s.device ? ` ${s.device.identifier}` : "—"}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#334155" }}>
                    {s.parent_email ? ` ${s.parent_email}` : s.parent_id ? `ID: ${s.parent_id}` : <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>не указан</span>}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#334155" }}>
                    {s.school_id ? (schools.find((sch) => sch.id === s.school_id)?.name || `ID: ${s.school_id}`) : <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>не указана</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
            <span>Показывать по:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 6, background: "white" }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
            <span>из {totalItems} строк</span>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              style={{ padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "white", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1, fontSize: 13 }}
            >
              ◀ Назад
            </button>
            <span style={{ alignSelf: "center", fontSize: 13, color: "#334155", padding: "0 8px" }}>
              Страница {currentPage} из {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{ padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "white", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1, fontSize: 13 }}
            >
              Вперед ▶
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, maxWidth: 600, marginTop: 24 }}>
        <h4 style={{ margin: "0 0 14px 0", fontSize: 15, fontWeight: 600 }}>➕ Быстрое добавление нового ученика</h4>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>ФИО ученика *</label>
              <input type="text" placeholder="Иванов Иван Иванович" value={name} onChange={(e) => setName(e.target.value)} required style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>Класс *</label>
              <input type="text" placeholder="11Б" value={cls} onChange={(e) => setCls(e.target.value)} required style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
            </div>
          </div>
          {user.role === "admin" && (
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Школа (Привязка)</label>
              <select 
                value={schoolId} 
                onChange={(e) => setSchoolId(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "white" }}
              >
                <option value="">— Не выбрана (Общая) —</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>Родитель</label>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white" }}>
              <option value="">— Оставить без родителя —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting} style={{ padding: "10px", background: "#1e3a8a", color: "white", border: "none", borderRadius: 8, width: "100%", fontWeight: 600, opacity: submitting ? 0.6 : 1, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Создание..." : "Создать ученика"}
          </button>
        </form>
      </div>

    </div>
  );
}

export function SchoolsTab() {
  const [items, setItems] = useState<School[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const data = await api.listSchools();
      setItems(data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.createSchool({ name, address });
      setName(""); setAddress("");
      load();
    } catch (err) {
      alert("Ошибка при создании школы");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Удалить школу? Это может затронуть привязанных учеников!")) return;
    try {
      await api.deleteSchool(id);
      load();
    } catch (err) {
      alert("Не удалось удалить школу");
    }
  }

  return (
    <div style={{ padding: "20px" }}>
      <h3 style={{ marginBottom: "20px" }}>Управление школами</h3>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: "24px" }}>
        <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "12px 16px" }}>ID</th>
                <th style={{ padding: "12px 16px" }}>Название</th>
                <th style={{ padding: "12px 16px" }}>Адрес</th>
                <th style={{ padding: "12px 16px" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{s.id}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: "12px 16px" }}>{s.address || "—"}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <button onClick={() => remove(s.id)} style={{ color: "#ef4444", border: "none", background: "none", cursor: "pointer" }}>Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={submit} style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", height: "fit-content" }}>
          <h4 style={{ marginTop: 0 }}>Добавить школу</h4>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Название</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Адрес</label>
            <input value={address} onChange={e => setAddress(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px", background: "#2563eb", color: "white", border: "none", borderRadius: "6px", fontWeight: 600 }}>
            {loading ? "Сохранение..." : "Создать школу"}
          </button>
        </form>
      </div>
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

function GeofencesTab({ user }: { user: User }){
  const [items, setItems] = useState<Geofence[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState("");
  const [zoneType, setZoneType] = useState("school");
  const [studentId, setStudentId] = useState<string>("");
  const [coords, setCoords] = useState("");
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [targetSchoolId, setSchoolId] = useState<string>("");
  const [schools, setSchools] = useState<School[]>([]);

  async function load() {
    try {
      setItems(await api.listGeofences());
      setStudents(await api.listStudents());
      setSchools(await api.listSchools());
    } catch (err) {
      console.error("Ошибка загрузки данных:", err);
    }
  }
  useEffect(() => { load(); }, []);

  function MapClickHandler() {
    useMapEvents({
      click(e) {
        setDrawnPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
      },
    });
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (drawnPoints.length < 3) {
      alert("Пожалуйста, поставьте минимум 3 точки на карте, чтобы образовать геозону!");
      return;
    }

    // (модуль Shapely/PostGIS) ждет координаты в формате [[долгота, широта], ...]
    // А Leaflet хранит как [широта, долгота]. При отправке меняем их местами: [lon, lat]
    const formattedCoordinates = drawnPoints.map((p) => [p[1], p[0]]);

    try {
      await api.createGeofence({
        name,
        zone_type: zoneType,
        coordinates: formattedCoordinates,
        student_id: studentId ? Number(studentId) : null,
        school_id: targetSchoolId ? Number(targetSchoolId) : null,
      });
      setName("");
      setStudentId("");
      setSchoolId("");
      setDrawnPoints([]);
      load();
      alert("Геозона успешно создана!");
    } catch (err: any) {
      console.error(err);
      alert("Ошибка при создании геозоны на бэкенде");
    }
  }

  async function remove(id: number) {
    if (!confirm("Удалить геозону?")) return;
    try {
      await api.deleteGeofence(id);
      load();
    } catch (err) {
      alert("Не удалось удалить геозону");
    }
  }

  return (
    <div style={{ padding: "20px" }}>
      <h3 style={{ marginBottom: "16px", color: "#1e293b" }}>Управление Геозонами</h3>      
      <div style={{ background: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden", marginBottom: "30px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
              <th style={{ padding: "12px 16px", color: "#64748b", fontWeight: 600 }}>Название</th>
              <th style={{ padding: "12px 16px", color: "#64748b", fontWeight: 600 }}>Тип</th>
              <th style={{ padding: "12px 16px", color: "#64748b", fontWeight: 600 }}>Область видимости</th>
              <th style={{ padding: "12px 16px", color: "#64748b", fontWeight: 600 }}>Кол-во точек</th>
              <th style={{ padding: "12px 16px" }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>Геозоны еще не созданы</td>
              </tr>
            )}
            {items.map((g) => (
              <tr key={g.id} style={{ borderBottom: "1px solid #e2e8f0", fill: "none" }}>
                <td style={{ padding: "12px 16px", fontWeight: 500 }}>{g.name}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "12px", background: g.zone_type === "school" ? "#dbeafe" : "#fef08a", color: g.zone_type === "school" ? "#1e40af" : "#854d0e" }}>
                    {g.zone_type === "school" ? "Школа" : g.zone_type === "home" ? "Дом" : "Маршрут"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>
                  {g.student_id ? (
                    (() => {
                      const foundStudent = students.find((s) => s.id === g.student_id);
                      return (
                        <span style={{ color: "#1e293b", fontWeight: 500 }}>
                          👤 Личная: {foundStudent ? foundStudent.full_name : `Ученик (ID: ${g.student_id})`}
                        </span>
                      );
                    })()
                  ) : (
                    <span style={{ color: "#2563eb", fontWeight: 500 }}>
                      🌍 Общая зона: {schools.find(s => s.id === g.school_id)?.name || `Школа (ID: ${g.school_id})`}
                    </span>
                  )}
                </td>
                <td style={{ padding: "12px 16px" }}>{g.coordinates.length} точек</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <button 
                    onClick={() => remove(g.id)} 
                    style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: 600 }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "24px", alignItems: "start" }}>        
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#475569" }}>
            🗺️ Кликните по карте минимум 3 раза, чтобы построить границы зоны:
          </div>
          <div style={{ height: "450px", width: "100%", borderRadius: "8px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
            <MapContainer 
              center={[43.238, 76.928]} // Дефолтный центр
              zoom={14} 
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <MapClickHandler />
              {drawnPoints.map((pt, idx) => (
                <Marker key={idx} position={pt} />
              ))}

              {drawnPoints.length > 1 && (
                <Polygon 
                  positions={drawnPoints} 
                  pathOptions={{ color: zoneType === "school" ? "#2563eb" : "#eab308", fillColor: zoneType === "school" ? "#3b82f6" : "#fef08a", fillOpacity: 0.4 }} 
                />
              )}

              {items.map((fence) => {
                const leafletCoords = fence.coordinates.map(c => [c[1], c[0]] as [number, number]);
                return (
                  <Polygon
                    key={fence.id}
                    positions={leafletCoords}
                    pathOptions={{ color: "#94a3b8", dashArray: "5, 5", fillOpacity: 0.1 }}
                  />
                );
              })}
            </MapContainer>
          </div>
          {drawnPoints.length > 0 && (
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button 
                type="button" 
                onClick={() => {
                  setDrawnPoints((prev) => prev.slice(0, -1));
                }}
                style={{ padding: "6px 12px", background: "#f59e0b", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
              >
                ↩️ Удалить последнюю точку
              </button>

              <button 
                type="button" 
                onClick={() => setDrawnPoints([])}
                style={{ padding: "6px 12px", background: "#ef4444", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
              >
                🗑️ Сбросить все точки
              </button>
            </div>
          )}
        </div>
        <form onSubmit={submit} style={{ background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <h4 style={{ margin: "0 0 16px 0", color: "#1e293b" }}>Параметры зоны</h4>
          
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Название</label>
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Например: Территория школы №42"
              required 
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Тип зоны</label>
            <select 
              value={zoneType} 
              onChange={(e) => setZoneType(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "white" }}
            >
              <option value="school">Школа</option>
              <option value="home">Дом</option>
              <option value="route">Маршрут</option>
            </select>
          </div>

          {user.role === "admin" && (
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                Привязать к школе
              </label>
              <select 
                value={targetSchoolId} 
                onChange={(e) => setSchoolId(e.target.value)}
                required={!studentId}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "white" }}
              >
                <option value="">— Выберите школу —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id.toString()}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
              Ученик (если зона личная)
            </label>
            <select 
              value={studentId} 
              onChange={(e) => setStudentId(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "white" }}
            >
              <option value="">— Общая зона школы (все ученики) —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id.toString()}>
                  {s.full_name} ({s.class_name})
                </option>
              ))}
            </select>
          </div>
          <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Выбрано точек на карте: <strong style={{ color: "#1e293b" }}>{drawnPoints.length}</strong>
              {drawnPoints.length < 3 && " (нужно минимум 3)"}
            </span>
          </div>
          <button 
            className="btn-primary" 
            type="submit"
            disabled={drawnPoints.length < 3}
            style={{ width: "100%", padding: "10px", background: drawnPoints.length < 3 ? "#94a3b8" : "#2563eb", color: "white", border: "none", borderRadius: "6px", fontWeight: 600, cursor: drawnPoints.length < 3 ? "not-allowed" : "pointer" }}
          >
            Сохранить геозону
          </button>
        </form>
      </div>
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
  host?: string;
  tcpPort?: number;
  mode?: string;
  message?: string;
  ports?: { port: string; description: string; hwid: string }[];
}

function AtTerminalTab() {
  const [tab, setTab] = useState<"terminal" | "templates" | "history" | "remote">("terminal");
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connMode, setConnMode] = useState<"serial" | "tcp">("serial");
  const [logs, setLogs] = useState<{ dir: "in" | "out" | "sys"; text: string }[]>([]);
  const [ports, setPorts] = useState<{ port: string; description: string }[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baud, setBaud] = useState(115200);
  const [tcpHost, setTcpHost] = useState("127.0.0.1");
  const [tcpPort, setTcpPort] = useState("9999");
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

  function sendMsg(msg: Record<string, unknown>) {
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(msg));
    } else {
      addLog("sys", "Not connected");
    }
  }

  function connectThenSend(connectMsg: Record<string, unknown>) {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const base = WS_URL.replace(/^http/, "ws");
    const token = localStorage.getItem("token");
    const sock = new WebSocket(`${base}/api/at/ws${token ? `?token=${token}` : ""}`);

    sock.onopen = () => {
      setConnected(true);
      addLog("sys", "WebSocket connected");
      sock.send(JSON.stringify(connectMsg));
    };

    sock.onmessage = (e) => {
      try {
        const msg: AtMessage = JSON.parse(e.data);
        if (msg.type === "ports" && msg.ports) {
          setPorts(msg.ports);
          const asr = msg.ports.find((x) => x.description.toLowerCase().includes("asr"));
          if (asr && !selectedPort) setSelectedPort(asr.port);
        } else if (msg.type === "opened") {
          if (msg.mode === "tcp") {
            addLog("sys", `Connected to TCP ${msg.host}:${msg.tcpPort}`);
          } else {
            addLog("sys", `Connected to ${msg.port} @ ${msg.baud}`);
          }
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
      wsRef.current = null;
    };

    sock.onerror = () => {
      addLog("sys", "WebSocket error");
    };

    wsRef.current = sock;
  }

  function handleConnect() {
    if (connected) {
      sendMsg({ type: "close" });
      if (wsRef.current) wsRef.current.close();
    } else {
      if (connMode === "serial" && selectedPort) {
        connectThenSend({ type: "open", port: selectedPort, baud });
      } else {
        connectThenSend({ type: "connect_tcp", host: tcpHost, port: Number(tcpPort) });
      }
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

  const isConnected = connected && wsRef.current?.readyState === WebSocket.OPEN;

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
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Тип подключения
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setConnMode("serial")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    cursor: "pointer",
                    background: connMode === "serial" ? "#1e3a8a" : "white",
                    color: connMode === "serial" ? "white" : "#1a202c",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  disabled={isConnected}
                >
                  Serial
                </button>
                <button
                  onClick={() => setConnMode("tcp")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    cursor: "pointer",
                    background: connMode === "tcp" ? "#1e3a8a" : "white",
                    color: connMode === "tcp" ? "white" : "#1a202c",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  disabled={isConnected}
                >
                  TCP
                </button>
              </div>
            </div>

            {connMode === "serial" ? (
              <>
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
              </>
            ) : (
              <>
                <div style={{ width: 160 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                    Хост
                  </label>
                  <input
                    value={tcpHost}
                    onChange={(e) => setTcpHost(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cbd5e1", fontFamily: "monospace" }}
                    disabled={isConnected}
                  />
                </div>
                <div style={{ width: 80 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                    Порт
                  </label>
                  <input
                    value={tcpPort}
                    onChange={(e) => setTcpPort(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cbd5e1", fontFamily: "monospace" }}
                    disabled={isConnected}
                  />
                </div>
              </>
            )}

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
  const [schools, setSchools] = useState<School[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("parent");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");

  async function load() {
    const [u, s] = await Promise.all([
      api.listUsers(),
      api.listSchools()
    ]);
    setItems(u);
    setSchools(s);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createUser({ 
        email, 
        password, 
        full_name: fullName, 
        role,
        school_id: role === "school" ? Number(selectedSchoolId) : null 
      });
      setEmail(""); setPassword(""); setFullName(""); setRole("parent"); setSelectedSchoolId("");
      load();
      alert("Пользователь создан");
    } catch (err: any) {
      alert("Ошибка: " + err.message);
    }
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

      <form onSubmit={submit} style={{ maxWidth: 400, background: "#f8fafc", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <h4>Добавить пользователя</h4>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1" }} />
        </div>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Пароль</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1" }} />
        </div>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600 }}>ФИО</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1" }} />
        </div>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Роль</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1" }}>
            <option value="parent">Родитель</option>
            <option value="school">Школьный администратор</option>
            <option value="admin">Системный администратор</option>
          </select>
        </div>
        {role === "school" && (
          <div className="form-row">
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#2563eb" }}>Привязать к организации (Школе)</label>
            <select 
              value={selectedSchoolId} 
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              required
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "2px solid #3b82f6" }}
            >
              <option value="">— Выберите школу из списка —</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <button className="btn-primary" type="submit">
          Создать аккаунт
        </button>
      </form>
    </div>
  );
}
