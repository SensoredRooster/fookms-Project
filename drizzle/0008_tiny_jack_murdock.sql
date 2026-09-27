ALTER TABLE `order_lines` ADD `cut_length_inches` real;--> statement-breakpoint
ALTER TABLE `orders` ADD `purchase_order_number` text DEFAULT '' NOT NULL;