import { useState } from "react";
import { useNavigate } from "react-router-dom"; // Импортируем навигацию
import { api, setToken, User } from "../api";

interface Props {
  onLogin: (u: User) => void;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("admin@safemektep.kz");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate(); // Инициализируем хук

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setToken(res.access_token);

      // ВАЖНО: Всегда получаем полные данные юзера и обновляем состояние App.tsx
      const me = await api.me();
      onLogin(me); // Теперь App.tsx будет знать, что юзер вошел

      if (res.must_change_password) {
        navigate("/onboarding", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e: any) {
      setErr(e.message || "Неверный email или пароль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={submit}>
        <h2>SafeMektep</h2>
        <div className="hint">Вход в систему отслеживания</div>

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {err && <div className="error">{err}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Вход..." : "Войти"}
        </button>

        <div className="demo-creds">
          <div>Демо-аккаунты:</div>
          <div>Админ: <code>admin@safemektep.kz</code> / <code>admin123</code></div>
          <div>Школа: <code>school@safemektep.kz</code> / <code>school123</code></div>
          <div>Родитель: <code>parent@safemektep.kz</code> / <code>parent123</code></div>
        </div>
      </form>
    </div>
  );
}