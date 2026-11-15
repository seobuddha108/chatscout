import { sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import { allRows } from "@/db/rows";
import { periodWindow, type Period } from "@/rankings/periods";

const iso = (d: Date) => d.toISOString();
const and = (parts: (SQL | undefined)[]) => sql.join(parts.filter(Boolean) as SQL[], sql` and `);
const score = (pos: number, neg: number) => (pos + neg === 0 ? 0 : Math.round(((pos - neg) / (pos + neg)) * 100) / 100);

type PollRow = { id: number; ext: string; question: string; options: { id: string; text: string }[] | string;
  started_at: string; ended_at: string | null; creator: string; nickname: string; room: string; title: string | null; creator_id: number };

async function results(db: DB, pollIds: number[]) {
  const map = new Map<number, Map<string, number>>();
  if (!pollIds.length) return map;
  const rows = allRows<{ poll_id: number; option_id: string; votes: string }>(await db.execute(sql`
    select poll_id, option_id, sum(votes)::bigint as votes from poll_vote_buckets
    where poll_id in (${sql.join(pollIds.map((i) => sql`${i}`), sql`, `)}) group by poll_id, option_id`));
  for (const r of rows) {
    const m = map.get(r.poll_id) ?? new Map();
    m.set(r.option_id, Number(r.votes));
    map.set(r.poll_id, m);
  }
  return map;
}

function shape(p: PollRow, votes: Map<string, number> | undefined) {
  const options = typeof p.options === "string" ? JSON.parse(p.options) as { id: string; text: string }[] : p.options;
  const total = options.reduce((s, o) => s + (votes?.get(o.id) ?? 0), 0);
  const opts = options.map((o) => {
    const v = votes?.get(o.id) ?? 0;
    return { id: o.id, text: o.text, votes: v, percent: total ? Math.round((v / total) * 1000) / 10 : 0 };
  });
  const top = [...opts].sort((a, b) => b.votes - a.votes);
  return {
    pollId: p.ext, question: p.question, creator: p.creator, creatorNickname: p.nickname,
    roomId: p.room, streamTitle: p.title, startedAt: new Date(p.started_at), endedAt: p.ended_at ? new Date(p.ended_at) : null,
    totalVotes: total, options: opts,
    winner: total && top[0].votes > (top[1]?.votes ?? -1) ? top[0].text : null,
  };
}

const pollSelect = sql`select p.id, p.external_poll_id as ext, p.question, p.options, p.started_at, p.ended_at,
  p.creator_id, c.unique_id as creator, c.nickname, s.external_room_id as room, s.title
  from polls p join creators c on c.id = p.creator_id join live_sessions s on s.id = p.session_id`;

/** Poll results (aggregated, no voter names) filtered by creator/country/period/question text. */
export async function listPolls(db: DB, q: { creator?: string; country?: string; search?: string; period: Period; at?: Date; limit: number; offset: number }) {
  const { from, to } = periodWindow(q.period, q.at);
  const where = and([
    sql`p.started_at >= ${iso(from)}::timestamptz and p.started_at < ${iso(to)}::timestamptz`,
    q.creator ? sql`c.unique_id = ${q.creator.replace(/^@/, "").toLowerCase()}` : undefined,
    q.country ? sql`c.country = ${q.country}` : undefined,
    q.search ? sql`p.question ilike ${"%" + q.search.replace(/[\\%_]/g, (m) => "\\" + m) + "%"}` : undefined,
  ]);
  const rows = allRows<PollRow>(await db.execute(sql`${pollSelect} where ${where}
    order by p.started_at desc, p.id desc limit ${q.limit + 1} offset ${q.offset}`));
  const page = rows.slice(0, q.limit);
  const votes = await results(db, page.map((r) => r.id));
  return { period: q.period, from, to, items: page.map((p) => shape(p, votes.get(p.id))), hasMore: rows.length > q.limit };
}

/**
 * One poll with results and per-minute timeline. Voter names are included only when the
 * requesting creator owns the stream (and only exist for verified, opted-in creators).
 */
export async function pollDetail(db: DB, pollId: string, viewerCreatorId: number | null) {
  const [p] = allRows<PollRow>(await db.execute(sql`${pollSelect} where p.external_poll_id = ${pollId}`));
  if (!p) return null;
  const votes = await results(db, [p.id]);
  const buckets = allRows<{ minute: string; option_id: string; votes: number }>(await db.execute(sql`
    select minute, option_id, votes from poll_vote_buckets where poll_id = ${p.id} order by minute`));
  const timeline: { minute: Date; cumulative: Record<string, number> }[] = [];
  const running: Record<string, number> = {};
  for (const b of buckets) {
    running[b.option_id] = (running[b.option_id] ?? 0) + Number(b.votes);
    const t = new Date(b.minute);
    const last = timeline.at(-1);
    if (last && last.minute.getTime() === t.getTime()) last.cumulative = { ...running };
    else timeline.push({ minute: t, cumulative: { ...running } });
  }
  const isOwner = viewerCreatorId !== null && viewerCreatorId === p.creator_id;
  const voters = isOwner
    ? allRows<{ user: string; nickname: string; option_id: string; voted_at: string }>(await db.execute(sql`
        select voter_unique_id as user, voter_nickname as nickname, option_id, voted_at from poll_voters
        where poll_id = ${p.id} order by voted_at limit 5000`)).map((v) => ({ user: v.user, nickname: v.nickname, optionId: v.option_id, votedAt: new Date(v.voted_at) }))
    : null;
  return { ...shape(p, votes.get(p.id)), timeline, voters, votersVisible: isOwner };
}

/**
 * Content tracking: streams in which a creator was the topic (title mention or repeated
 * @-mentions in chat), e.g. a recorded stream being played and discussed elsewhere.
 */
export async function contentReferences(db: DB, q: { about?: string; by?: string; period: Period; at?: Date; minMentions: number; limit: number; offset: number }) {
  const { from, to } = periodWindow(q.period, q.at);
  const norm = (u: string) => u.replace(/^@/, "").toLowerCase();
  const where = and([
    sql`s.started_at >= ${iso(from)}::timestamptz and s.started_at < ${iso(to)}::timestamptz`,
    sql`(sm.in_title or sm.mentions >= ${q.minMentions})`,
    q.about ? sql`mc.unique_id = ${norm(q.about)}` : undefined,
    q.by ? sql`rc.unique_id = ${norm(q.by)}` : undefined,
  ]);
  const base = sql`from session_mentions sm
    join live_sessions s on s.id = sm.session_id
    join creators rc on rc.id = s.creator_id
    join creators mc on mc.id = sm.mentioned_creator_id
    where ${where}`;

  const rows = allRows<{
    room: string; title: string | null; started_at: string; ended_at: string | null; peak_viewers: number;
    by_user: string; by_nickname: string; about_user: string; about_nickname: string;
    mentions: number; positive: number; negative: number; in_title: boolean; first_at: string; last_at: string;
    diamonds: string; messages: string;
  }>(await db.execute(sql`select s.external_room_id as room, s.title, s.started_at, s.ended_at, s.peak_viewers,
      rc.unique_id as by_user, rc.nickname as by_nickname, mc.unique_id as about_user, mc.nickname as about_nickname,
      sm.mentions, sm.positive, sm.negative, sm.in_title, sm.first_at, sm.last_at,
      coalesce((select sum(g.diamonds) from gift_events g where g.session_id = s.id), 0)::bigint as diamonds,
      coalesce((select sum(m.messages) from session_minute_stats m where m.session_id = s.id), 0)::bigint as messages
    ${base} order by s.started_at desc limit ${q.limit + 1} offset ${q.offset}`));

  const [sum] = allRows<{ refs: string; streamers: string; viewers: string; positive: string; negative: string; mentions: string }>(
    await db.execute(sql`select count(*)::bigint as refs, count(distinct rc.id)::bigint as streamers,
      coalesce(sum(s.peak_viewers), 0)::bigint as viewers, coalesce(sum(sm.positive), 0)::bigint as positive,
      coalesce(sum(sm.negative), 0)::bigint as negative, coalesce(sum(sm.mentions), 0)::bigint as mentions ${base}`));

  return {
    period: q.period, from, to,
    summary: {
      references: Number(sum.refs), distinctStreamers: Number(sum.streamers), summedPeakViewers: Number(sum.viewers),
      mentions: Number(sum.mentions), sentiment: score(Number(sum.positive), Number(sum.negative)),
    },
    items: rows.slice(0, q.limit).map((r) => ({
      roomId: r.room, title: r.title, startedAt: new Date(r.started_at), endedAt: r.ended_at ? new Date(r.ended_at) : null,
      streamer: { uniqueId: r.by_user, nickname: r.by_nickname },
      about: { uniqueId: r.about_user, nickname: r.about_nickname },
      inTitle: r.in_title, mentions: Number(r.mentions), positive: Number(r.positive), negative: Number(r.negative),
      sentiment: score(Number(r.positive), Number(r.negative)),
      firstMentionAt: new Date(r.first_at), lastMentionAt: new Date(r.last_at),
      peakViewers: Number(r.peak_viewers), diamonds: Number(r.diamonds), chatMessages: Number(r.messages),
    })),
    hasMore: rows.length > q.limit,
  };
}

/** Per-minute chat volume, sentiment and diamonds of one stream, plus who was talked about and its polls. */
export async function sessionTimeline(db: DB, roomId: string) {
  const [s] = allRows<{ id: number; title: string | null; started_at: string; ended_at: string | null; peak_viewers: number; creator: string; nickname: string }>(
    await db.execute(sql`select s.id, s.title, s.started_at, s.ended_at, s.peak_viewers, c.unique_id as creator, c.nickname
      from live_sessions s join creators c on c.id = s.creator_id where s.external_room_id = ${roomId}`));
  if (!s) return null;
  const chat = allRows<{ minute: string; messages: number; positive: number; negative: number }>(await db.execute(sql`
    select minute, messages, positive, negative from session_minute_stats where session_id = ${s.id}`));
  const gifts = allRows<{ minute: string; diamonds: string }>(await db.execute(sql`
    select date_trunc('minute', created_at) as minute, sum(diamonds)::bigint as diamonds
    from gift_events where session_id = ${s.id} group by 1`));
  const byMinute = new Map<number, { minute: Date; messages: number; positive: number; negative: number; diamonds: number }>();
  const slot = (m: string) => {
    const t = new Date(m).getTime();
    let v = byMinute.get(t);
    if (!v) byMinute.set(t, (v = { minute: new Date(t), messages: 0, positive: 0, negative: 0, diamonds: 0 }));
    return v;
  };
  for (const c of chat) Object.assign(slot(c.minute), { messages: Number(c.messages), positive: Number(c.positive), negative: Number(c.negative) });
  for (const g of gifts) slot(g.minute).diamonds = Number(g.diamonds);
  const minutes = [...byMinute.values()].sort((a, b) => a.minute.getTime() - b.minute.getTime());

  const mentioned = allRows<{ user: string; nickname: string; mentions: number; positive: number; negative: number; in_title: boolean }>(
    await db.execute(sql`select c.unique_id as user, c.nickname, sm.mentions, sm.positive, sm.negative, sm.in_title
      from session_mentions sm join creators c on c.id = sm.mentioned_creator_id
      where sm.session_id = ${s.id} order by sm.in_title desc, sm.mentions desc limit 10`));
  const pollRows = allRows<{ ext: string; question: string; started_at: string }>(await db.execute(sql`
    select external_poll_id as ext, question, started_at from polls where session_id = ${s.id} order by started_at`));

  // Peaks: the 3 busiest chat minutes.
  const peaks = [...minutes].sort((a, b) => b.messages - a.messages).slice(0, 3).filter((m) => m.messages > 0).map((m) => m.minute);
  return {
    roomId, title: s.title, creator: s.creator, creatorNickname: s.nickname,
    startedAt: new Date(s.started_at), endedAt: s.ended_at ? new Date(s.ended_at) : null, peakViewers: s.peak_viewers,
    totals: {
      chatMessages: minutes.reduce((a, m) => a + m.messages, 0), diamonds: minutes.reduce((a, m) => a + m.diamonds, 0),
      sentiment: score(minutes.reduce((a, m) => a + m.positive, 0), minutes.reduce((a, m) => a + m.negative, 0)),
    },
    peaks,
    mentioned: mentioned.map((m) => ({ uniqueId: m.user, nickname: m.nickname, mentions: Number(m.mentions), inTitle: m.in_title, sentiment: score(Number(m.positive), Number(m.negative)) })),
    polls: pollRows.map((p) => ({ pollId: p.ext, question: p.question, startedAt: new Date(p.started_at) })),
    minutes,
  };
}
