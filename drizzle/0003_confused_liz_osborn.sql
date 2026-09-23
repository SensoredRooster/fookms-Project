CREATE TABLE `order_submission_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `source` text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `contact_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `contact_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stations` ADD `online_intake` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX idx_stations_online_intake ON stations(online_intake) WHERE online_intake=1;
