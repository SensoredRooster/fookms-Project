import { integer, sqliteTable, text, primaryKey, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const stations = sqliteTable("stations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  location: text("location").notNull().default(""),
  action: text("action").notNull().default(""),
  onlineIntake: integer("online_intake").notNull().default(0),
  floorX: integer("floor_x").notNull().default(-1),
  floorY: integer("floor_y").notNull().default(-1),
  floorW: integer("floor_w").notNull().default(8),
  floorH: integer("floor_h").notNull().default(6),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  unit: text("unit").notNull().default("each"),
  threshold: integer("threshold").notNull().default(0),
});

export const stock = sqliteTable("stock", {
  stationId: integer("station_id").notNull().references(() => stations.id),
  itemId: integer("item_id").notNull().references(() => items.id),
  quantity: integer("quantity").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.stationId, table.itemId] }), check("quantity_nonnegative", sql`${table.quantity} >= 0`)]);

export const movements = sqliteTable("movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().references(() => items.id),
  fromStationId: integer("from_station_id").references(() => stations.id),
  toStationId: integer("to_station_id").references(() => stations.id),
  quantity: integer("quantity").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
  orderId: integer("order_id"),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),
  stationId: integer("station_id").notNull().references(() => stations.id),
  requestedBy: text("requested_by").notNull().default(""),
  source: text("source").notNull().default("staff"),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("received"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orderLines = sqliteTable("order_lines", {
  orderId: integer("order_id").notNull().references(() => orders.id),
  itemId: integer("item_id").notNull().references(() => items.id),
  quantity: integer("quantity").notNull(),
  currentStationId: integer("current_station_id").references(() => stations.id),
  actionDone: integer("action_done").notNull().default(0),
  completedAt: text("completed_at"),
}, (table) => [primaryKey({ columns: [table.orderId, table.itemId] }), check("order_line_positive", sql`${table.quantity} > 0`)]);

export const orderLineEvents = sqliteTable("order_line_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  itemId: integer("item_id").notNull().references(() => items.id),
  type: text("type").notNull(),
  fromStationId: integer("from_station_id").references(() => stations.id),
  toStationId: integer("to_station_id").references(() => stations.id),
  createdAt: text("created_at").notNull(),
});

export const orderSubmissionLimits = sqliteTable("order_submission_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
});

export const floorSettings = sqliteTable("floor_settings", {
  id: integer("id").primaryKey(),
  width: integer("width").notNull().default(80),
  height: integer("height").notNull().default(50),
});

export const floorFeatures = sqliteTable("floor_features", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("room"),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
});
