const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const JWT_ISSUER = 'iot-dashboard-api';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET) < 32) {
    throw new Error('Set JWT_SECRET to a stable random value of at least 32 bytes in backend/.env.');
}
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD in backend/.env.');
}

const app = express();
app.use(cors());
app.use(express.json());

// Phục vụ bản React đã build bằng Vite; mã nguồn nằm trong frontend/src.
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    // XAMPP uses 3406 because Windows reserves the default MySQL port 3306 here.
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_room',
    dateStrings: true
});

// Khai báo Topics MQTT
const TOPIC_SENSOR = 'data_sensors_TL297';
const TOPIC_STATUS = 'device_status_TL297';
const TOPIC_CONTROL = 'device_control_TL297';
const TOPIC_CONFIG = 'device_config_TL297';

// Kết nối MQTT Broker trên Máy ảo Ubuntu
const MQTT_URL = process.env.MQTT_URL;
if (!MQTT_URL) {
    throw new Error('Set MQTT_URL in backend/.env.');
}
const mqttClient = mqtt.connect(MQTT_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    rejectUnauthorized: process.env.MQTT_TLS_REJECT_UNAUTHORIZED !== 'false'
});

let mqttConnected = false;
// Chỉ xác nhận chế độ khi có phản hồi ESP32, không suy ra từ trạng thái broker.
let deviceMode = 'unknown';
let alertLedStatus = 'unknown';
let warningLedStatuses = { temp: 'unknown', humid: 'unknown', light: 'unknown' };
let modeRequestPending = false;
// DASHBOARD - AUTO/MANUAL Lưu mode ESP32 xác nhận và phát mode mới tới các client.
function setDeviceMode(mode) {
    deviceMode = mode;
    io.emit('device_mode_update', { mode });
}
// DASHBOARD - CẢNH BÁO: Đặt trạng thái LED cảnh báo thành unknown khi mất kết nối.
function publishMqttConnection(connected) {
    mqttConnected = connected;
    if (!connected) {
        setDeviceMode('unknown');
        alertLedStatus = 'unknown';
        warningLedStatuses = { temp: 'unknown', humid: 'unknown', light: 'unknown' };
        io.emit('alert_led_update', { status: alertLedStatus });
        io.emit('warning_led_update', { states: warningLedStatuses });
    }
    io.emit('mqtt_connection_status', { connected });
}
// DASHBOARD - SỬA NGƯỠNG: Đọc settings và publish config retained để ESP32 nhận cả sau reconnect.
async function publishSystemConfig() {
    const [rows] = await dbPool.query(
        'SELECT temp_limit, humid_limit, light_limit, warning_temp_limit, warning_humid_limit, warning_light_limit FROM system_settings WHERE id = 1'
    );
    if (rows.length === 0) throw new Error('system_settings row id = 1 was not found.');
    if (!mqttClient.connected) return false;

    const settings = rows[0];
    const payload = JSON.stringify({
        temp: Number(settings.temp_limit),
        humid: Number(settings.humid_limit),
        light: Number(settings.light_limit),
        warning_temp_limit: Number(settings.warning_temp_limit),
        warning_humid_limit: Number(settings.warning_humid_limit),
        warning_light_limit: Number(settings.warning_light_limit)
    });

    await new Promise((resolve, reject) => {
        mqttClient.publish(TOPIC_CONFIG, payload, { retain: true }, error => {
            error ? reject(error) : resolve();
        });
    });
    return true;
}
// DASHBOARD - CẢNH BÁO: Gửi snapshot trạng thái warning LED cho Socket client mới.
io.on('connection', (socket) => {
    socket.emit('mqtt_connection_status', { connected: mqttConnected });
    socket.emit('device_mode_update', { mode: deviceMode });
    socket.emit('alert_led_update', { status: alertLedStatus });
    socket.emit('warning_led_update', { states: warningLedStatuses });
});
['offline', 'close', 'reconnect', 'end'].forEach(event => {
    mqttClient.on(event, () => publishMqttConnection(false));
});

// DASHBOARD - REALTIME: Khi broker kết nối, backend subscribe topic cảm biến để nhận mẫu từ ESP32.
mqttClient.on('connect', () => {
    publishMqttConnection(true);
    console.log('Connected to MQTT Broker successfully!');
    mqttClient.subscribe([TOPIC_SENSOR, TOPIC_STATUS]);
    mqttClient.publish(TOPIC_CONTROL, JSON.stringify({ mode: 'status' }), { retain: false });
    publishSystemConfig().catch(error => console.error('Config publish error:', error.message));
});

mqttClient.on('error', (err) => {
    publishMqttConnection(false);
    console.error('MQTT Error:', err.message);
});

