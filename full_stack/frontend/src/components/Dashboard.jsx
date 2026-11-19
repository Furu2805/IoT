import { useEffect, useState } from "react";
import SensorChart from "./SensorChart.jsx";
import { Icon, ErrorMessage } from "./Common.jsx";

const thresholdLimits = {
  temp: { min: 0, max: 80, step: "0.1" },
  humid: { min: 0, max: 100, step: "0.1" },
  light: { min: 0, max: 1000, step: "1" },
};
const defaultWarningThresholds = { temp: 30, humid: 68, light: 900 };

/** DASHBOARD - SỬA NGƯỠNG: Ô nhập giữ draft và submit ngưỡng của từng cảm biến. */
function WarningThresholdEditor({ sensor, label, unit, value, onSave }) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const limits = thresholdLimits[sensor];

  useEffect(() => setDraft(String(value)), [value]);

  // DASHBOARD - SỬA NGƯỠNG: Gửi draft qua onSave, rồi hiển thị thành công hoặc lỗi.
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    try {
      await onSave(sensor, draft);
      setFeedback("Đã lưu ngưỡng.");
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sensor-warning-settings">
      <form className="sensor-warning-form" onSubmit={submit}>
        <label htmlFor={`warning-${sensor}-threshold`}>Ngưỡng ({unit})</label>
        <div className="sensor-warning-entry">
          <input
            id={`warning-${sensor}-threshold`}
            type="number"
            min={limits.min}
            max={limits.max}
            step={limits.step}
            required
            value={draft}
            aria-label={`Ngưỡng cảnh báo ${label}`}
            onChange={(event) => setDraft(event.target.value)}
            disabled={saving}
          />
          <button type="submit" disabled={saving}>
            {saving ? "…" : "Lưu"}
          </button>
        </div>
      </form>
      {feedback && (
        <small className={feedback === "Đã lưu ngưỡng." ? "text-success" : "text-danger"}>
          {feedback}
        </small>
      )}
    </div>
  );
}

/** DASHBOARD - CẢNH BÁO: Hiển thị trạng thái blinking/off/unknown của mỗi warning LED. */
function WarningLedCard({ sensor, label, unit, icon, threshold, status }) {
  const statusText =
    status === "blinking"
      ? "Đang cảnh báo"
      : status === "off"
        ? "Bình thường"
        : "Chưa kết nối";
  const thresholdText = unit === "%" ? `${threshold}%` : `${threshold} ${unit}`;
  const cardStatusClass = status === "blinking" ? "is-blinking" : "";

  return (
    <div className={`warning-led-card warning-led-${sensor} ${cardStatusClass}`}>
      <Icon name={icon} className="warning-led-icon" />
      <div className="warning-led-copy">
        <h6 className="warning-led-card-title">WARNING - {label}</h6>
        <p className="warning-led-description">Vượt ngưỡng {thresholdText}</p>
      </div>
      <div className="warning-led-status" aria-live="polite">
        <span
          className={`warning-led-indicator ${status === "blinking" ? "is-blinking" : status === "off" ? "is-off" : "is-unknown"}`}
          aria-hidden="true"
        />
        <span>{statusText}</span>
      </div>
    </div>
  );
}

/** DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: Hiển thị state do useIot nạp từ API. */
export default function Dashboard({ iot }) {
  // Ánh xạ khóa cảm biến sang tên, đơn vị, màu thẻ và icon hiển thị trên dashboard.
  const cards = [
    ["temp", "Nhiệt độ", "°C", "blue", "temperature-high"],
    ["humid", "Độ ẩm", "%", "pink", "tint"],
    ["light", "Độ sáng", "lux", "yellow", "lightbulb"],
  ];
  // DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ: Map từng switch UI tới device_id led1/led2/led3.
  const devices = [
    ["led1", "Quạt - LED 01", "Cooling Device", "fan", "text-primary"],
    ["led2", "Điều hòa - LED 02", "Air Conditioner", "snowflake", "text-info"],
    ["led3", "Đèn - LED 03", "Lighting Device", "lightbulb", "text-warning"],
  ];
  return (
    <>
      <div className="dashboard-top">
        <div className="dashboard-stat-grid">
          {/* DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU; DASHBOARD - REALTIME: Thẻ đọc iot.sensors từ snapshot và Socket.IO. */}
          {cards.map(([key, label, unit, color, icon]) => (
            <div className={`stat-card sensor-stat-card card-${color}`} key={key}>
              <div className="sensor-stat-summary">
                <div className="label">{label}</div>
                <div
                  className="value"
                  id={`${key === "humid" ? "humid" : key}-value`}
                >
                  {iot.sensors[key] ?? "—"}{" "}
                  <span className="sensor-unit">{unit}</span>
                </div>
              </div>
              <Icon name={icon} className="icon" />
              {/* DASHBOARD - SỬA NGƯỠNG: Truyền sensor key và hook saveWarningThreshold vào ô nhập. */}
              <WarningThresholdEditor
                sensor={key}
                label={label}
                unit={unit}
                value={iot.warningThresholds?.[key] ?? defaultWarningThresholds[key]}
                onSave={iot.saveWarningThreshold}
              />
            </div>
          ))}
        </div>
        {/* DASHBOARD - AUTO/MANUAL Checkbox chọn mode và khóa khi MQTT/lệnh đang bận. */}
        <div className="auto-mode-panel dashboard-auto-mode-panel">
          <h5 className="dashboard-heading mb-3">Auto Mode</h5>
          <div className="auto-mode-row">
            <Icon
              name="robot"
              className={`auto-mode-icon ${iot.mode === "auto" ? "text-success" : "text-secondary"}`}
            />
            <div className="auto-mode-copy">
              <div className="fw-semibold">Sensor threshold control</div>
              <p className="mb-0 small text-desc-custom">
                {iot.mode === "auto" ? "Automatic" : iot.mode === "manual" ? "Manual" : "Mode unavailable"}
              </p>
            </div>
            <label className="switch">
              <input
                id="auto-mode"
                type="checkbox"
                aria-label="Auto Mode"
                checked={iot.mode === "auto"}
                disabled={
                  !iot.mqttConnected ||
                  iot.modePending ||
                  Object.values(iot.pendingDevices).some(Boolean)
                }
                onChange={(event) =>
                  iot.changeMode(event.target.checked ? "auto" : "manual")
                }
              />
              <span className="slider" />
            </label>
          </div>
          {iot.modeMessage && (
            <div
              className={`small mt-2 ${iot.modeMessage.success === false ? "text-danger" : iot.modeMessage.success ? "text-success" : "text-desc-custom"}`}
              role={iot.modeMessage.success === false ? "alert" : "status"}
            >
              {iot.modeMessage.text}
            </div>
          )}
        </div>
      </div>
      <div className="dashboard-bottom">
        {/* DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU; DASHBOARD - REALTIME: Chuyển points vào biểu đồ. */}
        <SensorChart
          points={iot.points} // hook đưa các điểm points
          live={iot.live} // hook đưa trạng thái live
          loading={iot.historyLoading} // hook đưa trạng thái loading
          error={iot.chartError} // hook đưa trạng thái error
        />
        <div className="device-control-stack">
          <div className="device-control-panel">
            <h5 className="dashboard-heading mb-3">Device Status</h5>
            {/* DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ: Hiển thị trạng thái và switch gửi lệnh cho từng LED. */}
            <div className="device-list">
              {devices.map(([id, label, description, icon, iconColor]) => (
                <div className="device-item" key={id}>
                  <div className="device-info">
                    <Icon
                      name={icon}
                      className={`device-icon ${iot.devices[id] === "on" ? iconColor : "text-secondary"}`}
                    />
                    <div className="device-info-copy">
                      <h5>{label}</h5>
                      <p>{description}</p>
                      {iot.devices[id] === "offline" && (
                        <span className="small text-danger">Offline</span>
                      )}
                    </div>
                  </div>
                  <label className="switch">
                    {/* ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Gạt switch gọi hook để gửi lệnh và tạo log. */}
                    <input
                      id={id}
                      type="checkbox"
                      aria-label={label}
                      checked={iot.devices[id] === "on"}
                      disabled={
                        !iot.mqttConnected ||
                        iot.modePending ||
                        iot.pendingDevices[id]
                      }
                      onChange={(event) =>
                        iot.controlDevice(id, event.target.checked)
                      }
                    />
                    <span className="slider" />
                  </label>
                </div>
              ))}
            </div>
            <ErrorMessage>{iot.dashboardError}</ErrorMessage>
            <div className="d-flex justify-content-between small text-desc-custom mt-2">
              <span>
                <Icon
                  name="circle"
                  className={`mqtt-dot me-1 ${iot.mqttConnected ? "text-success" : "text-danger"}`}
                />
                MQTT Broker
              </span>
              <span
                id="mqtt-status-text"
                className={iot.mqttConnected ? "text-success" : "text-danger"}
              >
                {iot.mqttConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
          {/* DASHBOARD - CẢNH BÁO: Truyền warningLedStatuses và thresholds vào các badge. */}
          <div className="warning-led-stack" aria-label="Warning LEDs">
            {cards.map(([key, label, unit, , icon]) => (
              <WarningLedCard
                key={key}
                label={label}
                sensor={key}
                unit={unit}
                icon={icon}
                threshold={iot.warningThresholds?.[key] ?? defaultWarningThresholds[key]}
                status={iot.warningLedStatuses?.[key] || "unknown"}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
