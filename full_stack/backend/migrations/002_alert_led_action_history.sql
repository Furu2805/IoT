-- Add the warning LED to the device catalog used by Action History.
INSERT INTO device (name, device_type, status, mqtt_topic)
SELECT 'LED cảnh báo', 'LED', 'OFF', 'led4'
WHERE NOT EXISTS (
    SELECT 1 FROM device WHERE mqtt_topic = 'led4'
);