// SENSOR DATA - TỰ CẬP NHẬT: Nhận mẫu MQTT, lưu database rồi phát sensor_realtime cho frontend.
// DASHBOARD - REALTIME: Nhận MQTT sensor, lưu DB rồi phát sensor_realtime cho frontend.
mqttClient.on('message', async (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());

        // SENSOR DATA - TỰ CẬP NHẬT: Chỉ xử lý topic cảm biến; tạo ba bản ghi dùng chung timestamp.
        // DASHBOARD - REALTIME: Nhánh xử lý topic cảm biến; cùng timestamp cho ba sensor rows.
        if (topic === TOPIC_SENSOR) {
            const { temp, humid, light } = payload;
            const now = new Date();

            // SENSOR DATA - TỰ CẬP NHẬT: Ghi temp/humid/light vào data_sensor trước khi báo có dữ liệu mới.
            await dbPool.query(
                'INSERT INTO data_sensor (sensor_id, value, recorded_at) VALUES (1, ?, ?), (2, ?, ?), (3, ?, ?)',
                [temp, now, humid, now, light, now]
            );

            // SENSOR DATA - TỰ CẬP NHẬT: Sau khi INSERT thành công, phát event để frontend tăng sensorRevision.
            io.emit('sensor_realtime', { temp, humid, light, timestamp: now });
        }

        if (topic === TOPIC_STATUS) {
            const { device_id, status } = payload;
            const statusUpper = (status || '').toUpperCase();

            // Phản hồi chế độ không ghi vào ENUM trạng thái LED trong database.
            // DASHBOARD - AUTO/MANUAL ESP32 ACK system mode; cập nhật state và Socket event.
            if (device_id === 'system') {
                setDeviceMode(statusUpper === 'AUTO' ? 'auto' : statusUpper === 'MANUAL' ? 'manual' : 'unknown');
                return;
            }

            // DASHBOARD - CẢNH BÁO: Map status led4/warning_* thành trạng thái cảnh báo UI.
            const warningSensorByDevice = {
                warning_temp: 'temp',
                warning_humid: 'humid',
                led4: 'light'
            };
            const warningSensor = warningSensorByDevice[device_id];
            if (warningSensor) {
                const warningStatus = statusUpper === 'BLINKING' ? 'blinking' : 'off';
                warningLedStatuses[warningSensor] = warningStatus;
                io.emit('warning_led_update', {
                    sensor: warningSensor,
                    status: warningStatus,
                    states: warningLedStatuses
                });
                if (warningSensor === 'light') {
                    alertLedStatus = warningStatus;
                    await dbPool.query('UPDATE device SET status = ? WHERE mqtt_topic = ?', [statusUpper, device_id]);
                    io.emit('alert_led_update', { status: alertLedStatus });
                }
                if (payload.event === 'activated') {
                    const [result] = await dbPool.query(
                        'INSERT INTO warning_history (triggered_at) VALUES (NOW())'
                    );
                    io.emit('warning_activation_update', { id: result.insertId });

                    if (warningSensor === 'light') {
                        const [device] = await dbPool.query('SELECT id FROM device WHERE mqtt_topic = ?', [device_id]);
                        if (device.length > 0) {
                            const [action] = await dbPool.query(
                                `INSERT INTO action_history (user_id, device_id, action, status, time_action, time_status)
                                 VALUES (1, ?, 'ALERT', 'SUCCESS', NOW(), NOW())`,
                                [device[0].id]
                            );
                            io.emit('action_history_update', {
                                id: `#${String(action.insertId).padStart(3, '0')}`,
                                device: device_id,
                                action: 'ALERT',
                                status: 'SUCCESS'
                            });
                        }
                    }
                }
                return;
            }

            // DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ: Cập nhật DB/UI từ phản hồi status GPIO của ESP32.
            await dbPool.query('UPDATE device SET status = ? WHERE mqtt_topic = ?', [statusUpper, device_id]);
            io.emit('device_status_update', { device_id, status: statusUpper });

            // ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Status MQTT từ ESP32 tìm lệnh LOADING đang chờ để chốt kết quả.
            // 2. Tìm dòng LOADING đang chờ (Nếu người dùng vừa bấm nút trên Web)
            const [pendingActions] = await dbPool.query(
                `SELECT id, device_id, action FROM action_history
                WHERE device_id = (SELECT id FROM device WHERE mqtt_topic = ?) AND status = 'LOADING' AND time_status IS NULL
                ORDER BY id DESC LIMIT 1`,
                [device_id]
            );

            // ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Chốt LOADING một lần rồi chèn SUCCESS/FAIL thành hàng riêng.
            // DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ: Ghép ACK/offline với LOADING và tạo dòng SUCCESS/FAIL.
            if (pendingActions.length > 0) {
                setDeviceMode('manual');
                // Trường hợp A: Bấm trên Web nhưng ESP32 báo offline/hỏng -> FAIL, ngược lại -> SUCCESS
                const targetId = pendingActions[0].id;
                const finalStatus = (statusUpper === 'OFFLINE') ? 'FAIL' : 'SUCCESS';

                // Đánh dấu dòng LOADING đã được xử lý nhưng giữ nguyên trạng thái để xem lại lịch sử.
                const [claimed] = await dbPool.query(
                    'UPDATE action_history SET time_status = NOW() WHERE id = ? AND status = \'LOADING\' AND time_status IS NULL',
                    [targetId]
                );
                if (claimed.affectedRows > 0) {
                    // Ghi kết quả cuối thành dòng riêng để bản ghi LOADING vẫn tồn tại trong Action History.
                    const [finalRecord] = await dbPool.query(
                        `INSERT INTO action_history (user_id, device_id, action, status, time_action, time_status)
                         SELECT user_id, device_id, action, ?, time_action, NOW() FROM action_history WHERE id = ?`,
                        [finalStatus, targetId]
                    );
                    io.emit('action_history_update', {
                        id: `#${String(finalRecord.insertId).padStart(3, '0')}`,
                        device: device_id,
                        action: pendingActions[0].action,
                        status: finalStatus
                    });
                }

            } else if (statusUpper === 'OFFLINE') {
                // Trường hợp B: Rút bóng đột ngột bằng tay (Không bấm nút trên Web)
                const [device] = await dbPool.query('SELECT id FROM device WHERE mqtt_topic = ?', [device_id]);

                if (device.length > 0) {
                    // Tự động GHI MỚI 1 dòng báo LỖI (Action: OFF, Status: FAIL để an toàn với ENUM DB)
                    const [result] = await dbPool.query(
                        `INSERT INTO action_history (user_id, device_id, action, status, time_action, time_status)
                        VALUES (1, ?, 'OFF', 'FAIL', NOW(), NOW())`,
                        [device[0].id]
                    );

                    const newId = result.insertId;
                    const now = new Date();

                    // Phát Socket báo Web nảy dòng mới màu đỏ
                    io.emit('action_history_update', {
                        id: `#${String(newId).padStart(3, '0')}`,
                        device: device_id,
                        action: 'OFF',
                        status: 'FAIL',
                        date: now.toISOString().split('T')[0],
                        time_action: now.toTimeString().split(' ')[0],
                        time_status: now.toTimeString().split(' ')[0]
                    });
                }
            }
        }
    } catch (err) {
        console.error('MQTT Processing Error:', err);
    }
});

