# Hệ thống Smart Room IoT

Smart Room giám sát nhiệt độ, độ ẩm và ánh sáng trong phòng, đồng thời cho phép người dùng theo dõi dữ liệu và điều khiển các thiết bị mô phỏng từ Dashboard Web. README này đi theo các phần của báo cáo: giới thiệu, thành phần hệ thống, phân tích thiết kế, xây dựng, yêu cầu phi chức năng, kết quả và hướng phát triển. Phần cảnh báo ba cảm biến mô tả thêm chức năng đã có trong mã nguồn hiện tại.

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Các thành phần của hệ thống](#2-các-thành-phần-của-hệ-thống)
3. [Phân tích và thiết kế](#3-phân-tích-và-thiết-kế)
4. [Xây dựng hệ thống](#4-xây-dựng-hệ-thống)
5. [Yêu cầu phi chức năng](#5-yêu-cầu-phi-chức-năng)
6. [Kết quả thực hiện](#6-kết-quả-thực-hiện)
7. [Kết luận và hướng phát triển](#7-kết-luận-và-hướng-phát-triển)
8. [Cài đặt và chạy dự án](#8-cài-đặt-và-chạy-dự-án)
9. [Tài liệu tham khảo](#9-tài-liệu-tham-khảo)

## 1. Giới thiệu

### 1.1 Mục tiêu

- Thu thập nhiệt độ, độ ẩm và ánh sáng bằng ESP32, gửi số đo về máy chủ và hiển thị trên Dashboard.
- Cho phép chuyển Auto/Manual, bật tắt từng LED mô phỏng và theo dõi phản hồi của thiết bị.
- Lưu số đo và thao tác vào MySQL để tra cứu lịch sử.
- Cảnh báo tại chỗ và cập nhật trạng thái trên giao diện khi một trong ba giá trị môi trường vượt ngưỡng.
- Tổ chức thiết kế phần cứng, cơ sở dữ liệu, Use Case, sequence và API thành một mô hình IoT hoàn chỉnh.

### 1.2 Phạm vi đề tài

**Phần cứng:** một ESP32, DHT11 đo nhiệt độ/độ ẩm, cảm biến ánh sáng LM393/LDR đọc ngõ analog, ba LED mô phỏng thiết bị và ba LED báo động riêng.

**Phần mềm:** firmware Arduino, MQTT Broker, Backend Node.js, cơ sở dữ liệu MySQL, giao diện React và các API phục vụ đăng nhập, Dashboard, lịch sử, điều khiển, cấu hình ngưỡng và cảnh báo.

### 1.3 Đối tượng sử dụng

Người dùng được cấp tài khoản có thể đăng nhập, xem số đo và biểu đồ, tra cứu bản ghi cảm biến, điều khiển LED, xem lịch sử thao tác và mở trang Profile.

### 1.4 Mô hình hoạt động tổng quát

![Sơ đồ kiến trúc tổng quan trích từ báo cáo](docs/diagrams/system-architecture.png)

Luồng dữ liệu cảm biến đi từ ESP32 qua MQTT Broker đến Backend, được lưu trong MySQL rồi phát tới trình duyệt. Luồng điều khiển đi từ Dashboard qua API tới Backend, sau đó qua MQTT đến ESP32; trạng thái thực tế được gửi ngược lại để cập nhật lịch sử và giao diện.

Đề tài giúp vận dụng lập trình nhúng, truyền thông mạng, cơ sở dữ liệu và phát triển Web. Mô hình cũng minh họa cách các thành phần phần cứng và phần mềm phối hợp để theo dõi, lưu trữ và điều khiển tập trung.

## 2. Các thành phần của hệ thống

### 2.1 Hardware

ESP32 kết nối Wi-Fi, đọc cảm biến và điều khiển chân GPIO. DHT11 cung cấp nhiệt độ và độ ẩm; LDR cung cấp giá trị analog để theo dõi thay đổi ánh sáng. Ba LED đầu ra mô phỏng quạt, điều hòa và đèn.

| Thành phần | Chân ESP32 | Vai trò |
| --- | --- | --- |
| DHT11 | GPIO 4 | Đo nhiệt độ và độ ẩm |
| LDR (AO) | GPIO 34 | Đo mức ánh sáng tương đối |
| LED 01 | GPIO 21 | Mô phỏng quạt |
| LED 02 | GPIO 22 | Mô phỏng điều hòa |
| LED 03 | GPIO 23 | Mô phỏng đèn |
| LED cảnh báo nhiệt độ | GPIO 26 | Báo vượt ngưỡng nhiệt độ |
| LED cảnh báo độ ẩm | GPIO 27 | Báo vượt ngưỡng độ ẩm |
| LED cảnh báo ánh sáng | GPIO 25 | Báo vượt ngưỡng ánh sáng |

### 2.2 MQTT Broker

Mosquitto chuyển tiếp bản tin giữa ESP32 và Backend. Các topic đang dùng trong firmware và Backend:

| Topic | Hướng dữ liệu | Nội dung |
| --- | --- | --- |
| `data_sensors_TL297` | ESP32 → Backend | Nhiệt độ, độ ẩm, ánh sáng |
| `device_status_TL297` | ESP32 → Backend | Trạng thái thiết bị, chế độ và LED cảnh báo |
| `device_control_TL297` | Backend → ESP32 | Lệnh điều khiển và Auto/Manual |
| `device_config_TL297` | Backend → ESP32 | Cấu hình ngưỡng; dùng retained để đồng bộ lại sau reconnect |

### 2.3 Backend

Backend dùng Node.js và Express cho REST API, MQTT.js cho giao tiếp thiết bị, Socket.IO để phát cập nhật realtime, và `mysql2` để truy cập MySQL. Backend lưu số đo, trạng thái thiết bị, cấu hình và lịch sử; lệnh điều khiển có trạng thái chờ và kết quả timeout/ACK.

### 2.4 Database

ERD trong báo cáo mô tả năm bảng chính: `user`, `device`, `sensor`, `data_sensor` và `action_history`. Quan hệ chính là thiết bị có nhiều cảm biến và lịch sử thao tác; cảm biến có nhiều bản ghi số đo; người dùng có nhiều thao tác.

Phiên bản hiện tại bổ sung `system_settings` để lưu ngưỡng và `warning_history` để lưu thời điểm kích hoạt cảnh báo. Các migration cho phần mở rộng này nằm trong `backend/migrations/`.

### 2.5 Frontend và Dashboard

Frontend dùng React, HTML, CSS và JavaScript. Fetch API gửi yêu cầu REST; Socket.IO Client nhận trạng thái và số đo mới để cập nhật thẻ, biểu đồ và các điều khiển mà không cần tải lại trang. Chart.js hiển thị chuỗi số đo gần nhất.

## 3. Phân tích và thiết kế

### 3.1 ERD — Entity Relationship Diagram

![ERD cơ sở dữ liệu trích từ báo cáo](docs/diagrams/database-erd.png)

ERD thể hiện quan hệ giữa tài khoản, thiết bị, cảm biến, bản ghi đo và lịch sử thao tác. Một thiết bị có thể chứa nhiều cảm biến; mỗi cảm biến có nhiều bản ghi `data_sensor`; `action_history` liên kết thao tác với người dùng và thiết bị.

### 3.2 Danh sách Use Case

| Mã | Use Case | Chức năng chính |
| --- | --- | --- |
| UC-01 | Login | Xác thực người dùng và mở Dashboard |
| UC-02 | Dashboard & Realtime Chart | Tải số đo ban đầu và cập nhật dữ liệu/trạng thái realtime |
| UC-03 | Sensor Data | Xem, tìm kiếm, lọc, sắp xếp và phân trang số đo |
| UC-04 | Điều khiển thiết bị | Xem trạng thái, gửi lệnh LED, chọn Auto/Manual và nhận phản hồi |
| UC-05 | Action History | Tra cứu thao tác theo thiết bị, hành động, thời gian và trạng thái |
| UC-06 | Profile | Xem thông tin người dùng và các liên kết |

### 3.3 Sequence và mô tả luồng

Các ảnh dưới đây được trích từ sequence trong báo cáo. Chúng thể hiện luồng thiết kế giữa User, Frontend, Backend, Database, MQTT Broker và ESP32.

#### UC-01 — Đăng nhập

![Sequence UC-01: Đăng nhập](docs/sequences/uc-01-login.png)

1. Người dùng mở trang đăng nhập và nhập tên đăng nhập, mật khẩu.
2. Frontend gửi `POST /api/auth/login` đến Backend.
3. Backend xác thực thông tin; nếu hợp lệ, trả JWT để Frontend chuyển vào Dashboard. Nếu sai, API trả lỗi và giao diện giữ người dùng ở trang đăng nhập.

Trong hình báo cáo, phần xác thực được mô tả bằng truy vấn user trong Database và BCrypt. Mã nguồn hiện tại lấy tài khoản quản trị từ `backend/.env`, trả JWT và Frontend lưu token trong `sessionStorage`, sau đó gửi Bearer token cho các API cần đăng nhập.

#### UC-02 — Dashboard và biểu đồ realtime

![Sequence UC-02: Dashboard và Realtime Chart](docs/sequences/uc-02-dashboard-realtime.png)

1. Khi mở Dashboard, Frontend gọi `GET /api/current-data` để lấy số đo và trạng thái hiện có.
2. ESP32 gửi mẫu cảm biến qua MQTT. Backend lưu dữ liệu vào `data_sensor` rồi phát sự kiện Socket.IO để cập nhật thẻ và biểu đồ.
3. Trạng thái thiết bị từ ESP32 cũng đi qua MQTT, được Backend cập nhật và phát tới Dashboard.
4. Khi kết nối MQTT mất, giao diện nhận trạng thái mất kết nối; khi kết nối lại, các trạng thái được đồng bộ lại.

#### UC-03 — Sensor Data

![Sequence UC-03: Sensor Data](docs/sequences/uc-03-sensor-data.png)

1. Frontend gọi `GET /api/sensors` để lấy trang dữ liệu cảm biến.
2. Khi người dùng tìm kiếm, lọc theo cảm biến, sắp xếp hoặc đổi trang, Frontend gửi lại yêu cầu với query parameters.
3. Backend truy vấn MySQL, trả về danh sách và tổng số bản ghi; Frontend hiển thị kết quả theo điều kiện đã chọn.

#### UC-04 — Điều khiển thiết bị

![Sequence UC-04: Điều khiển thiết bị](docs/sequences/uc-04-device-control.png)

1. Frontend tải trạng thái thiết bị qua `GET /api/current-data`.
2. Khi người dùng bật/tắt LED, giao diện chuyển sang trạng thái chờ và gửi `POST /api/device/control`.
3. Backend ghi nhận thao tác `LOADING`, gửi lệnh tới topic điều khiển MQTT; ESP32 thực thi qua GPIO rồi gửi trạng thái về.
4. Backend cập nhật lịch sử và phát kết quả cho Frontend. Nếu không có phản hồi trong thời hạn, thao tác được ghi nhận thất bại.

Chuyển Auto/Manual dùng `POST /api/device/mode`; Backend chờ ESP32 xác nhận trước khi trả kết quả.

#### UC-05 — Action History

![Sequence UC-05: Action History](docs/sequences/uc-05-action-history.png)

1. Frontend gọi `GET /api/actions` để lấy lịch sử thao tác.
2. Người dùng có thể tìm theo từ khóa/thời gian, lọc theo thiết bị hoặc trạng thái, sắp xếp và phân trang.
3. Backend truy vấn Database với các điều kiện đó rồi trả kết quả để Frontend cập nhật bảng.

#### UC-06 — Profile

![Sequence UC-06: Profile](docs/sequences/uc-06-profile.png)

1. Khi mở Profile, Frontend gọi `GET /api/user/profile`.
2. Backend đọc hồ sơ từ Database và trả tên, mã sinh viên, lớp cùng các liên kết GitHub, Figma, API docs và báo cáo.
3. Frontend hiển thị thông tin và các nút liên kết.

### 3.4 API hiện tại

| Method | Endpoint | Use Case / chức năng |
| --- | --- | --- |
| `POST` | `/api/auth/login` | UC-01: đăng nhập và nhận JWT |
| `GET` | `/api/current-data` | UC-02/04: số đo và trạng thái hiện tại |
| `GET` | `/api/dashboard-history` | UC-02: dữ liệu cho biểu đồ |
| `GET` | `/api/sensors` | UC-03: bảng số đo, tìm kiếm/lọc/sắp xếp/phân trang |
| `POST` | `/api/device/control` | UC-04: gửi lệnh bật/tắt LED |
| `POST` | `/api/device/mode` | UC-04: yêu cầu Auto hoặc Manual |
| `GET` | `/api/actions` | UC-05: bảng lịch sử thao tác |
| `GET` | `/api/user/profile` | UC-06: hồ sơ người dùng |
| `GET`, `POST` | `/api/settings` | Đọc và lưu ngưỡng cảnh báo |
| `GET` | `/api/warnings/statistics?month=YYYY-MM` | Tổng hợp số lần cảnh báo theo ngày trong tháng |
| `GET` | `/api/warnings/events?month=YYYY-MM&page=1&limit=25` | Danh sách sự kiện cảnh báo có phân trang |

## 4. Xây dựng hệ thống

### 4.1 Firmware ESP32

Firmware viết bằng C/C++ trong Arduino IDE, dùng thư viện WiFi, DHT, PubSubClient và ArduinoJson. ESP32 kết nối Wi-Fi/MQTT, đọc DHT11 và LDR, gửi JSON theo chu kỳ khoảng 2 giây, nhận cấu hình/lệnh và phát trạng thái GPIO. Nếu kết nối bị gián đoạn, thiết bị thử kết nối lại.

### 4.2 Frontend

Các màn hình hiện có gồm Login, Dashboard, Sensor Data, Control LED, Action History, Warning và Profile. Frontend dùng REST để lấy/gửi dữ liệu và Socket.IO cho cập nhật realtime. Báo cáo có đoạn mô tả SSE; phiên bản mã nguồn hiện tại dùng Socket.IO.

### 4.3 Backend và dữ liệu

Các API cần đăng nhập được bảo vệ bằng JWT Bearer. Lệnh điều khiển tạo bản ghi chờ và được đối chiếu với phản hồi thiết bị; timeout giúp phân biệt lệnh đã tiếp nhận với lệnh đã thực thi.

Database cần có schema nền của báo cáo. Các file migration trong dự án mở rộng bảng `system_settings`, thêm cấu hình ngưỡng cảnh báo, thêm `warning_history` và đưa thiết bị cảnh báo vào danh sách thiết bị.

### 4.4 Điều khiển Auto và Manual

Trong Auto, firmware dùng các điều kiện mặc định sau để điều khiển ba LED mô phỏng:

| Điều kiện | Đầu ra |
| --- | --- |
| Nhiệt độ > 30 °C | LED 01 — mô phỏng quạt |
| Độ ẩm > 68% | LED 02 — mô phỏng điều hòa |
| Ánh sáng < 100 | LED 03 — mô phỏng đèn |

Trong Manual, người dùng điều khiển từng LED trên Dashboard. Ngưỡng điều khiển Auto là logic riêng, không đồng nhất với ngưỡng cảnh báo bên dưới.

### 4.5 Cảnh báo ba cảm biến

ESP32 so sánh mỗi mẫu đo với ngưỡng cảnh báo trong cả Auto lẫn Manual. Mỗi cảm biến có một LED cảnh báo riêng. Khi giá trị vượt ngưỡng, LED tương ứng nhấp nháy; khi giá trị trở lại trong ngưỡng, LED tắt.

| Cảm biến | Điều kiện kích hoạt | Mặc định | Chân LED cảnh báo |
| --- | --- | --- | --- |
| Nhiệt độ | `temp > warning_temp_limit` | 30 °C | GPIO 26 |
| Độ ẩm | `humid > warning_humid_limit` | 68% | GPIO 27 |
| Ánh sáng | `light > warning_light_limit` | 900 trên thang 0–1000 | GPIO 25 |

Người dùng chỉnh ba ngưỡng trên Dashboard. Backend kiểm tra giá trị, lưu vào `system_settings`, rồi publish cấu hình MQTT retained để ESP32 nhận lại sau reconnect. Trạng thái LED cảnh báo được phát realtime lên giao diện. Khi một cảnh báo bắt đầu, thời điểm kích hoạt được ghi vào `warning_history` để thống kê theo ngày/tháng và xem danh sách sự kiện.

**Giới hạn đo ánh sáng:** firmware ánh xạ ADC 0–4095 sang thang 1000–0. Giá trị này chưa được hiệu chuẩn thành lux; ngưỡng 900 là mức tương đối của mô hình, không phải 900 lux. API giới hạn ngưỡng nhiệt độ trong khoảng 0–80 °C, độ ẩm 0–100% và ánh sáng là số nguyên 0–1000.

### 4.6 Cơ sở dữ liệu

Năm bảng nền theo ERD:

- `user`: tài khoản và thông tin hồ sơ.
- `device`: thiết bị, trạng thái và MQTT topic.
- `sensor`: loại cảm biến, đơn vị và thiết bị chứa cảm biến.
- `data_sensor`: các giá trị đo kèm thời gian.
- `action_history`: người thao tác, thiết bị, hành động và trạng thái thực thi.

Các bảng/cấu hình mở rộng hiện tại gồm `system_settings` và `warning_history`.

## 5. Yêu cầu phi chức năng

Báo cáo đặt trọng tâm vào cập nhật realtime, thao tác dễ theo dõi, phản hồi khi mất kết nối và kiểm tra kết quả điều khiển. Các chức năng tìm kiếm, lọc, sắp xếp và phân trang giúp tra cứu lịch sử; trạng thái `LOADING`, `SUCCESS` và `FAIL` làm rõ tiến trình của lệnh.

API riêng tư yêu cầu JWT Bearer. Firmware và Backend tự kết nối lại MQTT theo cơ chế của từng thành phần; lệnh điều khiển có thời hạn chờ phản hồi. Báo cáo chưa đưa ra phép đo chuẩn về sai số cảm biến, độ trễ đầu cuối hay tải đồng thời, nên các chỉ số này cần được đánh giá thêm trên phần cứng và môi trường triển khai thực tế.

## 6. Kết quả thực hiện

Hệ thống có các trang đăng nhập, Dashboard/biểu đồ, Sensor Data, điều khiển LED, Action History và Profile. Dashboard thể hiện ba thông số môi trường, trạng thái kết nối và thiết bị. Bảng dữ liệu hỗ trợ tìm kiếm/lọc/sắp xếp/phân trang; điều khiển thiết bị nhận phản hồi MQTT; phần mở rộng hiện tại bổ sung cảnh báo ba cảm biến và thống kê lịch sử cảnh báo.

### 6.1 Ảnh giao diện Web

Ảnh Login, Sensor Data, Action History và Profile được trích từ báo cáo. Ảnh Dashboard bên dưới là ảnh mới được cung cấp, thể hiện chế độ Auto, điều khiển LED và trạng thái cảnh báo của ba cảm biến. Báo cáo không có ảnh chụp riêng cho trang cảnh báo.

#### Đăng nhập

![Giao diện đăng nhập Sensor Monitor](docs/screenshots/login.png)

#### Dashboard và điều khiển thiết bị

![Dashboard mới với chế độ Auto, biểu đồ realtime, công tắc thiết bị và ba thẻ cảnh báo](docs/screenshots/dashboard.png)

#### Sensor Data

![Bảng dữ liệu cảm biến với tìm kiếm, lọc và phân trang](docs/screenshots/sensor-data.png)

#### Action History

![Lịch sử điều khiển thiết bị](docs/screenshots/action-history.png)

Mô hình hiện dùng một ESP32 và LED để mô phỏng tải. Giá trị ánh sáng chưa hiệu chuẩn theo lux, độ chính xác cảm biến và khả năng chạy liên tục chưa được đo đầy đủ.

## 7. Kết luận và hướng phát triển

Đề tài kết nối phần cứng ESP32, MQTT, Backend, MySQL và giao diện Web để thu thập, lưu trữ, hiển thị dữ liệu và điều khiển thiết bị. Sáu Use Case trong báo cáo bao quát đăng nhập, Dashboard realtime, tra cứu cảm biến, điều khiển thiết bị, lịch sử thao tác và hồ sơ người dùng. Mã nguồn hiện tại mở rộng thêm cảnh báo theo ngưỡng cho cả ba cảm biến.

Hướng phát triển:

- Hiệu chuẩn cảm biến ánh sáng và đối chiếu với thiết bị đo chuẩn.
- Đánh giá độ chính xác, độ trễ, khả năng hoạt động dài hạn và tải đồng thời.
- Mở rộng quản lý nhiều ESP32 và phân quyền theo thiết bị.
- Tăng cường bảo mật và triển khai máy chủ truy cập an toàn qua Internet.
- Thay LED mô phỏng bằng thiết bị chấp hành thật cùng mạch công suất và bảo vệ phù hợp.

## 8. Cài đặt và chạy dự án

### 8.1 Cài dependency

```sh
cd frontend
npm ci

cd ../backend
npm ci
```

### 8.2 Cấu hình dịch vụ

Từ thư mục `backend`, sao chép `.env.example` thành `.env`, sau đó đặt JWT secret ngẫu nhiên dài ít nhất 32 byte, tài khoản quản trị, MySQL và MQTT Broker. Giữ xác minh chứng chỉ TLS bật; chỉ tắt nếu đang dùng broker self-signed mà bạn tin cậy.

Khởi tạo database `smart_room` theo ERD/bảng nền trong báo cáo, bảo đảm có bản ghi `system_settings` với `id = 1`, rồi chạy migration trong `backend/migrations` theo thứ tự `001` đến `004`.

### 8.3 Chạy Backend và giao diện

```sh
cd backend
npm start
```

Lệnh này build Frontend trước rồi chạy Backend tại cổng `4000` theo mặc định. Khi phát triển giao diện, giữ Backend chạy và mở terminal khác:

```sh
cd frontend
npm run dev
```

Vite chạy ở cổng `5173` và chuyển tiếp API/Socket.IO đến Backend cổng `4000`. Có thể đổi cổng Backend bằng biến `PORT`.

### 8.4 ESP32 và Postman

- Sao chép `secrets.example.h` thành `secrets.h`, điền Wi-Fi/MQTT rồi đặt cạnh sketch Arduino. `secrets.h` bị Git ignore.
- Firmware mẫu nằm trong `code_IoT.txt`; chép nội dung vào sketch Arduino nếu IDE yêu cầu file `.ino`.
- Bộ sưu tập API ở `postman/`. Đặt `adminUsername` và `adminPassword` theo `backend/.env`, gửi đăng nhập để lấy JWT.
- Không commit `.env`, `secrets.h` hoặc credential thật.

## 9. Tài liệu tham khảo

Các tài liệu nền được nêu trong báo cáo:

- Espressif Systems — Arduino ESP32 Documentation.
- MQTT.org — MQTT: The Standard for IoT Messaging.
- Eclipse Mosquitto — Documentation.
- Express.js — Express: Node.js Web Application Framework.
- Oracle — MySQL 8.0 Reference Manual.
- Socket.IO — Introduction.
- Chart.js — Documentation.
- MDN Web Docs — Fetch API.

## Ghi chú về sequence

Ảnh sequence được giữ theo báo cáo để thể hiện luồng phân tích thiết kế. Một số chi tiết trong hình như truy vấn BCrypt/cookie hoặc tên route là bản mô tả thiết kế; phần API và mô tả triển khai ở README này theo mã nguồn hiện tại, trong đó Frontend dùng Bearer JWT trong `sessionStorage` và Socket.IO cho cập nhật realtime.
