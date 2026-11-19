import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { api, post } from "../lib/api.js";
import { mergePoints } from "../lib/data.js";

/** CHECK LOGIN (flow 0): Vòng đời kết nối Dashboard chỉ chạy khi authenticated=true. */
export function useIot(authenticated) {
  const [sensors, setSensors] = useState({
    temp: null,
    humid: null,
    light: null,
  });
  const [devices, setDevices] = useState({
    led1: "off",
    led2: "off",
    led3: "off",
  });
  const [mode, setMode] = useState("unknown");
  const [alertLed, setAlertLed] = useState("unknown");
  const [warningThreshold, setWarningThreshold] = useState(900);
  const [warningThresholds, setWarningThresholds] = useState({
    temp: 30,
    humid: 68,
    light: 900,
  });
  const [warningLedStatuses, setWarningLedStatuses] = useState({
    temp: "unknown",
    humid: "unknown",
    light: "unknown",
  });
  const [warningRevision, setWarningRevision] = useState(0);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [live, setLive] = useState(false);
  const [points, setPoints] = useState([]);
  const [chartError, setChartError] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [actionRevision, setActionRevision] = useState(0);
  const [sensorRevision, setSensorRevision] = useState(0);
  const [pendingDevices, setPendingDevices] = useState({});
  const [modePending, setModePending] = useState(false);
  const [modeMessage, setModeMessage] = useState(null);

  /** CHECK LOGIN (flow 0): Mở Socket và tải snapshot sau login; đóng kết nối khi logout. */
  useEffect(() => {
    // CHECK LOGIN (flow 0): Chưa đăng nhập thì không mở Socket hoặc gọi API Dashboard.
    if (!authenticated) return;
    const controller = new AbortController();
    let liveTimer,
      sensorVersion = 0,
      deviceVersion = 0,
      modeVersion = 0;
    setPoints([]);
    setLive(false);
    setMode("unknown");
    setAlertLed("unknown");
    setMqttConnected(false);
    setChartError("");
    setDashboardError("");
    setModeMessage(null);
    setHistoryLoading(true);
    const socket = io();
    /** Cập nhật dashboard thành offline khi Socket.IO hoặc MQTT mất kết nối. */
    // DASHBOARD - CẢNH BÁO: Đặt trạng thái các warning LED thành unknown khi mất kết nối.
    function disconnected() {
      clearTimeout(liveTimer);
      setMqttConnected(false);
      setLive(false);
      setMode("unknown");
      setAlertLed("unknown");
      setWarningLedStatuses({
        temp: "unknown",
        humid: "unknown",
        light: "unknown",
      });
      modeVersion++;
    }
    /** DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: GET /current-data lấy số đo gần nhất, trạng thái thiết bị và mode. */
    function loadSnapshot() {
      const initialSensor = sensorVersion,
        initialDevice = deviceVersion,
        initialMode = modeVersion;
      api("/current-data", { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted) return;
          if (initialSensor === sensorVersion && data.sensors)
            setSensors(data.sensors);
          if (initialDevice === deviceVersion && data.devices)
            setDevices((previous) => ({ ...previous, ...data.devices }));
          if (initialMode === modeVersion)
            setMode(data.devices?.mode || "unknown");
          setDashboardError("");
        })
        .catch((error) => {
          if (!controller.signal.aborted) setDashboardError(error.message);
        });
    }
    // DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: Gọi snapshot, warning settings và lịch sử biểu đồ.
    loadSnapshot();
    api("/settings", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const thresholds = {
          temp: Number(data.warning_temp_limit ?? 30),
          humid: Number(data.warning_humid_limit ?? 68),
          light: Number(data.warning_light_limit ?? 900),
        };
        if (Number.isFinite(thresholds.temp) && Number.isFinite(thresholds.humid) && Number.isFinite(thresholds.light)) {
          thresholds.light = Math.trunc(thresholds.light);
          setWarningThresholds(thresholds);
          setWarningThreshold(thresholds.light);
        }
      })
      .catch(() => { });
    api("/dashboard-history", { signal: controller.signal })
      .then((data) => {
        // DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: Đưa lịch sử API vào points để Dashboard chuyển cho biểu đồ.
        if (!controller.signal.aborted)
          setPoints((current) =>
            mergePoints([...(data.data || []), ...current]),
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setChartError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    socket.on("mqtt_connection_status", (data) => {
      if (data.connected === true) setMqttConnected(true);
      else disconnected();
    });
    socket.on("disconnect", disconnected);
    socket.on("connect_error", disconnected);
    // DASHBOARD - AUTO/MANUAL Nhận mode đã được backend xác nhận và cập nhật UI.
    socket.on("device_mode_update", (data) => {
      modeVersion++;
      setMode(data.mode);
    });
    socket.on("alert_led_update", (data) => {
      setAlertLed(data.status);
    });
    // DASHBOARD - CẢNH BÁO: Đồng bộ warning LED state theo cảm biến.
    socket.on("warning_led_update", (data) => {
      if (data.states) {
        setWarningLedStatuses((current) => ({ ...current, ...data.states }));
      } else if (["temp", "humid", "light"].includes(data.sensor)) {
        setWarningLedStatuses((current) => ({
          ...current,
          [data.sensor]: data.status,
        }));
      }
    });
    socket.on("warning_activation_update", () =>
      setWarningRevision((value) => value + 1),
    );
    socket.on("connect", () => {
      loadSnapshot();
      setActionRevision((value) => value + 1);
      setSensorRevision((value) => value + 1);
    });
    // Ghép bản tin cảm biến mới vào số đo hiện tại, lịch sử biểu đồ và bộ đếm tải lại bảng.
    // SENSOR DATA - TỰ CẬP NHẬT: Nhận event sau khi DB lưu mẫu; cập nhật revision để bảng active tải lại.
    // DASHBOARD - REALTIME: Nhận mẫu Socket.IO, cập nhật thẻ số, chart points, Live và sensorRevision.
    socket.on("sensor_realtime", (data) => {
      sensorVersion++;
      // cập nhật số đo hiện tại
      setSensors((current) => ({
        ...current,
        ...Object.fromEntries(
          ["temp", "humid", "light"]
            .filter((key) => data[key] !== undefined) //filter(...) chỉ giữ các key có giá trị trong data.
            .map((key) => [key, data[key]]),
        ),
      }));
      // thêm mẫu mới vào biểu đồ
      setPoints((current) =>
        mergePoints([
          ...current,
          { ...data, timestamp: data.timestamp || Date.now() },
        ]),
      );
      setLive(true);
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => setLive(false), 10000);
      // SENSOR DATA - TẢI BẢNG: Sau event dữ liệu đã lưu, tăng revision để bảng active query lại /sensors.
      setSensorRevision((value) => value + 1);
    });
    // Mỗi thay đổi lịch sử thao tác báo cho Action History tải lại dữ liệu từ API.
    // ACTION HISTORY - TẢI DANH SÁCH: Mỗi event log mới tăng revision để useTable gọi lại GET /actions.
    // ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Nhận event khi backend tạo LOADING hoặc kết quả cuối.
    socket.on("action_history_update", () =>
      setActionRevision((value) => value + 1),
    );
    // DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ: Nhận trạng thái GPIO/feedback để đồng bộ switch thực tế.
    socket.on("device_status_update", (data) => {
      if (["led1", "led2", "led3"].includes(data.device_id)) {
        deviceVersion++;
        setDevices((current) => ({
          ...current,
          [data.device_id]: String(data.status).toLowerCase(),
        }));
      }
    });
    // Hủy request, timer và socket khi đăng xuất hoặc hook bị tháo khỏi giao diện.
    // CHECK LOGIN (flow 0): Logout/unmount hủy request, timer và Socket đã mở ở trên.
    return () => {
      controller.abort();
      clearTimeout(liveTimer);
      socket.disconnect();
    };
  }, [authenticated]);

  /** DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ: Optimistic switch, POST lệnh và rollback nếu request lỗi. */
  /** ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: POST /device/control; HTTP OK mới chỉ là backend nhận lệnh. */
  async function controlDevice(id, checked) {
    const previous = devices[id];
    setPendingDevices((current) => ({ ...current, [id]: true }));
    setDevices((current) => ({ ...current, [id]: checked ? "on" : "off" }));
    setDashboardError("");
    setModeMessage(null);
    try {
      await post("/device/control", { device_id: id, status: checked });
      // ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Refresh khi HTTP nhận lệnh; ACK ESP32 sẽ tạo event refresh riêng.
      setActionRevision((value) => value + 1);
    } catch (error) {
      setDevices((current) => ({ ...current, [id]: previous }));
      setDashboardError(error.message);
    } finally {
      setPendingDevices((current) => ({ ...current, [id]: false }));
    }
  }

  /** DASHBOARD - AUTO/MANUAL POST yêu cầu đổi mode, chờ backend trả kết quả ACK. */
  async function changeMode(nextMode) {
    setModePending(true);
    setModeMessage({ text: "Đang chờ ESP32 xác nhận...", success: null });
    try {
      const data = await post("/device/mode", { mode: nextMode });
      setMode(data.mode);
      setModeMessage({ text: data.message, success: true });
    } catch (error) {
      setModeMessage({ text: error.message, success: false });
    } finally {
      setModePending(false);
    }
  }

  /** DASHBOARD - SỬA NGƯỠNG: Map cảm biến sang setting key, POST backend, đồng bộ state UI. */
  async function saveWarningThreshold(sensor, value) {
    const settingBySensor = {
      temp: "warning_temp_limit",
      humid: "warning_humid_limit",
      light: "warning_light_limit",
    };
    const setting = settingBySensor[sensor];
    if (!setting) throw new Error("Unknown warning sensor.");

    const data = await post("/settings", { [setting]: Number(value) });
    const thresholds = {
      temp: Number(data.warning_temp_limit ?? warningThresholds.temp),
      humid: Number(data.warning_humid_limit ?? warningThresholds.humid),
      light: Number(data.warning_light_limit ?? warningThresholds.light),
    };
    setWarningThresholds(thresholds);
    setWarningThreshold(thresholds.light);
    return data;
  }

  return {
    sensors,
    devices,
    mode,
    alertLed,
    warningThreshold,
    setWarningThreshold,
    warningThresholds,
    warningLedStatuses,
    saveWarningThreshold,
    warningRevision,
    mqttConnected,
    live,
    points,
    chartError,
    dashboardError,
    historyLoading,
    actionRevision,
    sensorRevision,
    pendingDevices,
    modePending,
    modeMessage,
    controlDevice,
    changeMode,
  };
}
