import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, User } from "../api";

interface Props {
  onLogin: (u: User) => void;
}

export default function Onboarding({ onLogin }: Props) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    // Валидация на клиенте
    if (password.length < 6) {
      setErr("Пароль должен быть не менее 6 символов");
      return;
    }

    if (password !== confirmPassword) {
      setErr("Пароли не совпадают");
      return;
    }

    setLoading(true);
    try {
      // 1. Отправляем новые данные на бэкенд (токен подставится автоматически в функции request)
      await api.completeOnboarding(fullName, password);

      // 2. Получаем актуальный профиль обновленного пользователя
      const me = await api.me();
      
      // 3. Авторизуем в основном приложении
      onLogin(me);

      navigate("/", { replace: true });
      
      // 4. Редиректим на главную страницу / дашборд
      navigate("/");
    } catch (e: any) {
      setErr(e.message || "Произошла ошибка при сохранении профиля");
      console.error("Onboarding error:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={submit}>
        <h2>Добро пожаловать в SafeMektep!</h2>
        <div className="hint" style={{ marginBottom: "20px", color: "#666" }}>
          Ваш аккаунт был создан администратором. Для продолжения, пожалуйста, заполните профиль и смените временный пароль на постоянный.
        </div>

        <label>Ваше Полное Имя (ФИО)</label>
        <input 
          placeholder="Например: Касымов Ержан" 
          value={fullName} 
          onChange={(e) => setFullName(e.target.value)} 
          required 
        />

        <label>Новый постоянный пароль</label>
        <input
          type="password"
          placeholder="Минимум 6 символов"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label>Подтвердите пароль</label>
        <input
          type="password"
          placeholder="Повторите пароль"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        {err && <div className="error" style={{ color: "red", marginTop: "10px" }}>{err}</div>}

        <button type="submit" disabled={loading} style={{ marginTop: "20px" }}>
          {loading ? "Сохранение..." : "Сохранить и войти"}
        </button>
      </form>
    </div>
  );
}