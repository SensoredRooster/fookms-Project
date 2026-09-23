CREATE TABLE `order_line_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`type` text NOT NULL,
	`from_station_id` integer,
	`to_station_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `order_lines` ADD `current_station_id` integer REFERENCES stations(id);--> statement-breakpoint
ALTER TABLE `order_lines` ADD `action_done` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_lines` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `stations` ADD `action` text DEFAULT '' NOT NULL;--> statement-breakpoint
DROP TRIGGER fulfill_order_stock;
--> statement-breakpoint
CREATE INDEX idx_order_line_events_order ON order_line_events(order_id, id);
--> statement-breakpoint
CREATE TRIGGER station_step_done AFTER UPDATE OF action_done ON order_lines
WHEN OLD.action_done = 0 AND NEW.action_done = 1
BEGIN
  SELECT RAISE(ABORT, 'Order is not processing')
  WHERE NEW.completed_at IS NOT NULL OR (SELECT status FROM orders WHERE id = NEW.order_id) != 'processing';
  INSERT INTO order_line_events(order_id, item_id, type, from_station_id, to_station_id, created_at)
  VALUES(NEW.order_id, NEW.item_id, 'step_done', COALESCE(NEW.current_station_id, (SELECT station_id FROM orders WHERE id=NEW.order_id)), NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
--> statement-breakpoint
CREATE TRIGGER station_handoff AFTER UPDATE OF current_station_id ON order_lines
WHEN NEW.current_station_id IS NOT NULL AND NEW.current_station_id != COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id))
BEGIN
  SELECT RAISE(ABORT, 'Station step incomplete')
  WHERE OLD.action_done != 1 OR NEW.action_done != 0 OR OLD.completed_at IS NOT NULL
    OR (SELECT status FROM orders WHERE id=NEW.order_id) != 'processing';
  SELECT RAISE(ABORT, 'Insufficient station stock')
  WHERE COALESCE((SELECT quantity FROM stock WHERE station_id=COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)) AND item_id=NEW.item_id), 0) < NEW.quantity;
  UPDATE stock SET quantity=quantity-NEW.quantity
  WHERE station_id=COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)) AND item_id=NEW.item_id;
  INSERT INTO stock(station_id,item_id,quantity) VALUES(NEW.current_station_id, NEW.item_id, NEW.quantity)
  ON CONFLICT(station_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity;
  INSERT INTO movements(item_id,from_station_id,to_station_id,quantity,note,created_at,order_id)
  VALUES(NEW.item_id, COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)), NEW.current_station_id, NEW.quantity, 'Order '||(SELECT number FROM orders WHERE id=NEW.order_id), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NEW.order_id);
  INSERT INTO order_line_events(order_id,item_id,type,from_station_id,to_station_id,created_at)
  VALUES(NEW.order_id,NEW.item_id,'handoff',COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)),NEW.current_station_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
--> statement-breakpoint
CREATE TRIGGER station_item_complete AFTER UPDATE OF completed_at ON order_lines
WHEN OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Station step incomplete')
  WHERE OLD.action_done != 1 OR (SELECT status FROM orders WHERE id=NEW.order_id) != 'processing';
  SELECT RAISE(ABORT, 'Insufficient station stock')
  WHERE COALESCE((SELECT quantity FROM stock WHERE station_id=COALESCE(NEW.current_station_id, (SELECT station_id FROM orders WHERE id=NEW.order_id)) AND item_id=NEW.item_id), 0) < NEW.quantity;
  UPDATE stock SET quantity=quantity-NEW.quantity
  WHERE station_id=COALESCE(NEW.current_station_id, (SELECT station_id FROM orders WHERE id=NEW.order_id)) AND item_id=NEW.item_id;
  INSERT INTO movements(item_id,from_station_id,to_station_id,quantity,note,created_at,order_id)
  VALUES(NEW.item_id, COALESCE(NEW.current_station_id, (SELECT station_id FROM orders WHERE id=NEW.order_id)), NULL, NEW.quantity, 'Order '||(SELECT number FROM orders WHERE id=NEW.order_id), NEW.completed_at, NEW.order_id);
  INSERT INTO order_line_events(order_id,item_id,type,from_station_id,to_station_id,created_at)
  VALUES(NEW.order_id,NEW.item_id,'completed',COALESCE(NEW.current_station_id, (SELECT station_id FROM orders WHERE id=NEW.order_id)),NULL,NEW.completed_at);
  UPDATE orders SET status='fulfilled',updated_at=NEW.completed_at
  WHERE id=NEW.order_id AND NOT EXISTS(SELECT 1 FROM order_lines WHERE order_id=NEW.order_id AND completed_at IS NULL);
END;
