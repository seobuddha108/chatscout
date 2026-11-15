import { redirect } from "next/navigation";
import { currentCreator } from "@/auth/current";
import { devLoginEnabled } from "@/auth/dev";

const ERRORS: Record<string, string> = {
  denied: "Du hast die Anmeldung bei TikTok abgebrochen.",
  invalid_state: "Die Anmeldung ist abgelaufen oder ungültig. Bitte versuche es erneut.",
  missing_username: "TikTok hat keinen Benutzernamen übermittelt. Bitte erlaube den Zugriff auf dein Profil.",
  not_configured: "TikTok Login ist auf diesem Server noch nicht eingerichtet.",
  invalid_username: "Ungültiger Benutzername.",
};

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentCreator()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main>
      <h1>Bei ChatScout anmelden</h1>
      <p>Melde dich mit deinem TikTok-Konto an. So stellen wir sicher, dass du nur den Chat deiner eigenen Streams durchsuchst.</p>
      {error && <p role="alert" style={{ color: "#b00020" }}>{ERRORS[error] ?? "Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut."}</p>}
      <p>
        <a href="/api/auth/tiktok/start" style={{ display: "inline-block", padding: "10px 18px", background: "#111", color: "#fff", borderRadius: 8, textDecoration: "none" }}>
          Mit TikTok anmelden
        </a>
      </p>
      <p style={{ fontSize: 14, color: "#555" }}>
        Mit der Anmeldung akzeptierst du die <a href="/agb">AGB</a>. Informationen zum Datenschutz findest du in
        der <a href="/datenschutz">Datenschutzerklärung</a>.<br />
        Wir lesen nur deinen Benutzernamen, Anzeigenamen und dein Profilbild. Den Zugriffstoken von TikTok widerrufen wir sofort danach.
      </p>
      {devLoginEnabled() && (
        <form method="post" action="/api/auth/dev" style={{ marginTop: 32, padding: 16, border: "1px dashed #999" }}>
          <strong>Dev-Login</strong> (nur lokal, ohne TikTok)<br />
          <input name="username" placeholder="tiktok_username" required /> <button>Anmelden</button>
        </form>
      )}
    </main>
  );
}
