import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type DB } from "@/db";
import { ingestEvents, runIngest, closeStaleSessions } from "@/ingest/ingest";
import { MockSource } from "@/ingest/mock-source";
import type { LiveEvent } from "@/ingest/types";
import { countryOverview, creatorProfile, creatorRanking, gifterRanking } from "@/rankings/queries";
import { leagueFor } from "@/rankings/leagues";
import { periodWindow } from "@/rankings/periods";
import { authenticate, createApiKey } from "@/api/keys";

const NOW = new Date("2026-11-11T15:00:00Z"); // a Wednesday
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 11, h, m));

let db: DB;
beforeEach(async () => { db = await createPgliteDb("memory://"); });

const creator = (id: string, country = "DE", category: "general" | "gaming" = "general") =>
  ({ uniqueId: id, nickname: id.toUpperCase(), country, category });
const fan = (id: string, country = "DE") => ({ uniqueId: id, nickname: id, country });

function fixture(): LiveEvent[] {
  return [
    { type: "live_start", roomId: "r1", creator: creator("anna"), at: at(10) },
    { type: "live_start", roomId: "r2", creator: creator("ben", "DE", "gaming"), at: at(10) },
    { type: "live_start", roomId: "r3", creator: creator("cleo", "US"), at: at(10) },
    { type: "gift", roomId: "r1", gifter: fan("f1"), giftName: "Galaxy", diamonds: 1000, at: at(10, 5) },
    { type: "gift", roomId: "r1", gifter: fan("f2"), giftName: "Rose", diamonds: 1, at: at(10, 6) },
    { type: "gift", roomId: "r2", gifter: fan("f1"), giftName: "Money Gun", diamonds: 500, at: at(10, 7) },
    { type: "gift", roomId: "r3", gifter: fan("f3", "US"), giftName: "Lion", diamonds: 29999, at: at(10, 8) },
    { type: "gift", roomId: "unknown", gifter: fan("f1"), giftName: "Rose", diamonds: 1, at: at(10, 9) },
    { type: "viewers", roomId: "r1", viewers: 120, at: at(10, 10) },
    { type: "viewers", roomId: "r1", viewers: 80, at: at(10, 11) },
    { type: "live_end", roomId: "r1", at: at(11) },
  ];
}

describe("ingest", () => {
  it("stores events, skips unknown rooms and is idempotent for starts/ends", async () => {
    const first = await ingestEvents(db, fixture());
    expect(first).toMatchObject({ sessionsStarted: 3, sessionsEnded: 1, gifts: 4, chats: 0, chatsDropped: 0, skipped: 1 });
    const again = await ingestEvents(db, fixture().filter((e) => e.type !== "gift"));
    expect(again.sessionsStarted).toBe(0);
    expect(again.sessionsEnded).toBe(0);

    const profile = await creatorProfile(db, "anna", NOW);
    expect(profile?.recentSessions[0]).toMatchObject({ peakViewers: 120, diamonds: 1001 });
    expect(profile?.isLive).toBe(false);
    expect((await creatorProfile(db, "ben", NOW))?.isLive).toBe(true);
  });

  it("runs a mock tick against open sessions", async () => {
    const src = new MockSource({ creatorsPerCountry: 5, giftersPerCountry: 10 });
    src.reseed(1);
    const r1 = await runIngest(db, src, NOW);
    expect(r1.sessionsStarted).toBeGreaterThan(0);
    const r2 = await runIngest(db, src, new Date(NOW.getTime() + 300_000));
    expect(r2.gifts).toBeGreaterThan(0);
    expect(r2.skipped).toBe(0);
  });

  it("closes stale sessions", async () => {
    await ingestEvents(db, fixture());
    expect(await closeStaleSessions(db, 2, at(14))).toBe(2); // r2, r3 started at 10:00
  });
});

