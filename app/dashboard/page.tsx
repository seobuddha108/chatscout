import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { currentCreator } from "@/auth/current";
import { optedInCreatorIds } from "@/ingest/ingest";
import { searchChat } from "@/chat/queries";
import { revokeKey } from "./actions";
import { CreateKey } from "./create-key";

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

      <h2>Chat durchsuchen</h2>
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
