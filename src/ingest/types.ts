/**
 * Normalized live events. Every data source (mock, a TikTok LIVE connector,
 * a third-party API) is translated into these before it touches the database.
 */
export type Category = "general" | "gaming";

export interface CreatorInfo {
  uniqueId: string;
  nickname: string;
  country: string;
  category: Category;
  avatarUrl?: string;
}

export interface GifterInfo {
  uniqueId: string;
  nickname: string;
  country?: string;
}

export type LiveEvent =
  | { type: "live_start"; roomId: string; creator: CreatorInfo; title?: string; at: Date }
  | { type: "viewers"; roomId: string; viewers: number; at: Date }
  | { type: "gift"; roomId: string; gifter: GifterInfo; giftName: string; diamonds: number; at: Date }
  | { type: "live_end"; roomId: string; at: Date };

export interface OpenSession {
  roomId: string;
  creatorUniqueId: string;
  startedAt: Date;
}

export interface PollContext {
  now: Date;
  /** Sessions the database currently considers live. */
  openSessions: OpenSession[];
}

/**
 * A pull-based source, called once per ingest run (e.g. by a cron job).
 * Push-based sources (websocket connectors) can buffer events and drain them here.
 */
export interface LiveSource {
  readonly name: string;
  poll(ctx: PollContext): Promise<LiveEvent[]>;
}
