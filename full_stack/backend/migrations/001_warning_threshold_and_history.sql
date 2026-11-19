-- Run once against the smart_room database before starting the updated backend.
ALTER TABLE system_settings
    ADD COLUMN warning_light_limit DECIMAL(10, 2) NOT NULL DEFAULT 900.00;

CREATE TABLE IF NOT EXISTS warning_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_warning_history_triggered_at (triggered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
