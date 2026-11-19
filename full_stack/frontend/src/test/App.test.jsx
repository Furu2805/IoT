import React from "react";
import {
  act,
  render,
  screen,
  waitFor,
  within,
  renderHook,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { useIot } from "../hooks/useIot.js";
import { mergePoints, actionStatus, safeUrl } from "../lib/data.js";

const mocks = vi.hoisted(() => ({
  handlers: new Map(),
  charts: [],
  disconnect: vi.fn(),
  autoFail: false,
}));
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event, handler) => mocks.handlers.set(event, handler),
    disconnect: mocks.disconnect,
  }),
}));
vi.mock("chart.js/auto", () => ({
  default: class {
    constructor(_canvas, config) {
      this.data = config.data;
      this.options = config.options;
      this.update = vi.fn();
      this.destroy = vi.fn();
      this.setDatasetVisibility = vi.fn();
      mocks.charts.push(this);
    }
  },
}));

function response(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}
function requests(path) {
  return fetch.mock.calls.filter(([url]) => url.startsWith(`/api${path}`));
}
function lastQuery(path) {
  return new URL(requests(path).at(-1)[0], "http://localhost").searchParams;
}
function rows(path, query) {
  const page = Number(query.get("page") || 1),
    limit = Number(query.get("limit") || 10);
  const total =
    path === "/actions" ? (query.get("device") === "all" ? 104 : 27) : 58;
  return {
    total,
    total_all: 104,
    page,
    limit,
    data: Array.from(
      { length: Math.max(0, Math.min(limit, total - (page - 1) * limit)) },
      (_, i) => ({
        id: `#${104 - (page - 1) * limit - i}`,
        device: query.get("device") === "led2" ? "Điều hòa" : "Quạt",
        action: query.get("action") === "OFF" ? "OFF" : "ON",
        status:
          path === "/actions"
            ? query.get("status") === "FAIL"
              ? "FAIL"
              : "SUCCESS"
            : "Normal",
        date: "2026-10-08",
        time: "09:30:00",
        time_action: "09:30:00",
        time_status: "09:30:01",
        name: "Độ ẩm",
        type: "humid",
        val: 62,
        unit: "%",
      }),
    ),
  };
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.charts.length = 0;
  mocks.disconnect.mockClear();
  mocks.autoFail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      const parsed = new URL(url, "http://localhost"),
        path = parsed.pathname.replace("/api", "");
      if (path === "/auth/login")
        return response(
          JSON.parse(options.body).password === "test-password"
            ? { token: "mock" }
            : { message: "Sai thông tin đăng nhập!" },
          JSON.parse(options.body).password === "test-password",
        );
      if (path === "/current-data")
        return response({
          sensors: { temp: 34.4, humid: 48.6, light: 841 },
          devices: { led1: "on", led2: "off", led3: "off", mode: "unknown" },
        });
      if (path === "/dashboard-history")
        return response({
          data: [
            {
              timestamp: "2026-10-08T09:30:00",
              temp: 30,
              humid: 60,
              light: 500,
            },
            {
              timestamp: "2026-10-08T09:30:02",
              temp: 34.4,
              humid: 48.6,
              light: 841,
            },
          ],
        });
      if (path === "/user/profile")
        return response({
          full_name: "Lương Minh Toàn",
          student_id: "B23DCAT297",
          class: "D23CQAT02",
          username: "LMToan",
          links: {},
        });
      if (path === "/actions" || path === "/sensors") {
        if (
          path === "/sensors" &&
          parsed.searchParams.get("search") === "invalid"
        )
          return response(
            { message: "Giá trị cảm biến phải là số, ví dụ: 30.5." },
            false,
          );
        return response(rows(path, parsed.searchParams));
      }
      if (path === "/device/mode")
        return mocks.autoFail
          ? response({ message: "ESP32 chưa xác nhận Auto sau 5 giây." }, false)
          : response({ mode: "auto", message: "ESP32 đã bật chế độ Auto." });
      if (path === "/device/control")
        return response({ message: "Đã tiếp nhận lệnh điều khiển thành công" });
      if (path === "/settings")
        return response(
          options?.method === "POST"
            ? { message: "Đã lưu" }
            : { temp_limit: 30, humid_limit: 68, light_limit: 100 },
        );
      throw new Error(`Unexpected request ${url}`);
    }),
  );
});

