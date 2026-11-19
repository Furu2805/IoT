import { useState } from "react";
import { post } from "../lib/api.js";
import { Icon, ErrorMessage } from "./Common.jsx";

/** CHECK LOGIN (flow 0): Màn hình đăng nhập; Enter/nút gửi credentials để App nhận JWT. */
export default function Login({ onLogin }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  /** CHECK LOGIN (flow 0): Gửi credentials, nhận JWT và gọi callback của App nếu hợp lệ. */
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post("/auth/login", {
        username: username.trim(),
        password: password.trim(),
      });
      if (!result.token) throw new Error("Backend không trả về access token.");
      onLogin(result.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div id="login-page">
      <form className="login-card" onSubmit={submit}>
        <h2>
          <Icon name="microchip" className="text-primary me-2" />
          Sensor Monitor
        </h2>
        <p>Đăng nhập để quản lý hệ thống IoT</p>
        <input
          id="username"
          aria-label="Tên đăng nhập"
          autoComplete="username"
          placeholder="Tên đăng nhập"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <input
          id="password"
          aria-label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          placeholder="Mật khẩu"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
        <ErrorMessage>{error}</ErrorMessage>
      </form>
    </div>
  );
}
