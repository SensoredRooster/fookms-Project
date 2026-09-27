CREATE TABLE `issue_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_id` text NOT NULL,
	`reporter_email` text NOT NULL,
	`title` text NOT NULL,
	`details` text NOT NULL,
	`steps` text DEFAULT '' NOT NULL,
	`screen` text NOT NULL,
	`severity` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
