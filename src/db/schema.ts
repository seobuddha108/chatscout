import { sql } from "drizzle-orm";
import {
  bigserial, boolean, customType, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const creators = pgTable("creators", {
  id: serial("id").primaryKey(),
  uniqueId: text("unique_id").notNull(),
  nickname: text("nickname").notNull(),
  country: text("country"), // ISO 3166-1 alpha-2; null until known
  category: text("category").notNull().default("general"), // "general" | "gaming"
  avatarUrl: text("avatar_url"),
  // Set when the creator proved account ownership via TikTok Login. Stable across username changes.
  tiktokOpenId: text("tiktok_open_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("creators_unique_id_idx").on(t.uniqueId),
  uniqueIndex("creators_tiktok_open_id_idx").on(t.tiktokOpenId),
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
  externalMsgId: text("external_msg_id"), // TikTok message id, for de-duplication
}, (t) => [
  uniqueIndex("gift_events_msg_idx").on(t.sessionId, t.externalMsgId),
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
  externalMsgId: text("external_msg_id"), // TikTok message id, for de-duplication
  // "simple" config: no stemming, works for any language and for usernames/emotes.
  tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('simple', text)`),
}, (t) => [
  uniqueIndex("chat_msg_idx").on(t.sessionId, t.externalMsgId),
  index("chat_creator_time_idx").on(t.creatorId, t.createdAt),
  index("chat_creator_chatter_idx").on(t.creatorId, t.chatterUniqueId, t.createdAt),
  index("chat_tsv_idx").using("gin", t.tsv),
]);

/** Browser sessions for the creator dashboard. Only the token hash is stored. */
export const webSessions = pgTable("web_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  creatorId: integer("creator_id").notNull().references(() => creators.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("web_sessions_token_idx").on(t.tokenHash)]);

// ---------------------------------------------------------------------------
// Analytics. Everything below is aggregated and contains no viewer identities,
// except poll_voters, which is only written for verified creators' own streams.

export const polls = pgTable("polls", {
  id: serial("id").primaryKey(),
  externalPollId: text("external_poll_id").notNull(),
  sessionId: integer("session_id").notNull().references(() => liveSessions.id),
  creatorId: integer("creator_id").notNull().references(() => creators.id),
  question: text("question").notNull(),
  options: jsonb("options").$type<{ id: string; text: string }[]>().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("polls_external_idx").on(t.externalPollId),
  index("polls_creator_idx").on(t.creatorId, t.startedAt),
]);

/** Vote counts per option and minute (no voter identities). */
export const pollVoteBuckets = pgTable("poll_vote_buckets", {
  pollId: integer("poll_id").notNull().references(() => polls.id),
  optionId: text("option_id").notNull(),
  minute: timestamp("minute", { withTimezone: true }).notNull(),
  votes: integer("votes").notNull(),
}, (t) => [primaryKey({ columns: [t.pollId, t.optionId, t.minute] })]);

/** Named votes: only for polls in the stream of a verified creator with an active key, visible only to them. */
export const pollVoters = pgTable("poll_voters", {
  pollId: integer("poll_id").notNull().references(() => polls.id),
  voterUniqueId: text("voter_unique_id").notNull(),
  voterNickname: text("voter_nickname").notNull(),
  optionId: text("option_id").notNull(),
  votedAt: timestamp("voted_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.pollId, t.voterUniqueId] })]);

/** Chat volume and sentiment per session and minute. */
export const sessionMinuteStats = pgTable("session_minute_stats", {
  sessionId: integer("session_id").notNull().references(() => liveSessions.id),
  minute: timestamp("minute", { withTimezone: true }).notNull(),
  messages: integer("messages").notNull(),
  positive: integer("positive").notNull(),
  negative: integer("negative").notNull(),
}, (t) => [primaryKey({ columns: [t.sessionId, t.minute] })]);

/** How often another creator was @-mentioned in a session's chat or title. Basis for content tracking. */
export const sessionMentions = pgTable("session_mentions", {
  sessionId: integer("session_id").notNull().references(() => liveSessions.id),
  mentionedCreatorId: integer("mentioned_creator_id").notNull().references(() => creators.id),
  mentions: integer("mentions").notNull(),
  positive: integer("positive").notNull(),
  negative: integer("negative").notNull(),
  inTitle: boolean("in_title").notNull().default(false),
  firstAt: timestamp("first_at", { withTimezone: true }).notNull(),
  lastAt: timestamp("last_at", { withTimezone: true }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.mentionedCreatorId] }),
  index("session_mentions_mentioned_idx").on(t.mentionedCreatorId),
]);

/**
 * Which cron invocation currently watches a creator's LIVE (lease), plus check bookkeeping.
 * Overlapping leases are fine: messages are de-duplicated by TikTok message id.
 */
export const liveWatch = pgTable("live_watch", {
  creatorId: integer("creator_id").primaryKey().references(() => creators.id),
  leaseOwner: text("lease_owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastLiveAt: timestamp("last_live_at", { withTimezone: true }),
  lastError: text("last_error"),
});
