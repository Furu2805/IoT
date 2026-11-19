import { useState } from "react";
import { safeUrl } from "../lib/data.js";
import { Icon, ErrorMessage } from "./Common.jsx";

// Ánh xạ khóa hồ sơ sang nhãn hiển thị và ô nhập trong trang Profile.
const fields = [
  ["fullname", "Họ tên"],
  ["studentid", "Mã sinh viên"],
  ["className", "Lớp"],
  ["username", "Username"],
];
// Ánh xạ từng liên kết tài liệu sang mã icon, tên và mô tả tương ứng.
const links = [
  ["github", "GH", "GitHub", "Source code dự án"],
  ["figma", "FG", "Figma", "Thiết kế giao diện"],
  ["api", "API", "Postman / Swagger", "API Documentation"],
  ["pdf", "PDF", "PDF Report", "Báo cáo đồ án tốt nghiệp"],
];

/** Hồ sơ vẫn lưu localStorage như bản cũ; chưa có API cập nhật database. */
export default function Profile({ profile, onSave }) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(profile),
    [error, setError] = useState("");
  /** Bật chế độ sửa hoặc kiểm tra rồi lưu hồ sơ vào localStorage. */
  function toggle() {
    setError("");
    if (!editing) {
      setDraft(profile);
      setEditing(true);
      return;
    }
    const updated = Object.fromEntries(
      Object.keys(profile).map((key) => [
        key,
        String(draft[key] || "").trim() || profile[key],
      ]),
    );
    for (const [key] of links)
      if (updated[key] && safeUrl(updated[key]) === "#") {
        setError("Liên kết phải là địa chỉ http:// hoặc https:// hợp lệ.");
        return;
      }
    try {
      localStorage.setItem("user_profile", JSON.stringify(updated));
      onSave(updated);
      setEditing(false);
    } catch {
      setError("Trình duyệt không lưu được hồ sơ.");
    }
  }
  /** Tạo ô nhập hồ sơ có giá trị được quản lý bởi React state. */
  function input(key, label) {
    return (
      <input
        aria-label={label}
        className="form-control form-control-sm profile-edit"
        value={draft[key] || ""}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: event.target.value }))
        }
      />
    );
  }
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
        <div>
          <h2 className="page-title mb-1">Profile</h2>
          <p className="page-desc mb-0">
            Thông tin người dùng và tài liệu dự án.
          </p>
        </div>
        <button
          id="btn-edit-profile"
          type="button"
          className={`btn btn-sm px-3 ${editing ? "btn-success" : "btn-outline-primary"}`}
          onClick={toggle}
        >
          <Icon name={editing ? "save" : "pen"} className="me-1" />
          {editing ? "Lưu tất cả" : "Chỉnh sửa Profile & Link"}
        </button>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="profile-grid mt-3">
        <div className="profile-card">
          <div className="profile-avatar mb-3">
            {profile.fullname?.charAt(0) || "A"}
          </div>
          <h3 id="profile-title" className="profile-title">
            {profile.fullname}
          </h3>
          <p className="text-primary fw-medium small mb-3">
            Sinh viên / IoT Project
          </p>
          {/* Hiển thị dữ liệu hồ sơ hoặc input tùy trạng thái chỉnh sửa. */}
          {fields.map(([key, label]) => (
            <div className="profile-info-item" key={key}>
              <span className="profile-label">{label}</span>
              <span className="profile-value">
                {editing ? input(key, label) : profile[key]}
              </span>
            </div>
          ))}
        </div>
        <div className="profile-card d-flex flex-column gap-3">
          {/* Mỗi liên kết được kiểm tra URL an toàn trước khi mở trong tab mới. */}
          {links.map(([key, icon, label, description]) => (
            <div className="link-wrapper" key={key}>
              <a
                id={`link-${key}-anchor`}
                href={safeUrl(profile[key])}
                target="_blank"
                rel="noopener noreferrer"
                className="link-item text-decoration-none mb-0"
              >
                <div className="link-info">
                  <div className="link-icon">{icon}</div>
                  <div className="link-text">
                    <h5>{label}</h5>
                    <p>{description}</p>
                  </div>
                </div>
                <Icon
                  name="arrow-up-right-from-square"
                  className="link-arrow"
                />
              </a>
              {editing && (
                <div className="mt-2">
                  <label
                    htmlFor={`input-${key}-url`}
                    className="form-label-custom small mb-1"
                  >
                    URL {label}:
                  </label>
                  <input
                    id={`input-${key}-url`}
                    className="form-control form-control-sm"
                    value={draft[key] || ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