const apiRouter = express.Router();

// CHECK LOGIN (flow 0): Public login endpoint; kiểm tra credentials và cấp JWT một giờ.
apiRouter.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = jwt.sign(
            { role: 'admin' },
            JWT_SECRET,
            {
                algorithm: 'HS256',
                subject: username,
                issuer: JWT_ISSUER,
                expiresIn: '1h'
            }
        );
        return res.status(200).json({ token });
    }
    res.status(401).json({ message: 'Sai thông tin đăng nhập' });
});

// CHECK LOGIN (flow 0): Middleware bảo vệ các API đăng ký sau route login bằng Bearer JWT.
apiRouter.use((req, res, next) => {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
        return res.status(401).json({ message: 'Thiếu Bearer token.' });
    }

    try {
        const payload = jwt.verify(match[1], JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: JWT_ISSUER
        });
        if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string') {
            return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
        }
        req.auth = { username: payload.sub, role: payload.role };
        return next();
    } catch (_) {
        return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
});

// DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: GET /current-data trả số đo mới nhất, device status và mode.
apiRouter.get('/current-data', async (req, res) => {
    try {
        const [temp] = await dbPool.query('SELECT value FROM data_sensor WHERE sensor_id = 1 ORDER BY id DESC LIMIT 1');
        const [humid] = await dbPool.query('SELECT value FROM data_sensor WHERE sensor_id = 2 ORDER BY id DESC LIMIT 1');
        const [light] = await dbPool.query('SELECT value FROM data_sensor WHERE sensor_id = 3 ORDER BY id DESC LIMIT 1');
        const [devices] = await dbPool.query('SELECT mqtt_topic, status FROM device');

        const deviceMap = {};
        devices.forEach(d => {
            deviceMap[d.mqtt_topic] = d.status.toLowerCase();
        });

        res.status(200).json({
            sensors: {
                temp: Number(temp[0]?.value) || 0,
                humid: Number(humid[0]?.value) || 0,
                light: Number(light[0]?.value) || 0
            },
            devices: {
                led1: deviceMap['led1'] || 'off',
                led2: deviceMap['led2'] || 'off',
                led3: deviceMap['led3'] || 'off',
                mode: deviceMode
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: GET /dashboard-history ghép 12 mốc cho biểu đồ.
apiRouter.get('/dashboard-history', async (req, res) => {
    try {
        const [rows] = await dbPool.query(`
            SELECT DATE_FORMAT(ds.recorded_at, '%Y-%m-%dT%H:%i:%s') AS timestamp,
                   MAX(CASE WHEN ds.sensor_id = 1 THEN ds.value END) AS temp,
                   MAX(CASE WHEN ds.sensor_id = 2 THEN ds.value END) AS humid,
                   MAX(CASE WHEN ds.sensor_id = 3 THEN ds.value END) AS light
            FROM data_sensor ds
            JOIN (
                SELECT recorded_at FROM data_sensor
                WHERE sensor_id IN (1, 2, 3)
                GROUP BY recorded_at ORDER BY recorded_at DESC LIMIT 12
            ) recent ON ds.recorded_at = recent.recorded_at
            WHERE ds.sensor_id IN (1, 2, 3)
            GROUP BY ds.recorded_at ORDER BY ds.recorded_at ASC
        `);
        res.json({
            data: rows.map(row => ({
                timestamp: row.timestamp,
                temp: row.temp == null ? null : Number(row.temp),
                humid: row.humid == null ? null : Number(row.humid),
                light: row.light == null ? null : Number(row.light)
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Chọn ORDER BY từ các cột cho phép, chiều sort chỉ ASC hoặc DESC.
// SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Whitelist cột sort và chuẩn hóa chiều ASC/DESC cho /sensors.
function getSensorOrderBy(sortBy, sortOrder) {
    const dir = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    switch (sortBy) {
        case 'id':
            return `ds.id ${dir}`;
        case 'date':
        case 'time':
            // Ưu tiên: Thời gian -> Tên cảm biến -> ID
            return `ds.recorded_at ${dir}, s.name ASC, ds.id ${dir}`;
        case 'name':
            // Ưu tiên: Tên cảm biến -> Thời gian -> ID
            return `s.name ${dir}, ds.recorded_at DESC, ds.id ${dir}`;
        case 'val':
            // Ưu tiên: Giá trị -> Tên cảm biến -> Thời gian -> ID
            return `ds.value ${dir}, s.name ASC, ds.recorded_at DESC, ds.id ${dir}`;
        case 'type':
            // Ưu tiên: Loại cảm biến -> Tên cảm biến -> Thời gian -> ID
            return `s.sensor_type ${dir}, s.name ASC, ds.recorded_at DESC, ds.id ${dir}`;
        case 'unit':
            // Ưu tiên: Đơn vị -> Tên cảm biến -> Thời gian -> ID
            return `s.unit ${dir}, s.name ASC, ds.recorded_at DESC, ds.id ${dir}`;
        default:
            return `ds.id ${dir}`;
    }
}

// SENSOR DATA - TẢI BẢNG: GET /sensors truy vấn từng bản ghi, join metadata cảm biến và trả kết quả phân trang.
// SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Xác thực query, tạo điều kiện SQL, chạy phân trang và trả tổng kết quả.
// UC-03: Sensor Data Table
apiRouter.get('/sensors', async (req, res) => {
    try {
        // SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Đọc page/limit và từ chối limit ngoài khoảng 1–100.
        const page = parseInt(req.query.page) || 1;
        const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ message: 'Số bản ghi mỗi trang phải là số nguyên từ 1 đến 100.' });
        }
        const searchBy = req.query.search_by || 'name';
        const search = req.query.search || '';
        const type = req.query.type || 'all';
        const sortBy = req.query.sort_by || 'date';
        const sortOrder = (req.query.sort_order || 'desc').toUpperCase();

        // SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Map và kiểm tra type trước khi tạo điều kiện lọc cảm biến.
        // Chỉ nhận tên loại đúng như schema sensor lưu trong database.
        const sensorTypeMap = {
            temp: 'temp',
            humid: 'humid',
            light: 'light'
        };

        const offset = (page - 1) * limit;
        let whereConditions = ['1=1'];
        let queryParams = [];

        // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Chỉ cho phép all/temp/humid/light; loại cụ thể lọc sensor_type.
        if (type !== 'all') {
            const normalizedType = sensorTypeMap[type];
            if (!normalizedType) {
                return res.status(400).json({ message: 'Loại cảm biến không hợp lệ.' });
            }
            whereConditions.push('s.sensor_type = ?');
            queryParams.push(normalizedType);
        }

        // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Chọn nhánh tìm theo any/value/timestamp dựa trên search_by.
        if (search) {
            if (searchBy === 'any') {
                // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: any tìm ngày giờ, đơn vị và giá trị (số thì bằng chính xác).
                const searchText = String(search).trim().replace('T', ' ');
                const numericText = searchText.replace(',', '.');
                const anyConditions = [
                    "LOCATE(LOWER(?), LOWER(DATE_FORMAT(ds.recorded_at, '%Y-%m-%d %H:%i:%s'))) > 0",
                    'LOCATE(LOWER(?), LOWER(s.unit)) > 0'
                ];
                const anyParams = [searchText, searchText];

                if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(numericText)) {
                    anyConditions.push('ds.value = ?');
                    anyParams.push(Number(numericText));
                } else {
                    anyConditions.push('LOCATE(LOWER(?), LOWER(CAST(ds.value AS CHAR))) > 0');
                    anyParams.push(searchText);
                }

                whereConditions.push(`(${anyConditions.join(' OR ')})`);
                queryParams.push(...anyParams);
            } else if (searchBy === 'value' || sensorTypeMap[searchBy]) {
                // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Cảm biến cụ thể cần đầu vào số và lọc ds.value bằng chính xác.
                const value = String(search).trim().replace(',', '.');
                if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) {
                    return res.status(400).json({ message: 'Giá trị cảm biến phải là số, ví dụ: 30.5.' });
                }
                whereConditions.push('ds.value = ?');
                queryParams.push(Number(value));
            } else if (searchBy === 'timestamp') {
                // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Tìm chuỗi ngày/giờ trong thời điểm ghi mẫu.
                whereConditions.push("DATE_FORMAT(ds.recorded_at, '%Y-%m-%d %H:%i:%s') LIKE ?");
                queryParams.push(`%${String(search).trim().replace('T', ' ')}%`);
            } else if (searchBy === 'type') {
                whereConditions.push('s.sensor_type LIKE ?');
                queryParams.push(`%${String(search).trim()}%`);
            } else if (searchBy === 'unit') {
                whereConditions.push('s.unit LIKE ?');
                queryParams.push(`%${String(search).trim()}%`);
            } else if (searchBy === 'name') {
                whereConditions.push('s.name LIKE ?');
                queryParams.push(`%${search}%`);
            } else if (searchBy === 'date') {
                whereConditions.push('DATE(ds.recorded_at) = ?');
                queryParams.push(search);
            } else if (searchBy === 'time') {
                whereConditions.push('TIME(ds.recorded_at) LIKE ?');
                queryParams.push(`%${search}%`);
            }
        }

        // SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Giới hạn sort_by/sort_order vào ORDER BY hợp lệ.
        // SENSOR DATA - TÌM KIẾM VÀ BỘ LỌC: Chuyển sort_by/sort_order từ query thành ORDER BY hợp lệ.
        const orderSql = getSensorOrderBy(sortBy, sortOrder);

        // SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: JOIN tên/loại/đơn vị, áp dụng WHERE và LIMIT/OFFSET.
        const sql = `
            SELECT ds.id, s.name, s.sensor_type AS type, ds.value AS val, s.unit,
                   DATE_FORMAT(ds.recorded_at, '%Y-%m-%d') as date,
                   DATE_FORMAT(ds.recorded_at, '%H:%i:%s') as time
            FROM data_sensor ds
            JOIN sensor s ON ds.sensor_id = s.id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY ${orderSql}
            LIMIT ? OFFSET ?
        `;

        // SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Lấy đúng trang; COUNT dùng lại WHERE để tính total sau filter.
        // SENSOR DATA - TẢI BẢNG: Chạy SELECT có JOIN sensor, ORDER BY, LIMIT/OFFSET rồi đếm tổng phù hợp.
        const [rows] = await dbPool.query(sql, [...queryParams, limit, offset]);
        const [[{ total }]] = await dbPool.query(
            `SELECT COUNT(*) as total FROM data_sensor ds JOIN sensor s ON ds.sensor_id = s.id WHERE ${whereConditions.join(' AND ')}`,
            queryParams
        );

        // SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Định dạng id và ép val thành Number trước khi trả JSON.
        const formattedData = rows.map(item => ({
            ...item,
            id: `#${String(item.id).padStart(3, '0')}`,
            val: Number(item.val)
        }));

        // SENSOR DATA - BACKEND LỌC VÀ PHÂN TRANG: Trả count và các hàng của trang hiện tại cho SensorData.
        res.status(200).json({
            total,
            page,
            limit,
            data: formattedData
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DASHBOARD - AUTO/MANUAL Validate, publish lệnh và chờ ESP32 ACK tối đa 5 giây.
apiRouter.post('/device/mode', async (req, res) => {
    const requestedMode = req.body.mode;
    if (!['auto', 'manual'].includes(requestedMode)) {
        return res.status(400).json({ message: 'Chế độ phải là auto hoặc manual.' });
    }
    if (!mqttClient.connected) return res.status(503).json({ message: 'MQTT đang mất kết nối.' });
    if (modeRequestPending) return res.status(409).json({ message: 'Đang chờ ESP32 xác nhận chế độ.' });
    modeRequestPending = true;
    try {
        await new Promise((resolve, reject) => {
            let timer;
            let settled = false;
            const finish = error => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                mqttClient.removeListener('message', onStatus);
                mqttClient.removeListener('close', onClose);
                error ? reject(error) : resolve();
            };
            const onStatus = (topic, message) => {
                if (topic !== TOPIC_STATUS) return;
                try {
                    const data = JSON.parse(message.toString());
                    if (data.device_id === 'system' && data.status === requestedMode) finish();
                } catch (_) { /* Bỏ qua JSON không hợp lệ. */ }
            };
            const onClose = () => finish(new Error('MQTT mất kết nối khi đang chờ ESP32 xác nhận chế độ.'));
            mqttClient.on('message', onStatus);
            mqttClient.once('close', onClose);
            timer = setTimeout(() => finish(new Error(`ESP32 chưa xác nhận chế độ ${requestedMode} sau 5 giây.`)), 5000);
            mqttClient.publish(TOPIC_CONTROL, JSON.stringify({ mode: requestedMode }), { retain: false }, error => {
                if (error) finish(error);
            });
        });
        res.json({
            mode: requestedMode,
            message: requestedMode === 'auto' ? 'ESP32 đã bật chế độ Auto.' : 'Đã chuyển sang điều khiển thủ công.'
        });
    } catch (error) {
        res.status(504).json({ message: error.message });
    } finally {
        modeRequestPending = false;
    }
});

// DASHBOARD - ĐIỀU KHIỂN THIẾT BỊ: Ghi LOADING, publish lệnh và chốt FAIL nếu quá hạn.
// ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Tạo dòng LOADING, phát MQTT và thêm dòng FAIL riêng nếu quá 5 giây.
apiRouter.post('/device/control', async (req, res) => {
    try {
        const { device_id, status } = req.body;

        const [device] = await dbPool.query('SELECT id FROM device WHERE mqtt_topic = ?', [device_id]);
        if (device.length === 0) return res.status(404).json({ message: 'Device not found' });

        const actionStr = status ? 'ON' : 'OFF';

        // ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Lưu thao tác ban đầu ở trạng thái LOADING trước khi chờ ESP32.
        // 1. Tạo bản ghi LOADING
        const [result] = await dbPool.query(
            'INSERT INTO action_history (user_id, device_id, action, status, time_action) VALUES (1, ?, ?, "LOADING", NOW())',
            [device[0].id, actionStr]
        );
        const actionHistoryId = result.insertId; // Lấy ID vừa tạo
        // Đã yêu cầu điều khiển thủ công nhưng chưa biết ESP32 có nhận được hay không.
        setDeviceMode('unknown');
        io.emit('action_history_update', { id: `#${String(actionHistoryId).padStart(3, '0')}`, status: 'LOADING' });

        // ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: HTTP xác nhận đã tiếp nhận; publish MQTT mới gửi lệnh tới ESP32.
        // 2. Gửi lệnh qua MQTT
        mqttClient.publish(TOPIC_CONTROL, JSON.stringify({ device_id, status }), { retain: true });

        // ACTION HISTORY - LUỒNG LỆNH ĐIỀU KHIỂN: Nếu LOADING vẫn chưa được ACK sau 5 giây, ghi dòng kết quả FAIL.
        // 3. Cơ chế TIMEOUT 5 GIÂY: Nếu ESP32 không phản hồi -> Tự đánh dấu FAIL
        setTimeout(async () => {
            const [check] = await dbPool.query(
                'SELECT status, time_status FROM action_history WHERE id = ?',
                [actionHistoryId]
            );
            if (check.length > 0 && check[0].status === 'LOADING' && !check[0].time_status) {
                // Chốt dòng LOADING để MQTT đến muộn không thể xử lý cùng lệnh lần thứ hai.
                const [claimed] = await dbPool.query(
                    'UPDATE action_history SET time_status = NOW() WHERE id = ? AND status = "LOADING" AND time_status IS NULL',
                    [actionHistoryId]
                );
                if (claimed.affectedRows > 0) {
                    // Lưu FAIL thành dòng kết quả riêng, vẫn giữ dòng LOADING ban đầu.
                    const [finalRecord] = await dbPool.query(
                        `INSERT INTO action_history (user_id, device_id, action, status, time_action, time_status)
                         SELECT user_id, device_id, action, 'FAIL', time_action, NOW() FROM action_history WHERE id = ?`,
                        [actionHistoryId]
                    );
                    io.emit('action_history_update', {
                        id: `#${String(finalRecord.insertId).padStart(3, '0')}`,
                        device: device_id,
                        action: actionStr,
                        status: 'FAIL'
                    });
                }
            }
        }, 5000);

        res.status(200).json({ message: 'Đã tiếp nhận lệnh điều khiển thành công' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Hàm sinh ORDER BY chuẩn phân cấp cho Lịch sử thao tác
// ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Whitelist cột sort và chiều sort cho ORDER BY của /actions.
function getActionOrderBy(sortBy, sortOrder) {
    const dir = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    switch (sortBy) {
        case 'id':
            return `ah.id ${dir}`;
        case 'date':
        case 'time':
            // Ưu tiên: Thời gian thao tác -> Tên thiết bị -> ID
            return `ah.time_action ${dir}, d.name ASC, ah.id ${dir}`;
        case 'device':
            // Ưu tiên: Tên thiết bị -> Thời gian thao tác -> ID
            return `d.name ${dir}, ah.time_action DESC, ah.id ${dir}`;
        case 'action':
            // Ưu tiên: Hành động (ON/OFF/ALERT) -> Tên thiết bị -> Thời gian -> ID
            return `ah.action ${dir}, d.name ASC, ah.time_action DESC, ah.id ${dir}`;
        case 'status':
            // Ưu tiên: Trạng thái -> Tên thiết bị -> Thời gian -> ID
            return `${getActionStatusSql()} ${dir}, d.name ASC, ah.time_action DESC, ah.id ${dir}`;
        default:
            return `ah.id ${dir}`;
    }
}

// ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Chuẩn hóa SUCCESS/ON/OFF, LOADING và trạng thái lỗi để lọc/sort.
function getActionStatusSql() {
    return "CASE WHEN UPPER(TRIM(COALESCE(ah.status, ''))) IN ('SUCCESS', 'ON', 'OFF') THEN 'SUCCESS' WHEN UPPER(TRIM(COALESCE(ah.status, ''))) = 'LOADING' THEN 'LOADING' ELSE 'FAIL' END";
}

// ACTION HISTORY - TẢI DANH SÁCH: Đọc action_history, join device, lọc, phân trang và trả danh sách/counts.
// ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Nhận query từ UI rồi ghép điều kiện lọc/tìm kiếm bằng SQL parameters.
apiRouter.get('/actions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ message: 'Số bản ghi mỗi trang phải là số nguyên từ 1 đến 100.' });
        }
        const searchBy = req.query.search_by || 'name';
        const search = req.query.search || '';
        const deviceFilter = req.query.device || 'all';
        const actionFilter = req.query.action || 'all';
        const statusFilter = req.query.status || 'all';
        const sortBy = req.query.sort_by || 'date';
        const sortOrder = (req.query.sort_order || 'desc').toUpperCase();

        const offset = (page - 1) * limit;
        let whereConditions = ["COALESCE(d.mqtt_topic, '') <> ?"];
        let queryParams = ['led4'];

        const deviceTopicMap = {
            'LED 01': 'led1',
            'LED 02': 'led2',
            'LED 03': 'led3',
            'LED 04': 'led4',
            'LED cảnh báo': 'led4',
            'Hệ thống': 'system',
            'Quạt': 'led1',
            'Điều hòa': 'led2',
            'Đèn': 'led3'
        };

        // ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Các filter chỉ thêm điều kiện SQL và giá trị vào queryParams.
        if (deviceFilter !== 'all') {
            const targetTopic = deviceTopicMap[deviceFilter] || deviceFilter;
            whereConditions.push('d.mqtt_topic = ?');
            queryParams.push(targetTopic);
        }

        if (actionFilter !== 'all') {
            if (!['ON', 'OFF', 'ALERT'].includes(actionFilter)) {
                return res.status(400).json({ message: 'Action must be ON, OFF, or ALERT.' });
            }
            whereConditions.push('UPPER(ah.action) = ?');
            queryParams.push(actionFilter);
        }
        if (statusFilter !== 'all') {
            if (!['SUCCESS', 'FAIL', 'LOADING'].includes(statusFilter)) {
                return res.status(400).json({ message: 'Trạng thái phải là SUCCESS, FAIL hoặc LOADING.' });
            }
            whereConditions.push(`${getActionStatusSql()} = ?`);
            queryParams.push(statusFilter);
        }

        // ACTION HISTORY - TÌM KIẾM/LỌC/SẮP XẾP: Timestamp tìm theo chuỗi ngày/giờ trong time_action.
        if (search) {
            if (searchBy === 'timestamp') {
                whereConditions.push("DATE_FORMAT(ah.time_action, '%Y-%m-%d %H:%i:%s') LIKE ?");
                queryParams.push(`%${String(search).trim().replace('T', ' ')}%`);
            } else if (searchBy === 'name') {
                whereConditions.push('d.name LIKE ?');
                queryParams.push(`%${search}%`);
            } else if (searchBy === 'date') {
                whereConditions.push('DATE(ah.time_action) = ?');
                queryParams.push(search);
            } else if (searchBy === 'time') {
                whereConditions.push('TIME(ah.time_action) LIKE ?');
                queryParams.push(`%${search}%`);
            }
        }

        const orderSql = getActionOrderBy(sortBy, sortOrder);

        const sql = `
            SELECT ah.id, d.name AS device, ah.action, ah.status,
                DATE_FORMAT(ah.time_action, '%Y-%m-%d') as date,
                DATE_FORMAT(ah.time_action, '%H:%i:%s') as time_action,
                DATE_FORMAT(ah.time_status, '%H:%i:%s') as time_status
            FROM action_history ah
            JOIN device d ON ah.device_id = d.id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY ${orderSql}
            LIMIT ? OFFSET ?
        `;

        const [rows] = await dbPool.query(sql, [...queryParams, limit, offset]);
        const [[{ total }]] = await dbPool.query(
            `SELECT COUNT(*) as total FROM action_history ah JOIN device d ON ah.device_id = d.id WHERE ${whereConditions.join(' AND ')}`,
            queryParams
        );

        const formattedData = rows.map(item => ({
            ...item,
            id: `#${String(item.id).padStart(3, '0')}`
        }));

        const [[allCount]] = await dbPool.query(
            "SELECT COUNT(*) AS total FROM action_history ah JOIN device d ON ah.device_id = d.id WHERE COALESCE(d.mqtt_topic, '') <> 'led4'"
        );
        const totalAll = allCount.total;
        res.status(200).json({ total, total_all: totalAll, page, limit, data: formattedData });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// UC-06: Profile
apiRouter.get('/user/profile', async (req, res) => {
    try {
        const [user] = await dbPool.query('SELECT full_name, student_id, class, username, github_url, figma_url, api_doc_url, report_url FROM user WHERE id = 1');
        if (user.length === 0) return res.status(404).json({ message: 'User not found' });

        const userData = user[0];
        res.status(200).json({
            full_name: userData.full_name,
            student_id: userData.student_id,
            class: userData.class,
            username: userData.username,
            links: {
                github: userData.github_url,
                figma: userData.figma_url,
                api_docs: userData.api_doc_url,
                report_pdf: userData.report_url
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Return daily warning activation counts for the requested recent period.
function parseWarningMonth(value) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 2000 || year > 2100) return null;

    const nextMonth = new Date(Date.UTC(year, month, 1));
    return {
        month: `${match[1]}-${match[2]}`,
        start: `${match[1]}-${match[2]}-01 00:00:00`,
        end: `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`,
        days: new Date(Date.UTC(year, month, 0)).getUTCDate()
    };
}

apiRouter.get('/warnings/statistics', async (req, res) => {
    try {
        const range = parseWarningMonth(req.query.month);
        if (!range) return res.status(400).json({ message: 'month must use YYYY-MM format.' });

        const [rows] = await dbPool.query(
            `SELECT DAY(triggered_at) AS day, COUNT(*) AS count
             FROM warning_history
             WHERE triggered_at >= ? AND triggered_at < ?
             GROUP BY DAY(triggered_at)
             ORDER BY DAY(triggered_at) ASC`,
            [range.start, range.end]
        );
        const countByDay = new Map(rows.map(row => [Number(row.day), Number(row.count)]));
        const daily = Array.from({ length: range.days }, (_, index) => ({
            day: index + 1,
            count: countByDay.get(index + 1) || 0
        }));
        res.json({
            month: range.month,
            total: daily.reduce((sum, item) => sum + item.count, 0),
            daily
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

apiRouter.get('/warnings/events', async (req, res) => {
    try {
        const range = parseWarningMonth(req.query.month);
        if (!range) return res.status(400).json({ message: 'month must use YYYY-MM format.' });
        const page = req.query.page === undefined ? 1 : Number(req.query.page);
        const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ message: 'page and limit must be valid positive integers.' });
        }

        const [[{ total }]] = await dbPool.query(
            'SELECT COUNT(*) AS total FROM warning_history WHERE triggered_at >= ? AND triggered_at < ?',
            [range.start, range.end]
        );
        const [events] = await dbPool.query(
            `SELECT id, DATE_FORMAT(triggered_at, '%Y-%m-%d %H:%i:%s') AS triggered_at
             FROM warning_history
             WHERE triggered_at >= ? AND triggered_at < ?
             ORDER BY triggered_at DESC, id DESC
             LIMIT ? OFFSET ?`,
            [range.start, range.end, limit, (page - 1) * limit]
        );
        res.json({ total: Number(total), page, limit, events });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DASHBOARD - NẠP DỮ LIỆU BAN ĐẦU: GET /settings trả ba ngưỡng cảnh báo cho Dashboard.
apiRouter.get('/settings', async (req, res) => {
    try {
        const [rows] = await dbPool.query(
            'SELECT warning_temp_limit, warning_humid_limit, warning_light_limit FROM system_settings WHERE id = 1'
        );
        const settings = rows[0] || {};
        const warningTempLimit = Number(settings.warning_temp_limit ?? 30);
        const warningHumidLimit = Number(settings.warning_humid_limit ?? 68);
        const warningLightLimit = Number(settings.warning_light_limit ?? 900);
        res.status(200).json({
            warning_temp_limit: Number.isFinite(warningTempLimit) ? warningTempLimit : 30,
            warning_humid_limit: Number.isFinite(warningHumidLimit) ? warningHumidLimit : 68,
            warning_light_limit: Number.isFinite(warningLightLimit) ? Math.trunc(warningLightLimit) : 900
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DASHBOARD - SỬA NGƯỠNG: Validate, lưu warning thresholds vào DB rồi đồng bộ config qua MQTT.
apiRouter.post('/settings', async (req, res) => {
    try {
        const [rows] = await dbPool.query(
            'SELECT warning_temp_limit, warning_humid_limit, warning_light_limit FROM system_settings WHERE id = 1'
        );
        const current = rows[0] || {};
        const hasTemp = req.body?.warning_temp_limit !== undefined;
        const hasHumid = req.body?.warning_humid_limit !== undefined;
        const hasLight = req.body?.warning_light_limit !== undefined;
        const rawTemp = hasTemp ? req.body.warning_temp_limit : current.warning_temp_limit ?? 30;
        const rawHumid = hasHumid ? req.body.warning_humid_limit : current.warning_humid_limit ?? 68;
        const rawLight = hasLight ? req.body.warning_light_limit : current.warning_light_limit ?? 900;
        const warningTempLimit = Number(rawTemp);
        const warningHumidLimit = Number(rawHumid);
        const warningLightLimit = Number(rawLight);
        if (
            (typeof rawTemp === 'string' && rawTemp.trim() === '') ||
            !Number.isFinite(warningTempLimit) || warningTempLimit < 0 || warningTempLimit > 80
        ) {
            return res.status(400).json({ message: 'Temperature warning threshold must be between 0 and 80 °C.' });
        }
        if (
            (typeof rawHumid === 'string' && rawHumid.trim() === '') ||
            !Number.isFinite(warningHumidLimit) || warningHumidLimit < 0 || warningHumidLimit > 100
        ) {
            return res.status(400).json({ message: 'Humidity warning threshold must be between 0 and 100%.' });
        }
        if (
            (typeof rawLight === 'string' && rawLight.trim() === '') ||
            !Number.isInteger(warningLightLimit) || warningLightLimit < 0 || warningLightLimit > 1000
        ) {
            return res.status(400).json({ message: 'Light warning threshold must be an integer between 0 and 1000 lux.' });
        }

        await dbPool.query(
            'UPDATE system_settings SET warning_temp_limit = ?, warning_humid_limit = ?, warning_light_limit = ? WHERE id = 1',
            [Number(warningTempLimit.toFixed(1)), Number(warningHumidLimit.toFixed(1)), warningLightLimit]
        );
        const published = await publishSystemConfig();
        res.status(200).json({
            warning_temp_limit: Number(warningTempLimit.toFixed(1)),
            warning_humid_limit: Number(warningHumidLimit.toFixed(1)),
            warning_light_limit: warningLightLimit,
            message: published
                ? 'Warning thresholds saved and published to MQTT.'
                : 'Warning thresholds saved; they will sync when MQTT reconnects.'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.use('/api', apiRouter);

// API không tồn tại phải trả JSON, không trả trang React cho fetch().
app.use('/api', (req, res) => res.status(404).json({ message: 'API không tồn tại.' }));

// Express 5: wildcard có tên để phục vụ SPA khi mở URL trực tiếp.
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
});

// Port 3000 may be reserved by Windows; allow overriding it with PORT.
const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
