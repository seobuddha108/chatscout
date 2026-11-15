import { LEGAL } from "@/legal/config";
import { LegalPage } from "@/legal/LegalPage";

export const metadata = { title: "Datenschutzerklärung – ChatScout" };

const CHAT_DAYS = Number(process.env.CHAT_RETENTION_DAYS ?? 30);
const GIFT_DAYS = Number(process.env.GIFT_RETENTION_DAYS ?? 90);

export default function Datenschutz() {
  const L = LEGAL;
  const mail = <a href={`mailto:${L.privacyEmail}`}>{L.privacyEmail}</a>;
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>Stand: {L.lastUpdated} · <a href="/privacy" hrefLang="en">English version</a></p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {L.company}{L.legalForm && ` ${L.legalForm}`}, {L.street}, {L.zipCity}, {L.country}<br />
        E-Mail: {mail}
      </p>
      {L.dataProtectionOfficer && <p>Datenschutzbeauftragte:r: {L.dataProtectionOfficer}</p>}

      <h2>2. Überblick</h2>
      <p>{L.productName} hilft Creatorn, den Chat ihrer <strong>eigenen</strong> TikTok-LIVE-Streams zu durchsuchen, zeichnet
        LIVE-Streams von Creatorn auf, denen Nutzer:innen folgen, und stellt Statistiken zu LIVE-Streams bereit. Dabei sind diese Gruppen betroffen:</p>
      <ul>
        <li><strong>Creator</strong>, die sich bei {L.productName} anmelden (Abschnitte 4–7),</li>
        <li><strong>Zuschauer:innen</strong>, die im LIVE-Chat eines angemeldeten Creators schreiben (Abschnitt 8),</li>
        <li><strong>Creator, denen Nutzer:innen folgen, und deren Zuschauer:innen</strong> (Abschnitt 8a),</li>
        <li><strong>Creator und Unterstützer:innen</strong>, die in öffentlichen LIVE-Ranglisten erscheinen (Abschnitt 9).</li>
      </ul>
      <p>Wir setzen keine Werbe-, Analyse- oder Tracking-Tools ein und verkaufen keine Daten.</p>

      <h2>3. Hosting und Server-Logs</h2>
      <p>Die Anwendung wird bei {L.hosting.app} betrieben, die Datenbank bei {L.hosting.database} in der
        Region {L.hosting.databaseRegion}. Mit beiden Anbietern bestehen Verträge zur Auftragsverarbeitung
        (Art. 28 DSGVO). Für das Vereinigte Königreich besteht ein Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO).
        Soweit Daten in die USA oder andere Drittländer übermittelt werden, stützen wir uns auf das EU-U.S. Data Privacy
        Framework bzw. EU-Standardvertragsklauseln (Art. 45, 46 DSGVO).</p>
      <p>Beim Aufruf der Website verarbeitet der Hoster technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene
        Adresse, Browser-Kennung) in Server-Logs, um den Dienst sicher bereitzustellen und Fehler zu analysieren.
        Rechtsgrundlage ist unser berechtigtes Interesse am sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).
        Die Logs werden nur kurzfristig aufbewahrt.</p>

      <h2>4. Anmeldung mit TikTok</h2>
      <p>Die Anmeldung erfolgt ausschließlich über „Login mit TikTok“ (TikTok Login Kit). Dabei leitet dich TikTok nach deiner
        Zustimmung zu uns zurück und übermittelt uns: deine TikTok-Konto-ID (open_id), deinen Benutzernamen, deinen
        Anzeigenamen und dein Profilbild. Damit stellen wir sicher, dass du nur Daten deiner eigenen Streams siehst.</p>
      <p>Den von TikTok ausgestellten Zugriffstoken widerrufen wir unmittelbar nach dem Auslesen dieser Angaben. Wir speichern
        ihn nicht und greifen nicht weiter auf dein TikTok-Konto zu. Rechtsgrundlage ist die Vertragsdurchführung
        (Art. 6 Abs. 1 lit. b DSGVO). Für die Verarbeitung bei TikTok gilt die Datenschutzerklärung von TikTok.</p>

      <h2>5. Kundenkonto und API-Schlüssel</h2>
      <p>Zu deinem Konto speichern wir die Angaben aus Abschnitt 4, den Zeitpunkt der Verifizierung, deine API-Schlüssel
        (nur als kryptografischer Hash), Paket und Laufzeit sowie die Anzahl der API-Anfragen pro Tag (für Kontingente).
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Diese Daten speichern wir, solange dein Konto besteht. Danach löschen wir sie,
        soweit keine gesetzlichen Aufbewahrungspflichten bestehen (z. B. für Rechnungen nach HGB/AO bis zu 10 Jahre).</p>

      <h2>6. Cookies</h2>
      <p>Wir verwenden ausschließlich technisch notwendige Cookies (§ 25 Abs. 2 Nr. 2 TDDDG). Eine Einwilligung ist dafür nicht erforderlich:</p>
      <ul>
        <li><code>cs_oauth_state</code>: Schutz der TikTok-Anmeldung vor Fälschung, Laufzeit 10 Minuten.</li>
        <li><code>cs_session</code>: hält dich angemeldet, Laufzeit 30 Tage oder bis zur Abmeldung.</li>
      </ul>

      <h2>7. Zahlungen</h2>
      <p>Derzeit bieten wir ausschließlich einen kostenlosen Testzugang an und verarbeiten keine Zahlungsdaten. Sobald wir
        kostenpflichtige Pakete einführen, ergänzen wir hier den Zahlungsdienstleister und die dabei verarbeiteten Daten.</p>

      <h2>8. Chatnachrichten in den Streams angemeldeter Creator</h2>
      <p><strong>Welche Daten:</strong> Benutzername und Anzeigename der schreibenden Person, Nachrichtentext, Zeitpunkt
        und der zugehörige Stream. Die Daten stammen aus dem öffentlichen LIVE-Chat (Art. 14 DSGVO).</p>
      <p><strong>Nur für angemeldete Creator:</strong> Chatnachrichten werden nur aus Streams von Creatorn gespeichert, die ihr
        TikTok-Konto bei uns verifiziert haben und einen aktiven Zugang besitzen. Nur der jeweilige Creator kann sie durchsuchen.
        Für Streams anderer Creator gilt Abschnitt 8a. Es gibt keine streamübergreifende Suche nach Personen.</p>
      <p><strong>Zweck und Rolle:</strong> Die Suche dient der Moderation und dem Community-Management des Creators, etwa um
        Gewinnspiel-Teilnahmen, Spam oder Beleidigungen zu finden. Hierbei verarbeiten wir die Daten im Auftrag des Creators
        (Art. 28 DSGVO). Der Creator ist Verantwortlicher und stützt sich auf sein berechtigtes Interesse an der Moderation
        seines Streams (Art. 6 Abs. 1 lit. f DSGVO).</p>
      <p><strong>Speicherdauer:</strong> Chatnachrichten werden automatisch nach {CHAT_DAYS} Tagen gelöscht. Endet der Zugang des
        Creators, werden keine neuen Nachrichten mehr gespeichert.</p>
      <p><strong>Deine Rechte als Zuschauer:in:</strong> Du kannst der Verarbeitung widersprechen und die Löschung deiner Nachrichten
        verlangen, direkt beim Creator oder bei uns unter {mail} (bitte TikTok-Benutzernamen und Stream angeben). Wir leiten
        Anfragen an den Creator weiter bzw. löschen die Nachrichten in seinem Auftrag.</p>

      <h2>8a. Aufzeichnung verfolgter Creator</h2>
      <p><strong>Was:</strong> Nutzer:innen mit aktivem Paket können öffentlichen TikTok-Creatorn folgen. Deren LIVE-Streams zeichnen wir
        dann auf: Titel, Zeitpunkte, Zuschauerzahlen, Geschenke, Umfrage-Ergebnisse, Chat-Aktivität und Chatnachrichten.</p>
      <p><strong>Pseudonymisierung:</strong> Bei Chatnachrichten, Geschenken und Umfragestimmen in diesen Streams speichern wir
        <strong>keine Benutzernamen</strong> der Zuschauer:innen, sondern ein Pseudonym (z. B. „Zuschauer #a3f9“). Es wird pro Stream
        mit einem geheimen Schlüssel neu gebildet. Innerhalb eines Streams lässt sich erkennen, dass dieselbe Person mehrfach schreibt,
        über verschiedene Streams hinweg jedoch nicht. Nachrichtentexte werden gespeichert und sind für die folgenden Nutzer:innen durchsuchbar.</p>
      <p><strong>Rechtsgrundlage und Rolle:</strong> Für diese Aufzeichnungen sind wir Verantwortliche. Wir stützen uns auf unser
        berechtigtes Interesse und das unserer Nutzer:innen an der Auswertung öffentlicher LIVE-Streams, etwa für Content-Analyse und
        Reaktions-Formate (Art. 6 Abs. 1 lit. f DSGVO). Die Pseudonymisierung und kurze Speicherfristen dienen dem Schutz der Zuschauer:innen.</p>
      <p><strong>Speicherdauer:</strong> Chatnachrichten {CHAT_DAYS} Tage, einzelne Geschenk-Ereignisse {GIFT_DAYS} Tage, danach automatische Löschung.</p>
      <p><strong>Widerspruch für Creator:</strong> Creator können die Aufzeichnung ihrer Streams durch andere jederzeit beenden: nach
        Anmeldung im Dashboard unter „Einstellungen“ oder per E-Mail an {mail}. Bestehende Verfolgungen und pseudonyme Chat-Aufzeichnungen
        werden dann gelöscht.</p>
      <p><strong>Widerspruch für Zuschauer:innen:</strong> Nenne uns deinen TikTok-Benutzernamen und den Stream ({mail}). Wir können
        dein Pseudonym für diesen Stream berechnen und die zugehörigen Daten löschen.</p>

      <h2>9. Öffentliche LIVE-Ranglisten</h2>
      <p>Für Ranglisten verarbeiten wir öffentlich sichtbare Angaben zu LIVE-Streams: Benutzername, Anzeigename, Land und Kategorie
        von Creatorn, Zeitpunkte und Zuschauerzahlen von Streams sowie die Summen virtueller Geschenke. Namen schenkender
        Personen speichern wir nur in den eigenen Streams eines angemeldeten Creators, sonst pseudonym (Abschnitt 8a). Rechtsgrundlage ist unser berechtigtes Interesse, Statistiken
        über öffentliche LIVE-Aktivität bereitzustellen (Art. 6 Abs. 1 lit. f DSGVO). Du kannst jederzeit widersprechen
        (Abschnitt 11). Wir entfernen dann deine Daten aus den Ranglisten. Einzelne Geschenk-Ereignisse einschließlich der
        Namen der schenkenden Personen löschen wir automatisch nach {GIFT_DAYS} Tagen.</p>

      <h2>9a. Stream-Analysen (Umfragen und Content-Tracking)</h2>
      <p>Aus öffentlichen LIVE-Streams werten wir aus, wie viele Stimmen eine Umfrage pro Antwort erhalten hat, wie viele
        Chatnachrichten pro Minute geschrieben wurden, wie die Stimmung im Chat war und wie oft andere Creator per @-Erwähnung
        oder im Stream-Titel genannt wurden. Dafür werden Nachrichten und Stimmen beim Eingang automatisch ausgewertet. Gespeichert werden
        nur <strong>Zählwerte ohne Namen der Zuschauer:innen</strong>, der Nachrichtentext wird verworfen. Rechtsgrundlage ist unser
        berechtigtes Interesse an Statistiken über öffentliche LIVE-Aktivität (Art. 6 Abs. 1 lit. f DSGVO).</p>
      <p><strong>Namentliche Umfrage-Stimmen</strong> speichern wir nur für Streams angemeldeter Creator mit aktivem Zugang, im Auftrag
        dieses Creators (Art. 28 DSGVO, siehe Abschnitt 8). Nur dieser Creator kann sie sehen. Wir geben sie nicht an Dritte weiter
        und bieten keine streamübergreifende Auswertung einzelner Personen an. Sie werden wie Chatnachrichten nach {CHAT_DAYS} Tagen gelöscht.</p>

      <h2>10. Empfänger</h2>
      <p>Empfänger sind unsere Hosting-Dienstleister (Abschnitt 3) sowie, für Chatdaten, ausschließlich der jeweilige Creator.
        Eine Weitergabe an Dritte erfolgt nur, wenn wir gesetzlich dazu verpflichtet sind.</p>

      <h2>11. Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung
        (Art. 18), Datenübertragbarkeit (Art. 20) und <strong>Widerspruch gegen Verarbeitungen auf Grundlage berechtigter
        Interessen (Art. 21)</strong>. Wende dich dafür an {mail}.</p>
      <p>Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), z. B. bei der für uns
        zuständigen Behörde: {L.supervisoryAuthority}.</p>

      <h2>12. Automatisierte Entscheidungen</h2>
      <p>Es findet keine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO statt.</p>
    </LegalPage>
  );
}
