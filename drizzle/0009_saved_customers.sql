CREATE TABLE `customers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `customer_name` text NOT NULL,
  `customer_address` text DEFAULT '' NOT NULL,
  `customer_city` text DEFAULT '' NOT NULL,
  `customer_state` text DEFAULT '' NOT NULL,
  `customer_zip` text DEFAULT '' NOT NULL,
  `ship_to` text DEFAULT '' NOT NULL,
  `ship_to_address` text DEFAULT '' NOT NULL,
  `ship_to_city` text DEFAULT '' NOT NULL,
  `ship_to_state` text DEFAULT '' NOT NULL,
  `ship_to_zip` text DEFAULT '' NOT NULL,
  `contact_name` text DEFAULT '' NOT NULL,
  `contact_phone` text DEFAULT '' NOT NULL,
  `email` text DEFAULT '' NOT NULL,
  `comments` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_id` integer REFERENCES customers(id);
