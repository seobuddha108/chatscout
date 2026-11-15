/**
 * Operator details for Impressum, Datenschutzerklärung and AGB.
 * Fill in every "[...]" value. Until then the legal pages show a draft banner.
 * Empty optional fields (register, vatId, phone) are simply omitted.
 */
export const LEGAL = {
  productName: "ChatScout",
  company: "[Firmenname oder Vor- und Nachname]",
  legalForm: "", // e.g. "GmbH", "UG (haftungsbeschränkt)"; empty for sole traders
  representative: "[Vertretungsberechtigte Person, z. B. Geschäftsführer:in]",
  street: "[Straße Hausnummer]",
  zipCity: "[PLZ Ort]",
  country: "Deutschland",
  email: "[kontakt@deine-domain.de]",
  privacyEmail: "[datenschutz@deine-domain.de]", // may equal email
  phone: "", // optional but recommended
  register: "", // e.g. "Amtsgericht Musterstadt, HRB 12345"
  vatId: "", // e.g. "DE123456789"
  contentResponsible: "[Name, Anschrift wie oben]", // § 18 Abs. 2 MStV
  dataProtectionOfficer: "", // only if you have/need one
  supervisoryAuthority: "[zuständige Landesdatenschutzbehörde, z. B. BayLDA]",
  hosting: {
    app: "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA",
    database: "Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992",
    databaseRegion: "London (eu-west-2), Vereinigtes Königreich",
  },
  lastUpdated: "15.11.2026",
};

export const legalIsDraft = () => JSON.stringify(LEGAL).includes("[");
