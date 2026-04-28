-- Create database
CREATE DATABASE IF NOT EXISTS rental_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rental_db;

-- Tenants / Records table
CREATE TABLE IF NOT EXISTS rental_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_name VARCHAR(255) NOT NULL COMMENT 'ឈ្មោះអ្នកជួល',
  phone VARCHAR(50) NOT NULL COMMENT 'លេខទូរស័ព្ទ',
  room_number VARCHAR(50) NOT NULL COMMENT 'លេខបន្ទប់',
  room_price DECIMAL(10,2) NOT NULL COMMENT 'តម្លៃបន្ទប់',
  checkin_date DATE NOT NULL COMMENT 'ថ្ងៃចូលស្នាក់',
  status ENUM('unpaid', 'paid') DEFAULT 'unpaid' COMMENT 'ស្ថានភាពបង់ប្រាក់',
  months_count INT DEFAULT 1 COMMENT 'ចំនួនខែ',
  total_due DECIMAL(10,2) DEFAULT 0 COMMENT 'ចំនួនទឹកប្រាក់សរុបជំពាក់',
  last_paid_date DATE NULL COMMENT 'ថ្ងៃបង់ប្រាក់ចុងក្រោយ',
  notes TEXT NULL COMMENT 'កំណត់ចំណាំ',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rental_id INT NOT NULL,
  months_paid INT NOT NULL COMMENT 'ចំនួនខែបង់',
  amount_paid DECIMAL(10,2) NOT NULL COMMENT 'ចំនួនទឹកប្រាក់បានបង់',
  paid_date DATE NOT NULL COMMENT 'ថ្ងៃបង់',
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rental_id) REFERENCES rental_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
