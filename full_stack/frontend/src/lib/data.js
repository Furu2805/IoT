// Hồ sơ dự phòng để giao diện vẫn có dữ liệu khi chưa tải được profile từ backend.
export const defaultProfile = {
  fullname: "Lương Minh Toàn",
  studentid: "B23DCAT297",
  className: "D23CQAT02",
  username: "admin",
  github: "https://github.com",
  figma: "https://figma.com",
  api: "https://swagger.io",
  pdf: "https://drive.google.com",
};

/** Chuẩn hóa trạng thái lịch sử cũ để huy hiệu khớp bộ lọc ở backend. */
export function actionStatus(value) {
  const status = String(value || "")
    .trim()
    .toUpperCase();
  if (["SUCCESS", "ON", "OFF"].includes(status)) return "SUCCESS";
  return status === "LOADING" ? "LOADING" : "FAIL";
}

/** DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU; DASHBOARD - REALTIME: Gộp điểm, bỏ timestamp lỗi/trùng, giữ 12 mốc mới. */
export function mergePoints(points) {
  const map = new Map();
  for (const point of points) {
    const timestamp = new Date(point.timestamp).getTime();
    if (Number.isFinite(timestamp)) map.set(timestamp, { ...point, timestamp });
  }
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-12);
}

/** Giữ liên kết hồ sơ là URL HTTP(S), tránh chạy URL javascript: từ dữ liệu đã lưu. */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}
