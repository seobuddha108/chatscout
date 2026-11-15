import type { Category, CreatorInfo, GifterInfo, LiveEvent, LiveSource, PollContext } from "./types";

/** Small deterministic PRNG so test data is reproducible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GIFTS: { name: string; diamonds: number; weight: number }[] = [
  { name: "Rose", diamonds: 1, weight: 400 },
  { name: "Heart", diamonds: 5, weight: 200 },
  { name: "Donut", diamonds: 30, weight: 80 },
  { name: "Hand Hearts", diamonds: 100, weight: 30 },
  { name: "Corgi", diamonds: 299, weight: 10 },
  { name: "Money Gun", diamonds: 500, weight: 6 },
  { name: "Galaxy", diamonds: 1000, weight: 3 },
  { name: "Lion", diamonds: 29999, weight: 0.08 },
  { name: "Universe", diamonds: 44999, weight: 0.03 },
];
const GIFT_TOTAL_WEIGHT = GIFTS.reduce((s, g) => s + g.weight, 0);

export const COUNTRIES = ["DE", "AT", "CH", "US", "GB", "FR", "TR", "BR", "ID", "MX", "ES", "IT"];

const CHAT_LINES = [
  "hallo zusammen 👋", "wie gehts dir?", "wo kommst du her?", "was spielst du heute?", "giveaway wann?",
  "geiler stream 🔥", "kannst du mich grüßen?", "first time here", "lol", "❤️❤️❤️", "welches setup hast du?",
  "link zum merch?", "spam bot hier", "bist du morgen auch live?", "team rot!", "danke für den stream",
  "@{creator} du bist die beste", "welche kamera ist das", "giveaway pls", "scam link: free-coins.example",
];

// Lines for "reaction" streams, where another creator's (recorded) stream is played and discussed.
const REACTION_LINES = [
  "@{t} ist so cringe 😂", "@{t} hat voll recht", "@{t} lügner 🤡", "respekt an @{t} 👏", "@{t} fake",
  "was hat @{t} da gemacht lol", "@{t} goat 🔥", "@{t} peinlich", "team @{t} ❤️", "@{t} ist unfair",
];
const POLLS: { q: string; o: string[] }[] = [
  { q: "Nächstes Game?", o: ["Fortnite", "Minecraft", "Valorant"] },
  { q: "Fake oder echt?", o: ["Fake", "Echt"] },
  { q: "Bester Snack?", o: ["Chips", "Schoki", "Obst", "Nichts"] },
];

const ADJ = ["lucky", "wild", "cozy", "neon", "lazy", "crazy", "sunny", "pixel", "royal", "dark", "happy", "mighty"];
const NOUN = ["fox", "tiger", "panda", "gamer", "queen", "chef", "wolf", "star", "dragon", "bear", "cat", "king"];

interface MockCreator extends CreatorInfo { popularity: number }

export interface MockOptions {
  seed?: number;
  creatorsPerCountry?: number;
  giftersPerCountry?: number;
}

export class MockSource implements LiveSource {
  readonly name = "mock";
  readonly creators: MockCreator[] = [];
  readonly gifters: GifterInfo[] = [];
  private rand: () => number;
  private roomCounter = 0;

  constructor(opts: MockOptions = {}) {
    const seed = opts.seed ?? 42;
    // Pool generation always uses the fixed seed, so creator IDs are stable across runs.
    const poolRand = mulberry32(seed);
    const perCountry = opts.creatorsPerCountry ?? 25;
    const giftersPer = opts.giftersPerCountry ?? 150;
    for (const country of COUNTRIES) {
      for (let i = 0; i < perCountry; i++) {
        const name = `${pick(poolRand, ADJ)}_${pick(poolRand, NOUN)}`;
        const category: Category = poolRand() < 0.3 ? "gaming" : "general";
        this.creators.push({
          uniqueId: `${name}.${country.toLowerCase()}${i}`,
          nickname: `${cap(name.replace("_", " "))} ${country}`,
          country,
          category,
          // Pareto-ish: a few creators earn most of the diamonds.
          popularity: Math.min(50, 1 / Math.pow(poolRand() + 0.02, 1.2)),
        });
      }
      for (let i = 0; i < giftersPer; i++) {
        this.gifters.push({
          uniqueId: `fan_${country.toLowerCase()}_${i}`,
          nickname: `${cap(pick(poolRand, ADJ))}${cap(pick(poolRand, NOUN))}${i}`,
          country,
        });
      }
    }
    // Event generation uses a time-varying seed so successive cron runs differ.
    this.rand = mulberry32(seed ^ Date.now());
  }

  /** Lets tests make event generation deterministic. */
  reseed(seed: number) { this.rand = mulberry32(seed); }

  async poll(ctx: PollContext): Promise<LiveEvent[]> {
    const { now } = ctx;
    const r = this.rand;
    const events: LiveEvent[] = [];
    const live = new Set(ctx.openSessions.map((s) => s.creatorUniqueId));
    const byId = new Map(this.creators.map((c) => [c.uniqueId, c]));

    // Gifts + viewer updates for running sessions; end ~10% of them.
    for (const s of ctx.openSessions) {
      const c = byId.get(s.creatorUniqueId);
      const popularity = c?.popularity ?? 1;
      const from = new Date(now.getTime() - 5 * 60_000);
      const reactTo = s.title?.match(/@([\w.]+)/)?.[1];
      events.push(...this.sessionActivity(s.roomId, c, popularity, from, now, 1, reactTo));
      if (r() < 0.05) events.push(...this.makePoll(s.roomId, c, popularity, from, now, reactTo));
      if (r() < 0.1) events.push({ type: "live_end", roomId: s.roomId, at: now });
    }

    // Start new sessions until ~15% of creators are live.
    const target = Math.round(this.creators.length * 0.15);
    let toStart = Math.max(0, target - live.size);
    const offline = this.creators.filter((c) => !live.has(c.uniqueId));
    while (toStart-- > 0 && offline.length) {
      const c = offline.splice(Math.floor(r() * offline.length), 1)[0];
      events.push(this.start(c, now));
    }
    return events;
  }

  /** Generates `days` of finished history ending at `now` (for seeding). */
  history(days: number, now: Date): LiveEvent[] {
    const r = this.rand;
    const events: LiveEvent[] = [];
    const startMs = now.getTime() - days * 86_400_000;
    for (let d = 0; d < days; d++) {
      for (const c of this.creators) {
        const sessions = r() < 0.55 ? 1 + (r() < 0.3 ? 1 : 0) : 0;
        for (let i = 0; i < sessions; i++) {
          const from = new Date(startMs + d * 86_400_000 + r() * 80_000_000);
          const to = new Date(Math.min(from.getTime() + (0.5 + r() * 3.5) * 3_600_000, now.getTime() - 60_000));
          if (to <= from) continue;
          const start = this.start(c, from);
          const reactTo = start.title?.match(/@([\w.]+)/)?.[1];
          events.push(start, ...this.sessionActivity(start.roomId, c, c.popularity, from, to, (to.getTime() - from.getTime()) / 300_000, reactTo));
          if (r() < (reactTo ? 0.8 : 0.3)) events.push(...this.makePoll(start.roomId, c, c.popularity, from, to, reactTo));
          events.push({ type: "live_end", roomId: start.roomId, at: to });
        }
      }
    }
    return events;
  }

  private start(c: MockCreator, at: Date): Extract<LiveEvent, { type: "live_start" }> {
    const { popularity: _p, ...creator } = c;
    const r = this.rand;
    // ~15% of non-gaming streams are reactions to another (preferably popular) creator.
    let title = c.category === "gaming" ? "Ranked grind 🎮" : "Chatting with you ✨";
    if (c.category === "general" && r() < 0.15) {
      const candidates = this.creators.filter((x) => x.uniqueId !== c.uniqueId && x.popularity > 3);
      if (candidates.length) title = `Reaktion auf @${pick(r, candidates).uniqueId} 👀`;
    }
    return {
      type: "live_start",
      roomId: `mock-${at.getTime().toString(36)}-${(this.roomCounter++).toString(36)}-${c.uniqueId}`,
      creator, title, at,
    };
  }

  /** Gifts and viewer counts for one room over [from, to]; `intervals` = number of 5-min slices. */
  private sessionActivity(roomId: string, c: MockCreator | undefined, popularity: number, from: Date, to: Date, intervals = 1, reactTo?: string): LiveEvent[] {
    const r = this.rand;
    const out: LiveEvent[] = [];
    const span = to.getTime() - from.getTime();
    const giftCount = Math.round(intervals * popularity * (0.5 + r() * 1.5));
    const local = this.gifters.filter((g) => g.country === c?.country);
    const pool = local.length ? local : this.gifters;
    for (let i = 0; i < giftCount; i++) {
      const gift = weightedGift(r);
      const repeat = gift.diamonds < 10 && r() < 0.4 ? 1 + Math.floor(r() * 20) : 1;
      // Skewed gifter pick: low indexes (the "whales") send most gifts.
      const gifter = pool[Math.floor(Math.pow(r(), 2.5) * pool.length)];
      out.push({
        type: "gift", roomId, gifter, giftName: gift.name, diamonds: gift.diamonds * repeat,
        at: new Date(from.getTime() + r() * span),
      });
    }
    // Chat: roughly 3x as many messages as gifts, from regular fans and anonymous viewers.
    const chatCount = Math.round(intervals * (3 + popularity * 4) * (0.5 + r()));
    for (let i = 0; i < chatCount; i++) {
      const n = Math.floor(r() * 5000);
      const fan = r() < 0.5 ? pool[Math.floor(Math.pow(r(), 2) * pool.length)] : { uniqueId: `viewer${n}`, nickname: `Viewer ${n}` };
      const text = reactTo && r() < 0.35
        ? pick(r, REACTION_LINES).replace("{t}", reactTo)
        : pick(r, CHAT_LINES).replace("{creator}", c?.uniqueId ?? "creator");
      out.push({ type: "chat", roomId, user: { uniqueId: fan.uniqueId, nickname: fan.nickname }, text, at: new Date(from.getTime() + r() * span) });
    }
    out.push({ type: "viewers", roomId, viewers: Math.round(popularity * (20 + r() * 200)), at: to });
    return out;
  }

  /** One poll inside [from, to] with skewed results; each voter votes once. */
  private makePoll(roomId: string, c: MockCreator | undefined, popularity: number, from: Date, to: Date, reactTo?: string): LiveEvent[] {
    const r = this.rand;
    const def = reactTo ? { q: `War @${reactTo} im Recht?`, o: ["Ja", "Nein"] } : pick(r, POLLS);
    const options = def.o.map((text, i) => ({ id: String(i + 1), text }));
    const weights = options.map(() => 0.2 + r());
    const total = weights.reduce((a, b) => a + b, 0);
    const span = to.getTime() - from.getTime();
    const start = new Date(from.getTime() + r() * span * 0.7);
    const end = new Date(Math.min(start.getTime() + (2 + r() * 3) * 60_000, to.getTime()));
    const pollId = `${roomId}-poll${(this.roomCounter++).toString(36)}`;
    const out: LiveEvent[] = [{ type: "poll_start", roomId, pollId, question: def.q, options, at: start }];
    const local = this.gifters.filter((g) => g.country === c?.country);
    const voters = new Set<string>();
    const n = Math.round(popularity * (10 + r() * 40));
    for (let i = 0; i < n; i++) {
      const k = Math.floor(r() * 5000);
      const u = r() < 0.4 && local.length ? local[Math.floor(r() * local.length)] : { uniqueId: `viewer${k}`, nickname: `Viewer ${k}` };
      if (voters.has(u.uniqueId)) continue;
      voters.add(u.uniqueId);
      let x = r() * total, idx = 0;
      while ((x -= weights[idx]) > 0 && idx < options.length - 1) idx++;
      out.push({ type: "poll_vote", roomId, pollId, optionId: options[idx].id, user: { uniqueId: u.uniqueId, nickname: u.nickname },
        at: new Date(start.getTime() + r() * (end.getTime() - start.getTime())) });
    }
    out.push({ type: "poll_end", roomId, pollId, at: end });
    return out;
  }
}

function weightedGift(r: () => number) {
  let x = r() * GIFT_TOTAL_WEIGHT;
  for (const g of GIFTS) if ((x -= g.weight) <= 0) return g;
  return GIFTS[0];
}
function pick<T>(r: () => number, arr: T[]): T { return arr[Math.floor(r() * arr.length)]; }
function cap(s: string) { return s.replace(/\b\w/g, (m) => m.toUpperCase()); }
