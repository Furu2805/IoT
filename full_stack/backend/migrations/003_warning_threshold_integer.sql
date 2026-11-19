-- Store light warning thresholds as whole sensor readings.
ALTER TABLE system_settings
    MODIFY COLUMN warning_light_limit INT NOT NULL DEFAULT 900;
