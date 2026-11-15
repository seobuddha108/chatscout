import { desc, eq, sql } from "drizzle-orm";
import { liveSessions } from "@/db/schema";
import { requireCreatorAccess } from "@/auth/viewer";
import { searchChat } from "@/chat/queries";
import { listPolls } from "@/analytics/queries";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function CreatorPage({ params, searchParams }: {
  params: Promise<{ uniqueId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { uniqueId } = await params;
  const { q } = await searchParams;
  const { db, viewer, creator } = await requireCreatorAccess(uniqueId);
  const own = viewer.id === creator.id;

  const sessions = await db.select({
    roomId: liveSessions.externalRoomId, title: liveSessions.title, startedAt: liveSessions.startedAt,
    endedAt: liveSessions.endedAt, peakViewers: liveSessions.peakViewers,
    messages: sql<number>`(select coalesce(sum(messages), 0)::int from session_minute_stats m where m.session_id = ${liveSessions.id})`,
    diamonds: sql<number>`(select coalesce(sum(diamonds), 0)::int from gift_events g where g.session_id = ${liveSessions.id})`,
  }).from(liveSessions).where(eq(liveSessions.creatorId, creator.id)).orderBy(desc(liveSessions.startedAt)).limit(30);
  const results = q ? await searchChat(db, { creatorId: creator.id, q, limit: 50, offset: 0 }) : null;
  const polls = await listPolls(db, { creator: creator.uniqueId, period: "month", limit: 10, offset: 0 });

  return (
    <main>
      <p><a href="/dashboard">← Dashboard</a></p>
      <h1 style={{ marginBottom: 4 }}>@{creator.uniqueId}</h1>
      <p style={{ marginTop: 0, color: "#555" }}>{creator.nickname}{own ? " · dein Konto" : " · verfolgt, Zuschauer werden pseudonym angezeigt"}</p>

      <h2>Chat durchsuchen</h2>
      <form method="get" style={{ display: "flex", gap: 8 }}>
        <input name="q" defaultValue={q} placeholder="Begriffe, z. B. giveaway -scam" style={{ flex: 1 }} />
        <button>Suchen</button>
      </form>
      {results && (results.items.length === 0 ? <p>Keine Treffer.</p> : (
        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", marginTop: 12, fontSize: 14 }}>
          <tbody>{results.items.map((m) => (
            <tr key={m.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ whiteSpace: "nowrap" }}><a href={`/dashboard/s/${encodeURIComponent(m.roomId)}`}>{fmt(m.at)}</a></td>
              <td style={{ whiteSpace: "nowrap" }}>{m.nickname}</td>
              <td>{m.text}</td>
            </tr>
          ))}</tbody>
        </table>
      ))}

      <h2>Aufgezeichnete Streams</h2>
      {sessions.length === 0 ? <p>Noch keine Streams aufgezeichnet. Die Aufzeichnung startet automatisch beim nächsten LIVE.</p> : (
        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead><tr><th align="left">Start</th><th align="left">Titel</th><th align="right">Zuschauer</th><th align="right">Chat</th><th align="right">💎</th></tr></thead>
          <tbody>{sessions.map((s) => (
            <tr key={s.roomId} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ whiteSpace: "nowrap" }}><a href={`/dashboard/s/${encodeURIComponent(s.roomId)}`}>{fmt(s.startedAt)}</a>{!s.endedAt && <strong style={{ color: "#d93025" }}> ● LIVE</strong>}</td>
              <td>{s.title}</td>
              <td align="right">{s.peakViewers.toLocaleString("de-DE")}</td>
              <td align="right">{Number(s.messages).toLocaleString("de-DE")}</td>
              <td align="right">{Number(s.diamonds).toLocaleString("de-DE")}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <h2>Umfragen (dieser Monat)</h2>
      {polls.items.length === 0 ? <p>Keine Umfragen.</p> : polls.items.map((p) => (
        <p key={p.pollId}><strong>{p.question}</strong> ({p.totalVotes} Stimmen, {fmt(p.startedAt)}):{" "}
          {p.options.map((o) => `${o.text} ${o.percent} %`).join(" · ")}</p>
      ))}
    </main>
  );
}
