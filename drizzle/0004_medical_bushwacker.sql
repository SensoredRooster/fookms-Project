CREATE TABLE `floor_features` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'room' NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `floor_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`width` integer DEFAULT 80 NOT NULL,
	`height` integer DEFAULT 50 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `stations` ADD `floor_x` integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE `stations` ADD `floor_y` integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE `stations` ADD `floor_w` integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE `stations` ADD `floor_h` integer DEFAULT 6 NOT NULL;