async function login() {
  const user = userEvent.setup();
  render(<App />);
  await user.type(
    screen.getByRole("textbox", { name: "Tên đăng nhập" }),
    "test-user",
  );
  await user.type(screen.getByLabelText("Mật khẩu"), "test-password");
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await screen.findByRole("button", { name: "Dashboard" });
  await waitFor(() => expect(mocks.charts.at(-1).data.labels).toHaveLength(2));
  return user;
}

describe("React migration", () => {
  it("shows login errors and logs in using Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByRole("textbox", { name: "Tên đăng nhập" }),
      "test-user",
    );
    await user.type(screen.getByLabelText("Mật khẩu"), "wrong{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sai thông tin đăng nhập",
    );
    await user.clear(screen.getByLabelText("Mật khẩu"));
    await user.type(screen.getByLabelText("Mật khẩu"), "test-password{Enter}");
    expect(
      await screen.findByRole("button", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("loads stored chart offline, hides Auto and handles MQTT/manual control and logout", async () => {
    const user = await login();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /B.t l.i Auto/ })).toBeNull();
    expect(screen.queryByText(/Ch. . . . .i.u khi.n/)).toBeNull();
    expect(mocks.charts.at(-1).data.datasets[2].data).toEqual([500, 841]);
    act(() =>
      mocks.handlers.get("mqtt_connection_status")({ connected: true }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Quạt - LED 01" }));
    expect(JSON.parse(requests("/device/control").at(-1)[1].body)).toEqual({
      device_id: "led1",
      status: false,
    });
    act(() =>
      mocks.handlers.get("sensor_realtime")({
        timestamp: "2026-10-08T09:30:04",
        temp: 0,
        humid: 60,
        light: 900,
      }),
    );
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(mocks.charts.at(-1).data.datasets[0].data.at(-1)).toBe(0);
    await user.click(
      screen.getByRole("button", { name: "Nhiệt độ", exact: true }),
    );
    expect(mocks.charts.at(-1).setDatasetVisibility).toHaveBeenCalledWith(
      1,
      false,
    );
    act(() => mocks.handlers.get("disconnect")());
    expect(screen.getByText("Offline")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(
      screen.getByRole("button", { name: "Đăng nhập" }),
    ).toBeInTheDocument();
    expect(mocks.disconnect).toHaveBeenCalled();
    expect(mocks.charts.at(-1).destroy).toHaveBeenCalled();
  });

  it("combines action filters and preserves page size, search and sort during realtime", async () => {
    const user = await login();
    await user.click(screen.getByRole("button", { name: "Action History" }));
    await screen.findByText("104");
    await user.selectOptions(screen.getByLabelText("Thiết bị"), "led2");
    await user.selectOptions(screen.getByLabelText("Hành động"), "OFF");
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "FAIL");
    await user.type(
      screen.getByLabelText("Tìm theo thời gian thao tác"),
      "2026-10-08 09:30{Enter}",
    );
    const size = screen.getByRole("spinbutton", { name: "Bản ghi mỗi trang" });
    await user.clear(size);
    await user.type(size, "25{Enter}");
    await waitFor(() => expect(lastQuery("/actions").get("limit")).toBe("25"));
    expect(lastQuery("/actions").get("device")).toBe("led2");
    expect(lastQuery("/actions").get("action")).toBe("OFF");
    expect(lastQuery("/actions").get("status")).toBe("FAIL");
    expect(lastQuery("/actions").get("search")).toBe("2026-10-08 09:30");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => expect(lastQuery("/actions").get("page")).toBe("2"));
    expect(lastQuery("/actions").get("limit")).toBe("25");
    act(() => mocks.handlers.get("action_history_update")({}));
    await waitFor(() => expect(lastQuery("/actions").get("page")).toBe("2"));
    await user.selectOptions(screen.getByLabelText("Sắp xếp theo"), "status");
    await user.click(screen.getByRole("button", { name: "Đảo chiều sắp xếp" }));
    await waitFor(() =>
      expect(lastQuery("/actions").get("sort_order")).toBe("asc"),
    );
    expect(lastQuery("/actions").get("page")).toBe("1");
    expect(screen.getByText("kết quả / 104 lịch sử")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Đặt lại" }));
    await waitFor(() =>
      expect(lastQuery("/actions").get("device")).toBe("all"),
    );
    expect(lastQuery("/actions").get("limit")).toBe("25");
  });

  it("searches sensor values, applies page size, reports invalid search and resets", async () => {
    const user = await login();
    await user.click(screen.getByRole("button", { name: "Sensor Data" }));
    await user.selectOptions(screen.getByLabelText("Lọc theo"), "humid");
    await user.type(screen.getByLabelText("Giá trị tìm kiếm"), "62{Enter}");
    const size = screen.getByRole("spinbutton", { name: "Bản ghi mỗi trang" });
    await user.clear(size);
    await user.type(size, "25{Enter}");
    await waitFor(() => expect(lastQuery("/sensors").get("limit")).toBe("25"));
    expect(lastQuery("/sensors").get("type")).toBe("humid");
    expect(lastQuery("/sensors").get("sort_by")).toBe("val");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => expect(lastQuery("/sensors").get("page")).toBe("2"));
    await user.click(screen.getByRole("button", { name: "Đảo chiều sắp xếp" }));
    expect(lastQuery("/sensors").get("sort_order")).toBe("asc");
    await user.clear(screen.getByLabelText("Giá trị tìm kiếm"));
    await user.type(
      screen.getByLabelText("Giá trị tìm kiếm"),
      "invalid{Enter}",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("phải là số");
    await user.click(screen.getByRole("button", { name: "Đặt lại" }));
    await waitFor(() =>
      expect(lastQuery("/sensors").get("search_by")).toBe("timestamp"),
    );
    expect(lastQuery("/sensors").get("limit")).toBe("25");
  });

  it("edits profile locally and keeps Settings hidden", async () => {
    const user = await login();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Profile", exact: true }));
    await user.click(screen.getByRole("button", { name: /Ch.nh s.a Profile & Link/ }));
    await user.clear(screen.getByLabelText(/H. t.n/));
    await user.type(screen.getByLabelText(/H. t.n/), "To\u00e0n React");
    await user.click(screen.getByRole("button", { name: /L.u t.t c./ }));
    expect(JSON.parse(localStorage.getItem("user_profile")).fullname).toBe("To\u00e0n React");
    expect(requests("/settings")).toHaveLength(0);
  });

  it("expires Live after ten seconds and cleans up socket on unmount", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useIot(true));
    await act(async () => {
      await Promise.resolve();
    });
    act(() =>
      mocks.handlers.get("sensor_realtime")({
        temp: 20,
        humid: 50,
        light: 0,
        timestamp: Date.now(),
      }),
    );
    expect(result.current.live).toBe(true);
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.live).toBe(false);
    unmount();
    expect(mocks.disconnect).toHaveBeenCalled();
  });
});

it("normalizes legacy statuses and merges real points without losing zero/null", () => {
  expect(
    ["ON", "OFF", "SUCCESS", "OFFLINE", "FAIL", "LOADING"].map(actionStatus),
  ).toEqual(["SUCCESS", "SUCCESS", "SUCCESS", "FAIL", "FAIL", "LOADING"]);
  const points = Array.from({ length: 20 }, (_, i) => ({
    timestamp: 1000 + i,
    temp: i,
    humid: null,
    light: 0,
  }));
  const merged = mergePoints([
    ...points,
    { timestamp: 1019, temp: 0, humid: null, light: 0 },
    { timestamp: "invalid" },
  ]);
  expect(merged).toHaveLength(12);
  expect(merged.at(-1).temp).toBe(0);
  expect(merged.at(-1).humid).toBeNull();
  expect(safeUrl("javascript:alert(1)")).toBe("#");
});
