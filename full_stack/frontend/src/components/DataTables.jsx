import { useEffect, useState } from "react";
import { useTable } from "../hooks/useTable.js";
import { actionStatus } from "../lib/data.js";
import { ErrorMessage, PageSize, Pagination, SortButton } from "./Common.jsx";

const timePlaceholder = "2026-10-08 hoặc 09:30 hoặc 2026-10-08 09:30";
// Giá trị mặc định cho bộ lọc, sắp xếp và tìm kiếm của Action History.
// ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Mặc định mọi bộ lọc là all, thời gian mới nhất đứng trước.
const actionDefaults = {
  device: "all",
  action: "all",
  status: "all",
  sort: "time",
  order: "desc",
  search: "",
};

/** Dùng chung bảng/phân trang; page và limit nằm trong React state của từng trang. */
/** ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Đổi số dòng/trang và giữ page luôn nằm trong phạm vi hợp lệ. */
function TableFrame({
  children,
  headers,
  rows,
  page,
  limit,
  total,
  id,
  setPage,
  setLimit,
}) {
  // Giữ trang hiện tại hợp lệ nếu điều kiện lọc làm tổng số trang giảm.
  const pages = Math.ceil(total / limit);
  useEffect(() => {
    if (page > Math.max(1, pages)) setPage(Math.max(1, pages));
  }, [page, pages, setPage]);
  return (
    <div className="table-wrapper">
      <div className="table-scroll-box">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody id={`${id}-table-body`}>
            {rows.length ? (
              children
            ) : (
              <tr>
                <td colSpan={headers.length} className="text-center">
                  Không có dữ liệu phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <PageSize
          id={`${id}-page-limit`}
          limit={limit}
          onChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
        />
        <Pagination
          id={`${id}-pagination`}
          page={page}
          totalPages={pages}
          onChange={setPage}
        />
      </div>
    </div>
  );
}

/** Hiển thị tiêu đề trang, mô tả và tổng số bản ghi. */
function Heading({ subtitle, title, description, count, countLabel, id }) {
  return (
    <div className="d-flex justify-content-between align-items-center mb-3 gap-3">
      <div>
        <span className="text-uppercase fw-bold style-sub-title">
          {subtitle}
        </span>
        <h3 className="fw-bold mb-1 text-light">{title}</h3>
        <p className="text-desc-custom small mb-0">{description}</p>
      </div>
      <div className="text-end">
        <span className="fs-2 fw-bold text-light me-1" id={id}>
          {count}
        </span>
        <span className="text-desc-custom fs-6">{countLabel}</span>
      </div>
    </div>
  );
}

/** ACTION HISTORY - TẢI DANH SÁCH: Giữ query của trang và gọi useTable để lấy danh sách nhật ký. */
export function ActionHistory({ active, revision }) {
  const [filters, setFilters] = useState(actionDefaults),
    [draft, setDraft] = useState("");
  const [page, setPage] = useState(1),
    [limit, setLimit] = useState(10);
  // ACTION HISTORY - TẢI DANH SÁCH: Gửi phân trang, bộ lọc, sắp xếp, trạng thái active và revision cho hook tải bảng.
  const { result, error, loading, reload } = useTable(
    "/actions",
    {
      page,
      limit,
      search_by: "timestamp",
      search: filters.search,
      device: filters.device,
      action: filters.action,
      status: filters.status,
      sort_by: filters.sort,
      sort_order: filters.order,
    },
    active,
    revision,
  );
  // filters chứa điều kiện đã áp dụng; draft chỉ là nội dung đang nhập.
  const filtered =
    filters.device !== "all" ||
    filters.action !== "all" ||
    filters.status !== "all" ||
    !!filters.search;
  /** ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Áp dụng ngay filter/sort và đưa trang về trang 1. */
  function change(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  /** ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Chỉ áp dụng draft khi submit bằng nút Tìm kiếm hoặc Enter. */
  function search(event) {
    event.preventDefault();
    change("search", draft.trim());
    reload();
  }
  /** ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Xóa draft, khôi phục mặc định và tải lại từ trang 1. */
  function reset() {
    setFilters(actionDefaults);
    setDraft("");
    setPage(1);
    reload();
  }
  return (
    <>
      <Heading
        subtitle="AUDIT LOG"
        title="Action History"
        description="Lịch sử thao tác điều khiển thiết bị."
        count={result.total}
        countLabel={
          filtered
            ? `kết quả / ${result.total_all ?? result.total} lịch sử`
            : "lịch sử"
        }
        id="actionCount"
      />
      <div className="card p-3 mb-4 border-0 shadow-sm rounded-3">
        <div className="row g-2 align-items-end">
          <div className="col-md-4">
            <label htmlFor="action-device" className="form-label-custom">
              Thiết bị
            </label>
            <select
              id="action-device"
              className="form-select"
              value={filters.device}
              onChange={(event) => change("device", event.target.value)}
            >
              <option value="all">Tất cả thiết bị</option>
              <option value="led1">Quạt - LED 01</option>
              <option value="led2">Điều hòa - LED 02</option>
              <option value="led3">Đèn - LED 03</option>
            </select>
          </div>
          <div className="col-md-4">
            <label htmlFor="action-filter" className="form-label-custom">
              Hành động
            </label>
            <select
              id="action-filter"
              className="form-select"
              value={filters.action}
              onChange={(event) => change("action", event.target.value)}
            >
              <option value="all">Tất cả hành động</option>
              <option value="ON">ON</option>
              <option value="OFF">OFF</option>
              <option value="ALERT">ALERT</option>
            </select>
          </div>
          <div className="col-md-4">
            <label htmlFor="action-status" className="form-label-custom">
              Trạng thái
            </label>
            <select
              id="action-status"
              className="form-select"
              value={filters.status}
              onChange={(event) => change("status", event.target.value)}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAIL">FAIL</option>
              <option value="LOADING">LOADING</option>
            </select>
          </div>
          <div className="col-md-7">
            <label htmlFor="action-search" className="form-label-custom">
              Tìm theo thời gian thao tác
            </label>
            {/* ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Input chỉ sửa draft; form submit mới áp dụng từ khóa. */}
            <form className="input-group" onSubmit={search}>
              <input
                id="action-search"
                className="form-control"
                placeholder={timePlaceholder}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary px-3 fw-semibold"
                disabled={loading}
              >
                {loading ? "Đang tải..." : "Tìm kiếm"}
              </button>
            </form>
          </div>
          <div className="col-md-5">
            <label htmlFor="action-sort" className="form-label-custom">
              Sắp xếp theo
            </label>
            <div className="d-flex gap-2">
              {/* ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Chọn cột hoặc đảo chiều sort sẽ cập nhật query ngay. */}
              <select
                id="action-sort"
                className="form-select"
                value={filters.sort}
                onChange={(event) => change("sort", event.target.value)}
              >
                {[
                  ["time", "Thời gian"],
                  ["device", "Thiết bị"],
                  ["action", "Hành động"],
                  ["status", "Trạng thái"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <SortButton
                id="btnSortOrderAction"
                order={filters.order}
                onClick={() =>
                  change("order", filters.order === "desc" ? "asc" : "desc")
                }
              />
              <button
                type="button"
                className="btn btn-outline-secondary text-light text-nowrap"
                onClick={reset}
              >
                Đặt lại
              </button>
            </div>
          </div>
        </div>
        {loading && (
          <div className="d-flex align-items-center gap-2 mt-2 text-info small" role="status" aria-live="polite">
            <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            Đang tải dữ liệu Action History...
          </div>
        )}
        <ErrorMessage>{error}</ErrorMessage>
      </div>
      <TableFrame
        headers={[
          "ID",
          "Device",
          "Action",
          "Status",
          "Thời gian thao tác",
        ]}
        rows={result.data}
        page={page}
        limit={limit}
        total={result.total}
        id="action"
        setPage={setPage}
        setLimit={setLimit}
      >
        {/* Chuẩn hóa trạng thái cũ rồi hiển thị huy hiệu SUCCESS, FAIL hoặc LOADING. */}
        {result.data.map((item) => {
          const status = actionStatus(item.status);
          return (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.device || "--"}</td>
              <td className="fw-bold">
                {item.action === "ALERT" ? "ALERT" : item.action || "--"}
              </td>
              <td>
                {status === "LOADING" ? (
                  <span className="status-badge badge-loading" title="Đang chờ thiết bị phản hồi">
                    LOADING
                  </span>
                ) : (
                  <span
                    className={`badge ${status === "SUCCESS" ? "bg-success" : "bg-danger"}`}
                  >
                    {status}
                  </span>
                )}
              </td>
              <td>
                {item.date && item.time_action
                  ? `${item.date} ${item.time_action}`
                  : "--"}
              </td>
            </tr>
          );
        })}
      </TableFrame>
    </>
  );
}

/** SENSOR DATA - TẢI BẢNG: Nhận active/revision, giữ query của bảng và gọi useTable lấy bản ghi sensor. */
export function SensorData({ active, revision }) {
  // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: sensorType/draft là lựa chọn đang soạn; appliedSensorType/searchValue là query đã áp dụng.
  const [sensorType, setSensorType] = useState("all"),
    [appliedSensorType, setAppliedSensorType] = useState("all"),
    [draft, setDraft] = useState(""),
    [searchValue, setSearchValue] = useState("");
  const [order, setOrder] = useState("desc"),
    [page, setPage] = useState(1),
    [limit, setLimit] = useState(10);
  // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Chuyển lựa chọn đã áp dụng thành search_by và sort_by gửi backend.
  const isTimeMode = sensorType === "time";
  const appliedTimeMode = appliedSensorType === "time";
  const activeCriterion = appliedTimeMode
    ? "timestamp"
    : appliedSensorType === "all"
      ? "any"
      : "value";
  // Chọn thời gian hoặc Tất cả thì sắp theo thời gian; loại riêng sắp theo giá trị.
  const sortBy = {
    timestamp: "time",
    any: "time",
    unit: "unit",
    value: "val",
  }[activeCriterion];
  // SENSOR DATA - TẢI BẢNG: Gửi trang, limit, criterion, search, loại cảm biến và sort vào /sensors.
  const { result, error, loading, reload } = useTable(
    "/sensors",
    {
      page,
      limit,
      search_by: activeCriterion,
      search: searchValue,
      type: appliedTimeMode ? "all" : appliedSensorType,
      sort_by: sortBy,
      sort_order: order,
    },
    active,
    revision,
  );
  /** SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Submit/Enter áp dụng loại + từ khóa; bỏ qua chuỗi rỗng và về trang 1. */
  function search(event) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setAppliedSensorType(sensorType);
    setSearchValue(value);
    setPage(1);
    reload();
  }
  /** SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Xóa nội dung tìm, chọn lại tất cả và khôi phục sort giảm dần. */
  function reset() {
    setSensorType("all");
    setAppliedSensorType("all");
    setDraft("");
    setSearchValue("");
    setOrder("desc");
    setPage(1);
    reload();
  }
  return (
    <>
      <Heading
        subtitle="MONITORING"
        title="Data Sensor"
        description="Lọc theo cảm biến, thời gian, đơn vị hoặc giá trị."
        count={result.total}
        countLabel="bản ghi"
        id="sensorCount"
      />
      <div className="card p-3 mb-4 border-0 shadow-sm rounded-3">
        <div className="row g-2 align-items-end">
          <div className="col-md-3">
            <label htmlFor="sensor-type-filter" className="form-label-custom">
              Loại cảm biến
            </label>
            {/* SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Loại riêng chờ submit; chọn Tất cả thì áp dụng all và xóa search ngay. */}
            <select
              id="sensor-type-filter"
              className="form-select"
              value={sensorType}
              onChange={(event) => {
                const nextType = event.target.value;
                setSensorType(nextType);
                setDraft("");
                if (nextType === "all") {
                  setAppliedSensorType("all");
                  setSearchValue("");
                  setPage(1);
                  reload();
                }
              }}
            >
              <option value="all">Tất cả</option>
              <option value="time">Thời gian</option>
              <option value="temp">Nhiệt độ</option>
              <option value="humid">Độ ẩm</option>
              <option value="light">Ánh sáng</option>
            </select>
          </div>
          <div className="col-md-7">
            <label htmlFor="sensor-search" className="form-label-custom">
              Nội dung tìm kiếm
            </label>
            {/* SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Draft chỉ thành query qua submit bằng nút hoặc Enter. */}
            <form className="input-group" onSubmit={search}>
              <input
                id="sensor-search"
                className="form-control"
                placeholder={isTimeMode
                  ? timePlaceholder
                  : sensorType === "all"
                    ? "Nhập ngày, giờ, ngày giờ, giá trị hoặc đơn vị"
                    : sensorType === "temp"
                      ? "Nhập giá trị °C, ví dụ: 30.5"
                      : sensorType === "humid"
                        ? "Nhập giá trị %, ví dụ: 48.6"
                        : sensorType === "light"
                          ? "Nhập giá trị lux, ví dụ: 841"
                          : "Nhập giá trị, ví dụ: 30.5"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary px-3 fw-semibold"
                disabled={!draft.trim()}
              >
                Tìm kiếm
              </button>
            </form>
          </div>
          <div className="col-md-2 d-flex gap-2">
            {/* SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Đảo order và về trang 1; useTable tải lại theo query mới. */}
            <SortButton
              id="btnSortOrderSensor"
              order={order}
              onClick={() => {
                setOrder(order === "desc" ? "asc" : "desc");
                setPage(1);
              }}
            />
            <button
              type="button"
              className="btn btn-outline-secondary text-light text-nowrap"
              onClick={reset}
            >
              Đặt lại
            </button>
          </div>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        <p className="text-desc-custom small mt-2 mb-0">
          Đang lọc {appliedTimeMode ? "theo thời gian" : appliedSensorType === "all" ? "tất cả cảm biến" : appliedSensorType}; sắp
          xếp theo {activeCriterion === "timestamp" ? "thời gian" : activeCriterion === "value" ? "giá trị" : "đơn vị"},{" "}
          {order === "desc" ? "giảm" : "tăng"} dần.
        </p>
        <span className="visually-hidden" role="status">
          {loading ? "Đang tải cảm biến..." : ""}
        </span>
      </div>
      <TableFrame
        headers={[
          "ID",
          "Tên cảm biến",
          "Loại",
          "Giá trị",
          "Đơn vị",
          "Thời gian",
          "Trạng thái",
        ]}
        rows={result.data}
        page={page}
        limit={limit}
        total={result.total}
        id="sensor"
        setPage={setPage}
        setLimit={setLimit}
      >
        {/* SENSOR DATA - TẢI BẢNG: Render các bản ghi trong data API thành từng hàng. */}
        {/* Mỗi hàng là một số đo đã được API lọc theo loại, tiêu chí và trang hiện tại. */}
        {result.data.map((item) => {
          const status =
            item.status && item.status !== "undefined"
              ? item.status
              : "Bình thường";
          return (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.name || "Cảm biến"}</td>
              <td>{item.type || "--"}</td>
              <td>{item.val ?? "--"}</td>
              <td>{item.unit || ""}</td>
              <td>{item.date && item.time ? `${item.date} ${item.time}` : "--"}</td>
              <td>
                <span
                  className={`badge ${["Normal", "Bình thường"].includes(status) ? "bg-success" : "bg-danger"}`}
                >
                  {status}
                </span>
              </td>
            </tr>
          );
        })}
      </TableFrame>
    </>
  );
}
