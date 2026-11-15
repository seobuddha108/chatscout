import { sql } from "drizzle-orm";
import {
  bigserial, customType, date, index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const creators = pgTable("creators", {
  id: serial("id").primaryKey(),
  uniqueId: text("unique_id").notNull(),
  nickname: text("nickname").notNull(),
  country: text("country"), // ISO 3166-1 alpha-2; null until known
  category: text("category").notNull().default("general"), // "general" | "gaming"
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("creators_unique_id_idx").on(t.uniqueId),
  index("creators_country_idx").on(t.country, t.category),
]);

export const gifters = pgTable("gifters", {
  id: serial("id").primaryKey(),
  uniqueId: text("unique_id").notNull(),
  nickname: text("nickname").notNull(),
  country: text("country"),
}, (t) => [uniqueIndex("gifters_unique_id_idx").on(t.uniqueId)]);

export const liveSessions = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  externalRoomId: text("external_room_id").notNull(),
  creatorId: integer("creator_id").notNull().references(() => creators.id),
  title: text("title"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  peakViewers: integer("peak_viewers").notNull().default(0),
}, (t) => [
  uniqueIndex("live_sessions_room_idx").on(t.externalRoomId),
  index("live_sessions_creator_idx").on(t.creatorId, t.startedAt),
]);

export const giftEvents = pgTable("gift_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sessionId: integer("session_id").notNull().references(() => liveSessions.id),
  creatorId: integer("creator_id").notNull().references(() => creators.id), // denormalized for ranking queries
  gifterId: integer("gifter_id").notNull().references(() => gifters.id),
  giftName: text("gift_name").notNull(),
  diamonds: integer("diamonds").notNull(), // unit price * repeat count
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("gift_events_created_idx").on(t.createdAt),
  index("gift_events_creator_idx").on(t.creatorId, t.createdAt),
  index("gift_events_gifter_idx").on(t.gifterId, t.createdAt),
]);

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(), // first chars of the key, safe to display
  keyHash: text("key_hash").notNull(), // sha256 hex of the full key
  plan: text("plan").notNull(), // see PLANS in src/api/plans.ts
  // The creator account this key belongs to. Chat data is only collected for, and
  // only readable by, creators with an active key.
  creatorId: integer("creator_id").references(() => creators.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash)]);

export const apiUsage = pgTable("api_usage", {
  keyId: integer("key_id").notNull().references(() => apiKeys.id),
  day: date("day").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.keyId, t.day] })]);

/** Chat messages, stored only for creators who opted in (active API key). */
export const chatMessages = pgTable("chat_messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sessionId: integer("session_id").notNull().references(() => liveSessions.id),
  creatorId: integer("creator_id").notNull().references(() => creators.id),
  chatterUniqueId: text("chatter_unique_id").notNull(),
  chatterNickname: text("chatter_nickname").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  // "simple" config: no stemming, works for any language and for usernames/emotes.
  tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('simple', text)`),
}, (t) => [
  index("chat_creator_time_idx").on(t.creatorId, t.createdAt),
  index("chat_creator_chatter_idx").on(t.creatorId, t.chatterUniqueId, t.createdAt),
  index("chat_tsv_idx").using("gin", t.tsv),
]);
