import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, clearToken, User } from "./api";
import Login from "./pages/Login";
import Onboarding from "./components/Onboarding";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate("/login");
  }

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" /> : <Login onLogin={setUser} />}
      />
      <Route
        path="/onboarding"
        element={
          // 1. Если пользователь вообще не залогинен — отправляем на вход
          !user ? (
            <Navigate to="/login" />
          ) : 
          // 2. Если он залогинен и УЖЕ прошел онбординг — отправляем на главную
          user.is_onboarded ? (
            <Navigate to="/" />
          ) : (
            // 3. Только если он залогинен, но еще не прошел онбординг — показываем страницу
            <Onboarding onLogin={setUser} />
          )
        }
      />
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" />
          ) : user.is_onboarded === false ? ( // Если это новый родитель, который не прошел онбординг
            <Navigate to="/onboarding" />
          ) : (
            <Dashboard user={user} onLogout={handleLogout} />
          )
        }
      />
      <Route
        path="/admin"
        element={
          // Сюда пускаем только если юзер залогинен И он не находится в процессе онбординга
          user && user.is_onboarded !== false && (user.role === "admin" || user.role === "school") ? (
            <Admin user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/" />
          )
        }
      />
    </Routes>
  );
}
