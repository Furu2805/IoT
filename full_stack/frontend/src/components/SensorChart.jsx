import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";

// Ánh xạ khóa dữ liệu trong từng điểm sang nhãn, màu và trục Y tương ứng của Chart.js.
const series = [
  {
    key: "temp",
    label: "Nhiệt độ (°C)",
    color: "#3b82f6",
    background: "rgba(59,130,246,0.1)",
    axis: "yTempHumid",
  },
  {
    key: "humid",
    label: "Độ ẩm (%)",
    color: "#ec4899",
    background: "rgba(236,72,153,0.1)",
    axis: "yTempHumid",
  },
  {
    key: "light",
    label: "Độ sáng (lux)",
    color: "#eab308",
    background: "rgba(234,179,8,0.1)",
    axis: "yLight",
  },
];

/** DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU; DASHBOARD - REALTIME: Nhận points và vẽ/cập nhật biểu đồ Chart.js. */
export default function SensorChart({ points, live, error, loading }) {
  const canvas = useRef(null),
    chart = useRef(null);
  const [filter, setFilter] = useState("all");
  /** Tạo biểu đồ Chart.js một lần và giải phóng tài nguyên khi unmount. */
  useEffect(() => {
    chart.current = new Chart(canvas.current, {
      type: "line",
      data: {
        labels: [],
        datasets: series.map((item) => ({
          label: item.label,
          data: [],
          borderColor: item.color,
          backgroundColor: item.background,
          fill: true,
          tension: 0,
          pointRadius: 3,
          yAxisID: item.axis,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: "#cbd5e1", usePointStyle: true },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
          // Nhiệt độ và độ ẩm dùng chung trục trái với giới hạn 0–100.
          yTempHumid: {
            type: "linear",
            position: "left",
            min: 0,
            max: 100,
            grid: { color: "#334155" },
            ticks: { color: "#cbd5e1" },
            title: {
              display: true,
              text: "Nhiệt độ (°C) / Độ ẩm (%)",
              color: "#cbd5e1",
              font: { size: 11 },
            },
          },
          // Ánh sáng dùng trục phải riêng với giới hạn 0–1000 lux.
          yLight: {
            type: "linear",
            position: "right",
            min: 0,
            max: 1000,
            grid: { display: false },
            ticks: { color: "#eab308" },
            title: {
              display: true,
              text: "Độ sáng (lux)",
              color: "#eab308",
              font: { size: 11 },
            },
          },
        },
      },
    });
    return () => {
      chart.current.destroy();
      chart.current = null;
    };
  }, []);
  /** DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU; DASHBOARD - REALTIME: Đổi points thành nhãn/dataset rồi vẽ lại. */
  useEffect(() => {
    const instance = chart.current;
    /** Hàm map giá trị cảm biến vào trục thời gian */
    instance.data.labels = points.map((point) =>
      new Date(point.timestamp).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
    // Mỗi dataset đọc đúng trường temp/humid/light; filter quyết định đường nào đang hiện.
    series.forEach((item, index) => {
      /** Hàm map giá trị cảm biến vào trục y */
      instance.data.datasets[index].data = points.map((point) =>
        point[item.key] == null || !Number.isFinite(Number(point[item.key]))
          ? null
          : Number(point[item.key]),
      );
      /** lọc đường biểu đồ*/
      instance.setDatasetVisibility(
        index,
        filter === "all" || filter === item.key,
      );
    });
    instance.options.scales.yTempHumid.display = filter !== "light";
    instance.options.scales.yLight.display =
      filter === "all" || filter === "light";
    instance.update("none");
  }, [points, filter]);
  const message = points.length
    ? ""
    : loading
      ? "Đang tải lịch sử cảm biến..."
      : error || "Chưa có dữ liệu cảm biến được lưu.";
  return (
    <div className="chart-container">
      <div className="chart-header d-flex justify-content-between align-items-start mb-3">
        <div>
          <h5 className="dashboard-heading mb-1">Realtime Sensor Data</h5>
          <p className="text-desc-custom small mb-3">
            Theo dõi dữ liệu cảm biến theo thời gian
          </p>
          {/* Bộ lọc ẩn/hiện dataset và trục tương ứng */}
          <div className="chart-filter-btns">
            {[
              ["all", "Tất cả"],
              ["temp", "Nhiệt độ"],
              ["humid", "Độ ẩm"],
              ["light", "Độ sáng"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={`btn-chart-filter ${filter === key ? "active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <span
          id="realtime-badge"
          className={`live-badge ${live ? "is-live" : ""}`}
        >
          <i className="fas fa-circle me-1" aria-hidden="true" />
          {live ? "Live" : "Offline"}
        </span>
      </div>
      <div className="chart-wrapper">
        <canvas
          id="dashboardChart"
          ref={canvas}
          aria-label="Biểu đồ lịch sử cảm biến"
        />
        {message && (
          <div
            id="chart-message"
            className="chart-message text-desc-custom small"
            role="status"
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
