import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { api, post } from "../lib/api.js";
import { ErrorMessage } from "./Common.jsx";

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function Warning({ active, revision, onThresholdSaved }) {
  const [month, setMonth] = useState(currentMonthValue);
  const [threshold, setThreshold] = useState(900);
  const [monthStats, setMonthStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventPage, setEventPage] = useState(1);
  const [showList, setShowList] = useState(false);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const chartCanvas = useRef(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoadingConfig(true);
    setError("");
    setMessage("");
    api("/settings", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          const savedThreshold = Number(data.warning_light_limit ?? 900);
          setThreshold(Number.isFinite(savedThreshold) ? Math.trunc(savedThreshold) : 900);
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingConfig(false);
      });
    return () => controller.abort();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoadingStats(true);
    setMonthStats(null);
    setStatsError("");
    if (showList) {
      setEvents([]);
      setEventTotal(0);
    }
    api(`/warnings/statistics?month=${encodeURIComponent(month)}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setMonthStats(data);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setStatsError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStats(false);
      });

    if (showList) {
      api(
        `/warnings/events?month=${encodeURIComponent(month)}&page=${eventPage}&limit=25`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setEvents(data.events || []);
            setEventTotal(data.total || 0);
          }
        })
        .catch((requestError) => {
          if (!controller.signal.aborted) setStatsError(requestError.message);
        });
    }
    return () => controller.abort();
  }, [active, month, revision, showList, eventPage]);

  useEffect(() => {
    if (!chartCanvas.current || !monthStats?.daily) return;
    const chart = new Chart(chartCanvas.current, {
      type: "bar",
      data: {
        labels: monthStats.daily.map(({ day }) => day),
        datasets: [
          {
            data: monthStats.daily.map(({ count }) => count),
            backgroundColor: "rgba(185, 28, 28, 0.78)",
            borderColor: "#b91c1c",
            borderWidth: 1,
            borderRadius: 2,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${month}-${String(items[0]?.label || "").padStart(2, "0")}`,
              label: (item) => `${item.raw} warning activations`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Ngày" },
            grid: { color: "rgba(148, 163, 184, 0.18)" },
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 31 },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Số lần cảnh báo" },
            ticks: { precision: 0, stepSize: 1 },
            grid: { color: "rgba(148, 163, 184, 0.18)" },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [monthStats, month]);

  async function saveThreshold(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await post("/settings", {
        warning_light_limit: Number(threshold),
      });
      setThreshold(result.warning_light_limit);
      onThresholdSaved?.(result.warning_light_limit);
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const [year, monthNumber] = month.split("-");
  const lastEventPage = Math.max(1, Math.ceil(eventTotal / 25));

  return (
    <div className="warning-page">
      <h2 className="warning-page-title">Warning</h2>
      <div className="warning-overview-card">
        <div className="warning-overview-field">
          <label htmlFor="warning-month">Tháng</label>
          <input
            id="warning-month"
            type="month"
            min="2000-01"
            max="2100-12"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value || currentMonthValue());
              setEventPage(1);
            }}
          />
        </div>
        <div className="warning-month-total" aria-live="polite">
          <span>Tổng số lần cảnh báo trong tháng</span>
          <strong>
            {loadingStats ? "…" : statsError ? "—" : monthStats?.total ?? 0}
          </strong>
        </div>
        <form className="warning-threshold-form" onSubmit={saveThreshold}>
          <div className="warning-overview-field">
            <label htmlFor="warning-light-threshold">
              Cảnh báo khi ánh sáng &gt; X (thang đo 0–1000)
            </label>
            <input
              id="warning-light-threshold"
              type="number"
              min="0"
              max="1000"
              step="1"
              required
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              disabled={loadingConfig || busy}
            />
          </div>
          <button type="submit" disabled={loadingConfig || busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </form>
      </div>

      <ErrorMessage>{error || statsError}</ErrorMessage>
      {message && <div className="text-success small mt-2">{message}</div>}

      <div className="warning-chart-card">
        <div className="warning-chart-header">
          <h3>Số lần cảnh báo mỗi ngày - tháng {monthNumber}/{year}</h3>
          <button
            type="button"
            className="warning-list-toggle"
            onClick={() => {
              setShowList((current) => !current);
              setEventPage(1);
            }}
          >
            {showList ? "Ẩn danh sách" : "Xem danh sách"}
          </button>
        </div>
        <div className="warning-chart-area">
          {monthStats ? (
            <canvas ref={chartCanvas} aria-label="Số lần cảnh báo theo ngày" />
          ) : (
            <div className="warning-chart-message">
              {loadingStats ? "Đang tải thống kê…" : "Chưa có thống kê cho tháng này."}
            </div>
          )}
        </div>
        {showList && (
          <div className="warning-events-list">
            <div className="warning-events-heading">
              <strong>Danh sách cảnh báo trong tháng</strong>
              <span>{eventTotal} lần</span>
            </div>
            {events.length ? (
              <div className="table-responsive">
                <table className="table table-dark table-sm mb-2">
                  <thead>
                    <tr>
                      <th>Thời gian kích hoạt</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{event.triggered_at}</td>
                        <td>Warning</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-desc-custom small mb-2">
                {statsError || "Tháng này chưa có lần cảnh báo nào."}
              </p>
            )}
            {eventTotal > 25 && (
              <div className="warning-event-pagination">
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  disabled={eventPage <= 1}
                  onClick={() => setEventPage((page) => page - 1)}
                >
                  Trước
                </button>
                <span>{eventPage}/{lastEventPage}</span>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  disabled={eventPage >= lastEventPage}
                  onClick={() => setEventPage((page) => page + 1)}
                >
                  Sau
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
