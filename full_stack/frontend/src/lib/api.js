/** Gọi API cùng địa chỉ web; khi lỗi trả thông báo backend để giao diện hiển thị. */
const AUTH_TOKEN_KEY = "iot_access_token";

// CHECK LOGIN (flow 0): Đọc token session mà App dùng để quyết định trạng thái đăng nhập.
export function getAccessToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

// CHECK LOGIN (flow 0): Lưu JWT backend trả về sau khi đăng nhập thành công.
export function saveAccessToken(token) {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

// CHECK LOGIN (flow 0): Xóa JWT khi logout hoặc khi backend trả 401.
export function clearAccessToken() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

// CHECK LOGIN (flow 0): Gắn Bearer cho API cần xác thực; 401 sẽ xóa token và báo App.
// DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: GET snapshot/settings/history trong useIot đi qua helper này.
export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getAccessToken();
  if (token && path !== "/auth/login")
    headers.Authorization = "Bearer " + token;

  const response = await fetch("/api" + path, { ...options, headers });
  const result = await response.json();
  if (response.status === 401 && path !== "/auth/login") {
    clearAccessToken();
    window.dispatchEvent(new Event("iot-auth-expired"));
  }
  if (!response.ok)
    throw new Error(result.message || "Không tải được dữ liệu từ backend.");
  return result;
}

/** CHECK LOGIN (flow 0); DASHBOARD - AUTO/MANUAL; DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ; DASHBOARD - SỬA NGƯỠNG: POST JSON qua api(). */
export function post(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
