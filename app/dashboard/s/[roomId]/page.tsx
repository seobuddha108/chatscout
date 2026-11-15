import { requireSessionAccess } from "@/auth/viewer";
import { pollDetail, sessionTimeline } from "@/analytics/queries";
import { searchChat } from "@/chat/queries";

export const dynamic = "force-dynamic";
const time = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const fmt = (d: Date) => d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function SessionPage({ params, searchParams }: {
  params: Promise<{ roomId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { roomId: raw } = await params;
  const { q } = await searchParams;
  const { db, viewer, creatorId, uniqueId } = await requireSessionAccess(raw);
  const roomId = decodeURIComponent(raw);
  const t = (await sessionTimeline(db, roomId))!;
  const chat = await searchChat(db, { creatorId, session: roomId, q: q || undefined, limit: 200, offset: 0 });
  const polls = await Promise.all(t.polls.map((p) => pollDetail(db, p.pollId, viewer.id)));

  const max = Math.max(1, ...t.minutes.map((m) => m.messages));
  const W = 700, H = 90, bw = t.minutes.length ? W / t.minutes.length : W;

  return (
    <main>
      <p><a href={`/dashboard/c/${encodeURIComponent(uniqueId)}`}>← @{uniqueId}</a></p>
      <h1 style={{ marginBottom: 4 }}>{t.title || "LIVE"}</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        {fmt(t.startedAt)}{t.endedAt ? ` – ${time(t.endedAt)}` : " · läuft gerade"} · bis zu {t.peakViewers.toLocaleString("de-DE")} Zuschauer ·{" "}
        {t.totals.chatMessages.toLocaleString("de-DE")} Nachrichten · {t.totals.diamonds.toLocaleString("de-DE")} 💎 · Stimmung {Math.round(t.totals.sentiment * 100)}
      </p>

      <h2>Chat-Aktivität</h2>
      {t.minutes.length === 0 ? <p>Noch keine Daten.</p> : (
        <svg viewBox={`0 0 ${W} ${H + 16}`} width="100%" role="img" aria-label="Chatnachrichten pro Minute">
          {t.minutes.map((m, i) => {
            const h = (m.messages / max) * H;
            const peak = t.peaks.some((p) => p.getTime() === m.minute.getTime());
            return <rect key={i} x={i * bw} y={H - h} width={Math.max(1, bw - 1)} height={h} fill={peak ? "#e8336f" : "#13b8aa"}><title>{`${time(m.minute)}: ${m.messages} Nachrichten, ${m.diamonds} 💎`}</title></rect>;
          })}
          <text x="0" y={H + 13} fontSize="11" fill="currentColor">{time(t.minutes[0].minute)}</text>
          <text x={W} y={H + 13} fontSize="11" textAnchor="end" fill="currentColor">{time(t.minutes[t.minutes.length - 1].minute)}</text>
        </svg>
      )}
      {t.peaks.length > 0 && <p style={{ fontSize: 14 }}>Höhepunkte: {t.peaks.map(time).join(", ")}</p>}
      {t.mentioned.length > 0 && <p style={{ fontSize: 14 }}>Thema im Stream: {t.mentioned.map((m) => `@${m.uniqueId} (${m.mentions}×${m.inTitle ? ", im Titel" : ""})`).join(", ")}</p>}

      {polls.length > 0 && <h2>Umfragen</h2>}
      {polls.map((p) => p && (
        <div key={p.pollId} style={{ marginBottom: 12 }}>
          <strong>{p.question}</strong> · {p.totalVotes} Stimmen
          <ul style={{ margin: "4px 0" }}>{p.options.map((o) => <li key={o.id}>{o.text}: {o.votes} ({o.percent} %)</li>)}</ul>
          {p.voters && p.voters.length > 0 && <p style={{ fontSize: 13, color: "#555" }}>Abgestimmt (nur in deinen eigenen Streams sichtbar): {p.voters.slice(0, 50).map((v) => `${v.nickname} → ${p.options.find((o) => o.id === v.optionId)?.text}`).join(", ")}</p>}
        </div>
      ))}

      <h2>Chat</h2>
      <form method="get" style={{ display: "flex", gap: 8 }}>
        <input name="q" defaultValue={q} placeholder="In diesem Stream suchen" style={{ flex: 1 }} />
        <button>Suchen</button>
      </form>
      {chat.items.length === 0 ? <p>Keine Nachrichten.</p> : (
        <table cellPadding={4} style={{ borderCollapse: "collapse", width: "100%", marginTop: 8, fontSize: 14 }}>
          <tbody>{[...chat.items].reverse().map((m) => (
            <tr key={m.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ whiteSpace: "nowrap", color: "#666" }}>{time(m.at)}</td>
              <td style={{ whiteSpace: "nowrap" }}>{m.nickname}</td>
              <td>{m.text}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {chat.hasMore && <p style={{ fontSize: 13, color: "#666" }}>Es werden die letzten 200 Treffer angezeigt. Grenze die Suche ein, um ältere zu sehen.</p>}
    </main>
  );
}
