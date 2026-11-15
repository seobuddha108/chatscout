import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { currentCreator } from "@/auth/current";
import { optedInCreatorIds } from "@/ingest/ingest";
import { searchChat } from "@/chat/queries";
import { contentReferences, listPolls, pollDetail } from "@/analytics/queries";
import { noTrackingAction, revokeKey, unfollowAction } from "./actions";
import { CreateKey } from "./create-key";
import { FollowForm } from "./follow-form";
import { listFollows } from "@/follow/follows";
import { creators } from "@/db/schema";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const creator = await currentCreator();
  if (!creator) redirect("/login");
  const db = await getDb();
  const { q, user } = await searchParams;

  const keys = await db.select().from(apiKeys).where(eq(apiKeys.creatorId, creator.id)).orderBy(desc(apiKeys.createdAt));
  const collecting = (await optedInCreatorIds(db)).has(creator.id);
  const results = q || user ? await searchChat(db, { creatorId: creator.id, q, user, limit: 50, offset: 0 }) : null;
  const now = new Date();
  const followed = await listFollows(db, creator.id);
  const [me] = await db.select({ noTracking: creators.noTracking }).from(creators).where(eq(creators.id, creator.id));
  const myPolls = await listPolls(db, { creator: creator.uniqueId, period: "month", limit: 5, offset: 0 });
  const pollVoters = await Promise.all(myPolls.items.map((p) => pollDetail(db, p.pollId, creator.id)));
  const refs = await contentReferences(db, { about: creator.uniqueId, period: "month", minMentions: 3, limit: 10, offset: 0 });
  const pct = (s: number) => `${s > 0 ? "+" : ""}${Math.round(s * 100)}`;

  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>ChatScout</h1>
        <form method="post" action="/api/auth/logout"><button>Abmelden</button></form>
      </header>
      <p>
        Angemeldet als <strong>@{creator.uniqueId}</strong> ({creator.nickname}) ✓ verifiziert über TikTok.<br />
        Chat-Erfassung: {collecting ? "🟢 aktiv" : "⚪ inaktiv. Erstelle einen Schlüssel, damit dein Chat gespeichert wird."}
      </p>

      <h2>Verfolgte Creator</h2>
      <p style={{ fontSize: 14, color: "#555" }}>Streams dieser Creator werden automatisch aufgezeichnet: Chat (mit Pseudonymen statt Namen), Geschenke, Zuschauer und Umfragen.</p>
      <FollowForm />
      {followed.length > 0 && (
        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", marginTop: 12, fontSize: 14 }}>
          <tbody>{followed.map((f) => (
            <tr key={f.creatorId} style={{ borderTop: "1px solid #eee" }}>
              <td><a href={`/dashboard/c/${encodeURIComponent(f.uniqueId)}`}>@{f.uniqueId}</a>{f.isLive && <strong style={{ color: "#d93025" }}> ● LIVE</strong>}</td>
              <td style={{ color: "#666" }}>{f.sessions} Streams{f.lastStartedAt && <>, zuletzt {fmt(f.lastStartedAt)}</>}</td>
              <td align="right"><form action={unfollowAction}><input type="hidden" name="creatorId" value={f.creatorId} /><button>Entfernen</button></form></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <h2>Chat deiner eigenen Streams durchsuchen</h2>
      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="q" defaultValue={q} placeholder="Begriffe, z. B. giveaway -scam" style={{ flex: "1 1 220px" }} />
        <input name="user" defaultValue={user} placeholder="@nutzer" style={{ flex: "0 1 160px" }} />
        <button>Suchen</button>
      </form>
      {results && (
        results.items.length === 0 ? <p>Keine Treffer.</p> : (
          <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", marginTop: 12, fontSize: 14 }}>
            <thead><tr><th align="left">Zeit</th><th align="left">Nutzer</th><th align="left">Nachricht</th></tr></thead>
            <tbody>
              {results.items.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(m.at)}</td>
                  <td><a href={`?user=${encodeURIComponent(m.user)}`}>@{m.user}</a></td>
                  <td>{m.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      <h2>Deine Umfragen (dieser Monat)</h2>
      {myPolls.items.length === 0 ? <p>Noch keine Umfragen erfasst.</p> : myPolls.items.map((p, i) => (
        <details key={p.pollId} style={{ marginBottom: 12 }}>
          <summary><strong>{p.question}</strong>: {p.totalVotes} Stimmen, {fmt(p.startedAt)}</summary>
          <ul>{p.options.map((o) => <li key={o.id}>{o.text}: {o.votes} ({o.percent} %)</li>)}</ul>
          {pollVoters[i]?.voters?.length ? (
            <p style={{ fontSize: 14 }}>Abgestimmt haben (nur für dich sichtbar):{" "}
              {pollVoters[i]!.voters!.slice(0, 50).map((v) => `@${v.user} → ${p.options.find((o) => o.id === v.optionId)?.text}`).join(", ")}
              {pollVoters[i]!.voters!.length > 50 && " …"}
            </p>
          ) : <p style={{ fontSize: 14, color: "#666" }}>Namen werden nur erfasst, solange dein Schlüssel aktiv ist.</p>}
        </details>
      ))}

      <h2>Wo über dich gesprochen wurde (dieser Monat)</h2>
      {refs.items.length === 0 ? <p>Keine anderen Streams gefunden, in denen du Thema warst.</p> : (
        <>
          <p>{refs.summary.references} Streams von {refs.summary.distinctStreamers} Creatorn, zusammen bis zu {refs.summary.summedPeakViewers.toLocaleString("de-DE")} Zuschauer gleichzeitig. Stimmung: {pct(refs.summary.sentiment)}</p>
          <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead><tr><th align="left">Wann</th><th align="left">Stream</th><th align="right">Erwähnungen</th><th align="right">Stimmung</th><th align="right">Zuschauer</th></tr></thead>
            <tbody>{refs.items.map((r) => (
              <tr key={r.roomId} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ whiteSpace: "nowrap" }}>{fmt(r.startedAt)}</td>
                <td>@{r.streamer.uniqueId}{r.inTitle && " 🎬"}<br /><span style={{ color: "#666" }}>{r.title}</span></td>
                <td align="right">{r.mentions}</td>
                <td align="right">{pct(r.sentiment)}</td>
                <td align="right">{r.peakViewers.toLocaleString("de-DE")}</td>
              </tr>
            ))}</tbody>
          </table>
          <p style={{ fontSize: 13, color: "#666" }}>🎬 = du stehst im Stream-Titel (z. B. Reaction). Stimmung: −100 (negativ) bis +100 (positiv), grobe Schätzung aus dem Chat.</p>
        </>
      )}

      <h2>Einstellungen</h2>
      <form action={noTrackingAction} style={{ fontSize: 14 }}>
        <label><input type="checkbox" name="noTracking" defaultChecked={me?.noTracking} /> Andere dürfen meine Streams nicht aufzeichnen</label>{" "}
        <button>Speichern</button>
      </form>

      <h2>API-Schlüssel</h2>
      <CreateKey />
      {keys.length > 0 && (
        <table cellPadding={6} style={{ borderCollapse: "collapse", marginTop: 12, fontSize: 14 }}>
          <thead><tr><th align="left">Schlüssel</th><th align="left">Paket</th><th align="left">Gültig bis</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => {
              const active = !k.revokedAt && k.expiresAt > now;
              return (
                <tr key={k.id} style={{ borderTop: "1px solid #eee", color: active ? undefined : "#999" }}>
                  <td><code>{k.prefix}…</code></td>
                  <td>{k.plan}</td>
                  <td>{k.revokedAt ? "widerrufen" : fmt(k.expiresAt)}</td>
                  <td>{active && <form action={revokeKey}><input type="hidden" name="id" value={k.id} /><button>Widerrufen</button></form>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
