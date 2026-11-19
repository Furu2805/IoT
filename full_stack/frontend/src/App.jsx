import { useEffect, useState } from "react";
import {
  api,
  clearAccessToken,
  getAccessToken,
  saveAccessToken,
} from "./lib/api.js";
import { defaultProfile } from "./lib/data.js";
import { useIot } from "./hooks/useIot.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import { ActionHistory, SensorData } from "./components/DataTables.jsx";
import Profile from "./components/Profile.jsx";
import { Icon } from "./components/Common.jsx";

// Mỗi mục gồm khóa tab, tên hiển thị và tên icon Font Awesome của sidebar.
const menu = [
  ["dashboard", "Dashboard", "th-large"],
  ["sensor", "Sensor Data", "table"],
  ["action", "Action History", "history"],
  ["profile", "Profile", "user"],
];
const ACTIVE_TAB_KEY = "iot_active_tab";

// CHECK LOGIN (flow 0): Chọn tab khởi đầu từ URL hash hoặc tab đã lưu.
function readActiveTab() {
  const hashTab = window.location.hash.slice(1);
  if (menu.some(([id]) => id === hashTab)) return hashTab;
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    return menu.some(([id]) => id === saved) ? saved : "dashboard";
  } catch {
    return "dashboard";
  }
}

/** Đọc hồ sơ đã lưu an toàn; JSON lỗi không làm hỏng màn hình đăng nhập. */
function readProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem("user_profile"));
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? { ...defaultProfile, ...saved }
      : null;
  } catch {
    return null;
  }
}

/** CHECK LOGIN (flow 0): Cổng vào ứng dụng; token quyết định hiện Login hay các màn hình chính. */
export default function App() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getAccessToken())),
    [tab, setTab] = useState(readActiveTab);
  const [profile, setProfile] = useState(() => readProfile() || defaultProfile);
  // CHECK LOGIN (flow 0): Chỉ khởi động kết nối IoT sau đăng nhập.
  // DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: useIot tải snapshot, ngưỡng và lịch sử biểu đồ.
  const iot = useIot(authenticated);
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      // The selected page still works if browser storage is unavailable.
    }
    const url = `${window.location.pathname}${window.location.search}#${tab}`;
    window.history.replaceState(null, "", url);
  }, [tab]);
  // CHECK LOGIN (flow 0): API báo 401 sẽ phát event này để App quay về Login.
  useEffect(() => {
    const onAuthExpired = () => setAuthenticated(false);
    window.addEventListener("iot-auth-expired", onAuthExpired);
    return () => window.removeEventListener("iot-auth-expired", onAuthExpired);
  }, []);
  /** Tải hồ sơ từ backend khi người dùng đăng nhập và chưa có hồ sơ lưu cục bộ. */
  useEffect(() => {
    if (!authenticated || readProfile()) return;
    const controller = new AbortController();
    api("/user/profile", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setProfile({
            ...defaultProfile,
            fullname: data.full_name || defaultProfile.fullname,
            studentid: data.student_id || defaultProfile.studentid,
            className: data.class || defaultProfile.className,
            username: data.username || defaultProfile.username,
            github: data.links?.github || defaultProfile.github,
            figma: data.links?.figma || defaultProfile.figma,
            api: data.links?.api_docs || defaultProfile.api,
            pdf: data.links?.report_pdf || defaultProfile.pdf,
          });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [authenticated]);
  // CHECK LOGIN (flow 0): Login trả JWT; lưu token rồi bật authenticated để render app.
  if (!authenticated)
    return (
      <Login
        onLogin={(token) => {
          // CHECK LOGIN (flow 0): Callback nhận JWT từ Login và mở Dashboard sau xác thực.
          saveAccessToken(token);
          setTab("dashboard");
          setAuthenticated(true);
        }}
      />
    );
  return (
    <div id="app-container" className="react-app">
      <aside className="sidebar">
        <div className="logo">
          <Icon name="microchip" />
          Sensor Monitor
        </div>
        <nav className="menu" aria-label="Menu chính">
          {/* Mỗi nút đổi tab; các trang vẫn được giữ mount để bảo toàn bộ lọc đang nhập. */}
          {menu.map(([id, label, icon]) => (
            <button
              type="button"
              key={id}
              className={`menu-item ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{profile.fullname?.charAt(0) || "L"}</div>
          <div className="info">
            <div className="name">{profile.fullname}</div>
            <div className="role">admin</div>
          </div>
          {/* Đăng xuất đưa ứng dụng về màn hình Login và dọn socket IoT. */}
          <button
            type="button"
            className="logout-btn"
            aria-label="Đăng xuất"
            onClick={() => {
              clearAccessToken();
              setAuthenticated(false);
            }}
          >
            <Icon name="sign-out-alt" />
          </button>
        </div>
      </aside>
      <main className="main-content">
        {/* CHECK LOGIN (flow 0): Giữ các màn đã mount; tab chỉ đổi hiển thị và active điều khiển fetch bảng. */}
        <section
          id="dashboard-page"
          className={`page-content ${tab === "dashboard" ? "active" : ""}`}
        >
          <Dashboard iot={iot} />
        </section>
        <section
          id="sensor-page"
          className={`page-content ${tab === "sensor" ? "active" : ""}`}
        >
          {/* SENSOR DATA - TẢI BẢNG: Truyền trạng thái tab và sensorRevision vào bảng số đo. */}
          {/* SENSOR DATA - TỰ CẬP NHẬT: sensorRevision đổi sẽ làm useTable tải lại khi active=true. */}
          <SensorData active={tab === "sensor"} revision={iot.sensorRevision} />
        </section>
        <section
          id="action-page"
          className={`page-content ${tab === "action" ? "active" : ""}`}
        >
          {/* ACTION HISTORY - TẢI DANH SÁCH: Truyền active và actionRevision để trang chỉ tải khi mở và reload khi có log mới. */}
          {/* ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: revision nối event log mới tới lần tải lại bảng. */}
          <ActionHistory
            active={tab === "action"}
            revision={iot.actionRevision}
          />
        </section>
        <section
          id="profile-page"
          className={`page-content ${tab === "profile" ? "active" : ""}`}
        >
          <Profile profile={profile} onSave={setProfile} />
        </section>
      </main>
    </div>
  );
}
