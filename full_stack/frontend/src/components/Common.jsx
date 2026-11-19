import { useEffect, useState } from "react";

/** Vẽ biểu tượng Font Awesome theo tên class truyền vào. */
export function Icon({ name, className = "" }) {
  return <i aria-hidden="true" className={`fas fa-${name} ${className}`} />;
}
/** Chỉ hiển thị khung lỗi khi component nhận được nội dung lỗi. */
export function ErrorMessage({ children }) {
  return children ? (
    <div className="small text-danger mt-2" role="alert">
      {children}
    </div>
  ) : null;
}

/** ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: PageSize xác nhận số dòng/trang hợp lệ rồi báo component cha. */
export function PageSize({ id, limit, onChange }) {
  const [draft, setDraft] = useState(String(limit));
  // Đồng bộ ô nhập với số bản ghi thực tế nếu component cha đổi limit.
  useEffect(() => setDraft(String(limit)), [limit]);
  /** Kiểm tra số bản ghi hợp lệ trước khi báo component cha cập nhật. */
  function apply(input) {
    if (input.reportValidity() && Number(draft) !== limit)
      onChange(Number(draft));
  }
  return (
    <div className="page-size-control">
      <label htmlFor={id}>Bản ghi mỗi trang</label>
      <input
        id={id}
        type="number"
        className="form-control form-control-sm"
        min="1"
        max="100"
        step="1"
        required
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => apply(event.target)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply(event.currentTarget);
          }
        }}
      />
    </div>
  );
}

/** ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Pagination đổi trang; page state và tải lại do component cha quản lý. */
export function Pagination({ id, page, totalPages, onChange }) {
  const [jump, setJump] = useState("");
  // Xóa số trang nhảy cũ khi trang hiện tại hoặc tổng số trang thay đổi.
  useEffect(() => setJump(""), [page, totalPages]);
  if (totalPages <= 1) return null;
  const start = Math.max(1, page - 2),
    end = Math.min(totalPages, page + 2);
  const pages = [];
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("left");
  }
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages) {
    if (end < totalPages - 1) pages.push("right");
    pages.push(totalPages);
  }
  /** Chuyển đến trang người dùng nhập nếu số trang nằm trong giới hạn. */
  function go(event) {
    event.preventDefault();
    const target = Number(jump);
    if (Number.isInteger(target) && target >= 1 && target <= totalPages)
      onChange(target);
  }
  return (
    <div className="pagination" id={id}>
      <div className="d-flex align-items-center gap-2 flex-wrap w-100">
        <span className="text-desc-custom small me-auto">
          Trang {page}/{totalPages}
        </span>
        <div className="d-flex gap-1 align-items-center">
          {page > 1 && (
            <button
              type="button"
              aria-label="Trang trước"
              onClick={() => onChange(page - 1)}
            >
              «
            </button>
          )}
          {pages.map((p) =>
            typeof p === "number" ? (
              <button
                type="button"
                key={p}
                className={p === page ? "active" : ""}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            ) : (
              <span key={p}>...</span>
            ),
          )}
          {page < totalPages && (
            <button
              type="button"
              aria-label="Trang sau"
              onClick={() => onChange(page + 1)}
            >
              »
            </button>
          )}
        </div>
        <form onSubmit={go} className="d-flex align-items-center gap-1 ms-2">
          <label htmlFor={`${id}-jump`} className="small text-nowrap">
            Đến trang:
          </label>
          <input
            id={`${id}-jump`}
            type="number"
            min="1"
            max={totalPages}
            required
            placeholder={String(page)}
            value={jump}
            onChange={(event) => setJump(event.target.value)}
            className="form-control form-control-sm page-jump"
          />
          <button type="submit" className="btn btn-primary btn-sm px-2 page-go">
            Đi
          </button>
        </form>
      </div>
    </div>
  );
}

/** ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: SortButton hiển thị chiều sắp xếp và gọi callback khi bấm. */
export function SortButton({ order, onClick, id }) {
  return (
    <button
      id={id}
      type="button"
      className="btn btn-outline-secondary px-3"
      aria-label="Đảo chiều sắp xếp"
      title={`Đang ${order === "desc" ? "giảm" : "tăng"} dần; bấm để đảo chiều`}
      onClick={onClick}
    >
      <Icon
        name={order === "desc" ? "arrow-down" : "arrow-up"}
        className="text-light"
      />
    </button>
  );
}
