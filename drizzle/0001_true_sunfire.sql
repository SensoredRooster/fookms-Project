CREATE TABLE `order_lines` (
	`order_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`order_id`, `item_id`),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_line_positive" CHECK("order_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`station_id` integer NOT NULL,
	`requested_by` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
ALTER TABLE `movements` ADD `order_id` integer;--> statement-breakpoint
CREATE INDEX idx_orders_station_status ON orders(station_id, status);
--> statement-breakpoint
CREATE INDEX idx_movements_order_id ON movements(order_id);
--> statement-breakpoint
CREATE TRIGGER fulfill_order_stock AFTER UPDATE OF status ON orders
WHEN NEW.status = 'fulfilled' AND OLD.status = 'processing'
BEGIN
  SELECT RAISE(ABORT, 'Insufficient station stock')
  WHERE EXISTS (
    SELECT 1 FROM order_lines l
    LEFT JOIN stock s ON s.station_id = NEW.station_id AND s.item_id = l.item_id
    WHERE l.order_id = NEW.id AND COALESCE(s.quantity, 0) < l.quantity
  );
  UPDATE stock SET quantity = quantity - (
    SELECT l.quantity FROM order_lines l WHERE l.order_id = NEW.id AND l.item_id = stock.item_id
  ) WHERE station_id = NEW.station_id AND item_id IN (
    SELECT item_id FROM order_lines WHERE order_id = NEW.id
  );
  INSERT INTO movements(item_id, from_station_id, to_station_id, quantity, note, created_at, order_id)
  SELECT item_id, NEW.station_id, NULL, quantity, 'Order ' || NEW.number, NEW.updated_at, NEW.id
  FROM order_lines WHERE order_id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER validate_order_status BEFORE UPDATE OF status ON orders
WHEN NOT (
  (OLD.status = 'received' AND NEW.status IN ('processing', 'cancelled'))
  OR (OLD.status = 'processing' AND NEW.status IN ('fulfilled', 'cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'Invalid order status transition');
END;
