import { LEGAL } from "@/legal/config";
import { LegalPage } from "@/legal/LegalPage";

export const metadata = { title: "AGB – ChatScout" };

const CHAT_DAYS = Number(process.env.CHAT_RETENTION_DAYS ?? 30);

export default function Agb() {
  const L = LEGAL;
  const P = L.productName;
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <p>Stand: {L.lastUpdated} · <a href="/terms" hrefLang="en">English version</a></p>

      <h2>§ 1 Geltungsbereich und Anbieter</h2>
      <p>Diese AGB gelten für die Nutzung von {P} (Website, Dashboard und API), angeboten von {L.company}
        {L.legalForm && ` ${L.legalForm}`}, {L.street}, {L.zipCity} („Anbieter“). Abweichende Bedingungen der Nutzer:innen gelten nicht.</p>
      <p>{P} ist ein unabhängiges Angebot und steht in keiner Verbindung zu TikTok oder ByteDance.</p>

      <h2>§ 2 Leistungen</h2>
      <ol>
        <li>{P} speichert die Chatnachrichten der eigenen TikTok-LIVE-Streams eines verifizierten Creators und macht sie für diesen
          durchsuchbar (nach Begriffen, Personen und Zeiträumen). Außerdem bietet {P} Ranglisten zu LIVE-Streams über eine API.</li>
        <li>Die Daten stammen aus öffentlich zugänglichen LIVE-Streams. Der Anbieter hat keinen Einfluss auf TikTok. Er schuldet
          keine Vollständigkeit der erfassten Daten und keine ununterbrochene Verfügbarkeit. Änderungen bei TikTok können
          Funktionen einschränken.</li>
        <li>Chatnachrichten werden nach {CHAT_DAYS} Tagen automatisch gelöscht.</li>
      </ol>

      <h2>§ 3 Konto und Verifizierung</h2>
      <ol>
        <li>Die Anmeldung erfolgt über „Login mit TikTok“. Jede Person darf sich nur mit einem TikTok-Konto anmelden, über das sie
          selbst verfügt oder für das sie bevollmächtigt ist (z. B. als Agentur mit Vollmacht des Creators).</li>
        <li>Chatdaten werden nur für das verifizierte Konto erfasst und nur diesem angezeigt.</li>
        <li>API-Schlüssel sind geheim zu halten. Bei Verdacht auf Missbrauch ist der Schlüssel im Dashboard zu widerrufen.</li>
      </ol>

      <h2>§ 4 Pakete, Laufzeit und Preise</h2>
      <ol>
        <li>Zugänge werden als Pakete mit fester Laufzeit (in der Regel 7 Tage) und täglichem Anfragekontingent angeboten. Ein Paket endet
          automatisch mit Ablauf der Laufzeit. Es verlängert sich nicht und muss nicht gekündigt werden.</li>
        <li>Ein kostenloser Testzugang kann ohne Anspruch auf Fortbestand angeboten werden.</li>
        <li>Derzeit ist ausschließlich ein kostenloser Testzugang verfügbar. Für künftige kostenpflichtige Pakete gelten die bei
          der Buchung angezeigten Preise und Zahlungsbedingungen.</li>
      </ol>

      <h2>§ 5 Widerrufsrecht für Verbraucher:innen</h2>
      <p>Derzeit werden keine kostenpflichtigen Leistungen angeboten. Vor Einführung kostenpflichtiger Pakete stellen wir
        Verbraucher:innen eine Widerrufsbelehrung und ein Muster-Widerrufsformular zur Verfügung.</p>

      <h2>§ 6 Pflichten der Nutzer:innen</h2>
      <ol>
        <li>{P} darf nur zur Moderation, zum Community-Management und zur Auswertung des eigenen Streams genutzt werden. Untersagt ist
          insbesondere, Daten zu nutzen, um Personen zu belästigen, bloßzustellen, zu verfolgen oder ihre Identität offenzulegen
          („Doxxing“), sowie die Weitergabe oder Veröffentlichung von Chatdaten Dritter ohne Rechtsgrundlage.</li>
        <li>Creator informieren ihre Zuschauer:innen in geeigneter Weise (z. B. in der Profilbeschreibung oder in Chat-Regeln), dass
          Chatnachrichten zur Moderation gespeichert werden. Anfragen von Zuschauer:innen auf Auskunft oder Löschung bearbeiten sie
          selbst oder leiten sie an den Anbieter weiter. Im Dashboard bzw. über die API können Nachrichten einzelner Personen
          gelöscht werden.</li>
        <li>Die API darf nur im Rahmen des gebuchten Kontingents genutzt werden. Automatisierte Umgehung von Limits ist unzulässig.</li>
      </ol>

      <h2>§ 7 Auftragsverarbeitung</h2>
      <p>Soweit der Anbieter Chatnachrichten im Auftrag eines Creators verarbeitet, ist der Creator Verantwortlicher und der Anbieter
        Auftragsverarbeiter im Sinne von Art. 28 DSGVO. Einen Vertrag zur Auftragsverarbeitung stellt der Anbieter auf
        Anfrage an {L.email} zur Verfügung.</p>

      <h2>§ 8 Sperrung und Beendigung</h2>
      <p>Der Anbieter kann Zugänge sperren, wenn Nutzer:innen gegen diese AGB oder geltendes Recht verstoßen oder ein begründeter Verdacht
        darauf besteht. Bereits gezahlte Entgelte für den gesperrten Zeitraum werden bei schuldhaftem Verstoß nicht erstattet.
        Nutzer:innen können ihr Konto jederzeit löschen lassen ({L.email}).</p>

      <h2>§ 9 Haftung</h2>
      <ol>
        <li>Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit,
          nach dem Produkthaftungsgesetz sowie im Umfang einer übernommenen Garantie.</li>
        <li>Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht (deren Erfüllung die ordnungsgemäße Durchführung des
          Vertrags erst ermöglicht und auf deren Einhaltung Nutzer:innen regelmäßig vertrauen dürfen) ist die Haftung auf den
          vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.</li>
      </ol>

      <h2>§ 10 Änderungen</h2>
      <p>Der Anbieter kann diese AGB mit Wirkung für künftige Pakete ändern. Für bereits gebuchte Pakete gelten die AGB zum Zeitpunkt
        der Buchung.</p>

      <h2>§ 11 Schlussbestimmungen</h2>
      <p>Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Gegenüber Verbraucher:innen gilt diese
        Rechtswahl nur, soweit dadurch zwingende Verbraucherschutzvorschriften ihres Aufenthaltsstaats nicht entzogen werden.
        Ist die Nutzerin oder der Nutzer Kaufmann, ist Gerichtsstand der Sitz des Anbieters. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag
        im Übrigen wirksam.</p>
    </LegalPage>
  );
}
