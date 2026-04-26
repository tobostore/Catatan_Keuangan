-- Recreate schema and starter data for catatan_pengeluaran
-- Safe to run repeatedly (uses IF NOT EXISTS and UPSERT-style patterns)

CREATE DATABASE IF NOT EXISTS `catatan_pengeluaran`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `catatan_pengeluaran`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NULL,
  `password_hash` CHAR(32) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'cash',
  `institution` VARCHAR(191) NULL,
  `account_number` VARCHAR(191) NULL,
  `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_accounts_user_id` (`user_id`),
  UNIQUE KEY `uniq_accounts_user_name` (`user_id`, `name`),
  CONSTRAINT `fk_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('income', 'expense') NOT NULL,
  `color` VARCHAR(20) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_categories_user_id` (`user_id`),
  UNIQUE KEY `uniq_categories_user_name_type` (`user_id`, `name`, `type`),
  CONSTRAINT `fk_categories_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_allocation_rules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `percentage` DECIMAL(6,2) NOT NULL,
  `description` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_allocation_rules_user_id` (`user_id`),
  CONSTRAINT `fk_user_allocation_rules_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `account_id` BIGINT UNSIGNED NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('income', 'expense') NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `description` TEXT NULL,
  `transaction_date` DATE NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_transactions_user_id` (`user_id`),
  KEY `idx_transactions_account_id` (`account_id`),
  KEY `idx_transactions_category_id` (`category_id`),
  KEY `idx_transactions_date` (`transaction_date`),
  CONSTRAINT `fk_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transactions_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transactions_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `whatsapp_sender_links` (
  `sender_jid` VARCHAR(191) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `account_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`sender_jid`),
  KEY `idx_sender_links_user_id` (`user_id`),
  KEY `idx_sender_links_account_id` (`account_id`),
  CONSTRAINT `fk_sender_links_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sender_links_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `whatsapp_poll_state` (
  `chat_jid` VARCHAR(191) NOT NULL,
  `last_message_id` VARCHAR(191) NULL,
  `last_timestamp` DATETIME NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`chat_jid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_budget_analysis` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `monthly_income` BIGINT NOT NULL,
  `status_keuangan` ENUM('sehat', 'perhatian', 'kritis') NOT NULL,
  `persentase_pengeluaran` DECIMAL(5,2) NULL,
  `pesan_utama` TEXT NULL,
  `analysis_json` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_month` (`user_id`, `month`),
  KEY `idx_ai_budget_user_month` (`user_id`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_alerts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `tipe` VARCHAR(50) NOT NULL,
  `level` ENUM('warning', 'danger') NOT NULL,
  `judul` VARCHAR(100) NOT NULL,
  `pesan` TEXT NOT NULL,
  `aksi` TEXT NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `expired_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_alerts_user_status` (`user_id`, `is_read`, `expired_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_monthly_summary` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `skor_keuangan` INT NULL,
  `grade` CHAR(1) NULL,
  `summary_json` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_month_summary` (`user_id`, `month`),
  KEY `idx_ai_monthly_summary_user_month` (`user_id`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Starter user (password: 123456, md5)
INSERT INTO `users` (`id`, `email`, `name`, `password_hash`)
VALUES (1, 'admin@catatan.local', 'Admin', 'e10adc3949ba59abbe56e057f20f883e')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `password_hash` = VALUES(`password_hash`);

INSERT INTO `accounts` (`user_id`, `name`, `type`, `institution`, `account_number`, `opening_balance`)
SELECT 1, 'Cash', 'cash', NULL, NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `accounts` WHERE `user_id` = 1 AND `name` = 'Cash'
);

INSERT INTO `accounts` (`user_id`, `name`, `type`, `institution`, `account_number`, `opening_balance`)
SELECT 1, 'Bank BCA', 'bank', 'BCA', NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `accounts` WHERE `user_id` = 1 AND `name` = 'Bank BCA'
);

INSERT INTO `categories` (`user_id`, `name`, `type`, `color`)
SELECT 1, 'Makan', 'expense', '#dc2626'
WHERE NOT EXISTS (
  SELECT 1 FROM `categories` WHERE `user_id` = 1 AND `name` = 'Makan' AND `type` = 'expense'
);

INSERT INTO `categories` (`user_id`, `name`, `type`, `color`)
SELECT 1, 'Transport', 'expense', '#dc2626'
WHERE NOT EXISTS (
  SELECT 1 FROM `categories` WHERE `user_id` = 1 AND `name` = 'Transport' AND `type` = 'expense'
);

INSERT INTO `categories` (`user_id`, `name`, `type`, `color`)
SELECT 1, 'Gaji', 'income', '#16a34a'
WHERE NOT EXISTS (
  SELECT 1 FROM `categories` WHERE `user_id` = 1 AND `name` = 'Gaji' AND `type` = 'income'
);

INSERT INTO `user_allocation_rules` (`user_id`, `name`, `percentage`, `description`, `sort_order`, `is_active`)
SELECT 1, 'Kebutuhan Pokok', 50.00, 'Preferensi alokasi budget', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `user_allocation_rules` WHERE `user_id` = 1 AND LOWER(`name`) = 'kebutuhan pokok'
);

INSERT INTO `user_allocation_rules` (`user_id`, `name`, `percentage`, `description`, `sort_order`, `is_active`)
SELECT 1, 'Keinginan', 30.00, 'Preferensi alokasi budget', 2, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `user_allocation_rules` WHERE `user_id` = 1 AND LOWER(`name`) = 'keinginan'
);

INSERT INTO `user_allocation_rules` (`user_id`, `name`, `percentage`, `description`, `sort_order`, `is_active`)
SELECT 1, 'Tabungan', 20.00, 'Preferensi alokasi budget', 3, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `user_allocation_rules` WHERE `user_id` = 1 AND LOWER(`name`) = 'tabungan'
);
