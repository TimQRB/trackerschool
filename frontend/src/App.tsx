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
      <Route path="/onboarding" element={<Onboarding onLogin={setUser} />} />
      <Route
        path="/"
        element={
          user ? (
            <Dashboard user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/admin"
        element={
          user && (user.role === "admin" || user.role === "school") ? (
            <Admin user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/" />
          )
        }
      />
    </Routes>
  );
}
