# Sensor Monitor — React

Frontend đã chuyển sang React + Vite, backend Express/MQTT/MySQL giữ trong `../backend`.
Node.js đang dùng là 22.15; Vite yêu cầu Node 20.19+ hoặc 22.12+.

## Chạy tại localhost:3000

Cài thư viện lần đầu:

```powershell
cd frontend
npm.cmd install
cd ..\backend
npm.cmd install
npm.cmd start
```

Mỗi lần `npm.cmd start` trong backend sẽ build React trước khi chạy server.
Mở http://localhost:4000. Tài khoản đăng nhập vẫn do backend kiểm tra.
Database và broker phải được cấu hình/chạy như trước.

## Sửa giao diện với tự động cập nhật

Giữ backend ở cổng 3000. Trong terminal thứ hai:

```powershell
cd frontend
npm.cmd run dev
```

Mở http://localhost:5173. Vite proxy `/api` và `/socket.io` tới backend 3000.
Sửa component sẽ cập nhật ngay; để xem bản mới trên cổng 3000 thì build lại
bằng `npm.cmd run build` trong frontend hoặc khởi động lại backend.

## Bản đồ mã nguồn

- `src/App.jsx`: đăng nhập/đăng xuất, sidebar, chọn trang, tải hồ sơ.
- `src/components/Login.jsx`: form đăng nhập và thông báo lỗi.
- `src/components/Dashboard.jsx`: số đo, công tắc, nút Auto, trạng thái broker.
- `src/components/SensorChart.jsx`: Chart.js, ba đường và các nút lọc biểu đồ.
- `src/components/DataTables.jsx`: Sensor Data và Action History, lọc, tìm kiếm, sắp xếp.
- `src/components/Common.jsx`: icon, ô số hàng/trang, phân trang, nút tăng/giảm.
- `src/components/Profile.jsx`: sửa hồ sơ và URL, lưu `localStorage.user_profile` như trước.
- `src/components/Warning.jsx`: đọc/lưu ngưỡng qua API.
- `src/hooks/useIot.js`: Socket.IO, lịch sử biểu đồ, lệnh thiết bị và ACK Auto.
- `src/hooks/useTable.js`: tải API theo bộ lọc và hủy request cũ.
- `src/lib/api.js`: hàm fetch/POST JSON dùng chung.
- `src/lib/data.js`: chuẩn hóa trạng thái, ghép điểm biểu đồ và URL hồ sơ.
- `css/style.css`: giữ màu/bố cục cũ, gồm các chỉnh sửa màu của bạn.
- `src/react.css`: các điều chỉnh dành cho React.

`index.html` bây giờ chỉ chứa root và script khởi động; giao diện nằm trong JSX.
JSX dùng `className`, `onClick`, `value`, `checked` thay cho `class`, `onclick` và sửa DOM.
Các file `js/*.js` cũ không còn được tải. Bản HTML/CSS/JS trước chuyển đổi được sao lưu
trong `legacy/` để đối chiếu; không mở bản legacy trên server để điều khiển thiết bị.

## Kiểm tra

```powershell
npm.cmd test
npm.cmd run build
```

Các kiểm tra mô phỏng API/Socket.IO, không gửi lệnh tới ESP32 thực.
React không thêm hệ thống xác thực mới: cơ chế đăng nhập và API backend vẫn như dự án cũ.
