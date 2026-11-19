-- Add dedicated warning thresholds for temperature and humidity.
ALTER TABLE system_settings
    ADD COLUMN warning_temp_limit DECIMAL(5, 1) NOT NULL DEFAULT 30.0,
    ADD COLUMN warning_humid_limit DECIMAL(5, 1) NOT NULL DEFAULT 68.0;
