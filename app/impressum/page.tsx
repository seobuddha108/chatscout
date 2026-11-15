import { LEGAL } from "@/legal/config";
import { LegalPage } from "@/legal/LegalPage";

export const metadata = { title: "Impressum – ChatScout" };

export default function Impressum() {
  const L = LEGAL;
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {L.company}{L.legalForm && ` ${L.legalForm}`}<br />
        {L.street}<br />
        {L.zipCity}<br />
        {L.country}
      </p>
      {L.representative && <p><strong>Vertreten durch:</strong> {L.representative}</p>}

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${L.email}`}>{L.email}</a>
        {L.phone && <><br />Telefon: {L.phone}</>}
      </p>

      {L.register && <><h2>Registereintrag</h2><p>{L.register}</p></>}
      {L.vatId && <><h2>Umsatzsteuer-ID</h2><p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {L.vatId}</p></>}

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>{L.contentResponsible}</p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>

      <h2>Hinweis zu TikTok</h2>
      <p>{L.productName} ist ein unabhängiges Angebot und steht in keiner Verbindung zu TikTok oder ByteDance. TikTok ist eine Marke der jeweiligen Rechteinhaber.</p>
    </LegalPage>
  );
}
