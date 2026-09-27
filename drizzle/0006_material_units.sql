-- Correct the raw steel item's unit label, which was entered as a quantity.
-- Existing stock quantities and movement history are intentionally preserved.
UPDATE items SET unit='inches' WHERE id=1 AND name='3/4 Roll Thread A36' AND unit='672000';
