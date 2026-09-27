ALTER TABLE order_lines ADD original_item_id integer REFERENCES items(id);
--> statement-breakpoint
ALTER TABLE order_lines ADD original_quantity integer;
--> statement-breakpoint
DROP TRIGGER station_handoff;
--> statement-breakpoint
CREATE TRIGGER station_handoff AFTER UPDATE OF current_station_id ON order_lines
WHEN NEW.current_station_id IS NOT NULL AND NEW.current_station_id != COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)) AND NEW.item_id=OLD.item_id AND NEW.quantity=OLD.quantity
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
CREATE TRIGGER station_production_handoff AFTER UPDATE OF current_station_id ON order_lines
WHEN NEW.current_station_id IS NOT NULL AND NEW.current_station_id != COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)) AND NEW.item_id != OLD.item_id
BEGIN
  SELECT RAISE(ABORT, 'Station step incomplete')
  WHERE OLD.action_done != 1 OR NEW.action_done != 0 OR OLD.completed_at IS NOT NULL
    OR (SELECT status FROM orders WHERE id=NEW.order_id) != 'processing';
  SELECT RAISE(ABORT, 'Output must be pieces')
  WHERE LOWER((SELECT unit FROM items WHERE id=NEW.item_id)) != 'pieces';
  SELECT RAISE(ABORT, 'Insufficient station stock')
  WHERE COALESCE((SELECT quantity FROM stock WHERE station_id=COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)) AND item_id=OLD.item_id), 0) < OLD.quantity;
  UPDATE stock SET quantity=quantity-OLD.quantity
  WHERE station_id=COALESCE(OLD.current_station_id, (SELECT station_id FROM orders WHERE id=OLD.order_id)) AND item_id=OLD.item_id;
  INSERT INTO stock(station_id,item_id,quantity) VALUES(NEW.current_station_id,NEW.item_id,NEW.quantity)
  ON CONFLICT(station_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity;
  INSERT INTO movements(item_id,from_station_id,to_station_id,quantity,note,created_at,order_id)
  VALUES(OLD.item_id,COALESCE(OLD.current_station_id,(SELECT station_id FROM orders WHERE id=OLD.order_id)),NULL,OLD.quantity,'Order '||(SELECT number FROM orders WHERE id=OLD.order_id)||' — material used',strftime('%Y-%m-%dT%H:%M:%fZ','now'),OLD.order_id);
  INSERT INTO movements(item_id,from_station_id,to_station_id,quantity,note,created_at,order_id)
  VALUES(NEW.item_id,NULL,NEW.current_station_id,NEW.quantity,'Order '||(SELECT number FROM orders WHERE id=NEW.order_id)||' — pieces produced',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NEW.order_id);
  INSERT INTO order_line_events(order_id,item_id,type,from_station_id,to_station_id,created_at)
  VALUES(NEW.order_id,OLD.item_id,'produced',COALESCE(OLD.current_station_id,(SELECT station_id FROM orders WHERE id=OLD.order_id)),NEW.current_station_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
