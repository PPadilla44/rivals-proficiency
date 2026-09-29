import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ---------- Auth.js tables ---------- */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ---------- App tables ---------- */

/** The Marvel Rivals account a user linked, and their learned earn rate. */
export const playerLinks = pgTable("player_link", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  rivalsUid: text("rivals_uid").notNull(),
  rivalsName: text("rivals_name").notNull(),
  pointsPerHour: real("points_per_hour"),
  lastSyncAt: timestamp("last_sync_at", { mode: "date", withTimezone: true }),
  lastUpdateRequestAt: timestamp("last_update_request_at", { mode: "date", withTimezone: true }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * The level a player set for a hero. `baselinePlaytimeSec` is that hero's
 * lifetime playtime (from the stats API) at the moment the level was set, so
 * playtime logged since then drives the estimate.
 */
export const heroLevels = pgTable(
  "hero_level",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    heroId: text("hero_id").notNull(),
    level: integer("level").notNull(),
    baselinePlaytimeSec: integer("baseline_playtime_sec"),
    setAt: timestamp("set_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.heroId] })],
);

/** Latest lifetime playtime per hero from the stats API. */
export const heroPlaytime = pgTable(
  "hero_playtime",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    heroId: text("hero_id").notNull(),
    playtimeSec: integer("playtime_sec").notNull(),
    fetchedAt: timestamp("fetched_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.heroId] })],
);

/** One row per screenshot read, for the daily per-user limit. */
export const screenshotScans = pgTable(
  "screenshot_scan",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("screenshot_scan_user_time").on(t.userId, t.createdAt)],
);

/**
 * Anonymous product events (a visit, a level change, an import). `visitorId`
 * is a random id kept in the browser; `userId` is set only when signed in.
 */
export const events = pgTable(
  "event",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    visitorId: text("visitor_id").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    props: jsonb("props").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_time").on(t.createdAt), index("event_visitor").on(t.visitorId)],
);
