import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";

/** ACTION HISTORY - TẢI DANH SÁCH: Loader dùng chung; chỉ gọi API khi active và hủy request cũ khi query đổi. */
export function useTable(path, query, active, revision) {
  const [result, setResult] = useState({ data: [], total: 0, total_all: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  const params = new URLSearchParams(query).toString();
  /** ACTION HISTORY - TẢI DANH SÁCH: GET /actions theo query; cập nhật result nếu request chưa bị hủy. */
  /** SENSOR DATA - TẢI BẢNG: GET /sensors khi bảng active; thay query hoặc sensorRevision sẽ tải lại. */
  /** SENSOR DATA - TỰ CẬP NHẬT: Event đổi revision kích hoạt effect; inactive thì effect thoát không gọi API. */
  /** ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: actionRevision thay đổi sẽ kích hoạt effect tải lại bảng. */
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    api(`${path}?${params}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, params, active, revision, refresh]);
  return { result, error, loading, reload };
}