describe("rankings", () => {
  beforeEach(async () => { await ingestEvents(db, fixture()); });

  it("ranks creators by diamonds with country/category filters", async () => {
    const all = await creatorRanking(db, { period: "day", at: NOW, limit: 10, offset: 0 });
    expect(all.items.map((i) => [i.rank, i.uniqueId, i.diamonds])).toEqual([[1, "cleo", 29999], [2, "anna", 1001], [3, "ben", 500]]);
    const de = await creatorRanking(db, { period: "day", at: NOW, country: "DE", limit: 1, offset: 0 });
    expect(de.items.map((i) => i.uniqueId)).toEqual(["anna"]);
    expect(de.hasMore).toBe(true);
    const gaming = await creatorRanking(db, { period: "week", at: NOW, category: "gaming", limit: 10, offset: 0 });
    expect(gaming.items.map((i) => i.uniqueId)).toEqual(["ben"]);
    const other = await creatorRanking(db, { period: "day", at: new Date("2026-11-12T12:00:00Z"), limit: 10, offset: 0 });
    expect(other.items).toEqual([]);
  });

  it("filters by league", async () => {
    // day thresholds: C >= 1429, B >= 7143, A >= 28571
    const c = await creatorRanking(db, { period: "day", at: NOW, league: "A", limit: 10, offset: 0 });
    expect(c.items.map((i) => i.uniqueId)).toEqual(["cleo"]);
    const d = await creatorRanking(db, { period: "day", at: NOW, league: "D", limit: 10, offset: 0 });
    expect(d.items.map((i) => i.uniqueId)).toEqual(["anna", "ben"]);
  });

  it("ranks gifters, optionally per creator", async () => {
    const g = await gifterRanking(db, { period: "day", at: NOW, country: "DE", limit: 10, offset: 0 });
    expect(g.items.map((i) => [i.uniqueId, i.diamonds, i.creatorsSupported])).toEqual([["f1", 1500, 2], ["f2", 1, 1]]);
    const forBen = await gifterRanking(db, { period: "day", at: NOW, creator: "ben", limit: 10, offset: 0 });
    expect(forBen.items.map((i) => i.uniqueId)).toEqual(["f1"]);
  });

  it("builds creator profile and country overview", async () => {
    const p = await creatorProfile(db, "ben", NOW);
    expect(p?.totals.day).toEqual({ diamonds: 500, rankInCountry: 2, league: "D" });
    expect(await creatorProfile(db, "nobody", NOW)).toBeNull();
    const c = await countryOverview(db, "day", NOW);
    expect(c.items).toEqual([
      { country: "US", creators: 1, diamonds: 29999, liveNow: 1 },
      { country: "DE", creators: 2, diamonds: 1501, liveNow: 1 },
    ]);
  });
});

describe("periods and leagues", () => {
  it("computes UTC calendar windows", () => {
    expect(periodWindow("week", NOW).from.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(periodWindow("month", NOW).to.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("assigns leagues with distance to next", () => {
    expect(leagueFor(60_000, "week")).toEqual({ league: "B", nextLeague: "A", diamondsToNext: 140_000 });
    expect(leagueFor(2_000_000, "week")).toEqual({ league: "S", nextLeague: null, diamondsToNext: null });
  });
});

describe("api keys", () => {
  it("authenticates, enforces quota and expiry", async () => {
    const { key } = await createApiKey(db, { name: "t", plan: "basic", now: NOW });
    expect(await authenticate(db, null)).toMatchObject({ ok: false, status: 401 });
    expect(await authenticate(db, "lr_wrong")).toMatchObject({ ok: false, status: 401 });
    expect(await authenticate(db, key, NOW)).toMatchObject({ ok: true, plan: "basic", remaining: 999 });
    expect(await authenticate(db, key, new Date(NOW.getTime() + 8 * 86_400_000))).toMatchObject({ ok: false, status: 403 });
    await db.execute(`update api_usage set count = 1000` as never);
    expect(await authenticate(db, key, NOW)).toMatchObject({ ok: false, status: 429 });
  });
});
