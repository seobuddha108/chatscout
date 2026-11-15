/**
 * Operator details for Impressum, Datenschutzerklärung and AGB.
 * Fill in every "[...]" value. Until then the legal pages show a draft banner.
 * Empty optional fields (register, vatId, phone) are simply omitted.
 */
export const LEGAL = {
  productName: "ChatScout",
  company: "seobuddha GmbH",
  legalForm: "", // e.g. "GmbH", "UG (haftungsbeschränkt)"; empty for sole traders
  representative: "Geschäftsführer: Felix Grote",
  street: "Bahnhofstraße 112",
  zipCity: "25451 Quickborn",
  country: "Deutschland",
  email: "info@seobuddha.de",
  privacyEmail: "info@seobuddha.de",
  phone: "", // optional but recommended
  register: "Registergericht: Amtsgericht Pinneberg, Registernummer: HRB 18398 PI",
  vatId: "DE369587929",
  contentResponsible: "Felix Grote, Bahnhofstraße 112, 25451 Quickborn", // § 18 Abs. 2 MStV
  dataProtectionOfficer: "", // only if you have/need one
  supervisoryAuthority: "Unabhängiges Landeszentrum für Datenschutz Schleswig-Holstein (ULD), Holstenstraße 98, 24103 Kiel",
  hosting: {
    app: "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA",
    database: "Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992",
    databaseRegion: "London (eu-west-2), Vereinigtes Königreich",
  },
  lastUpdated: "15.11.2026",
};

export const legalIsDraft = () => JSON.stringify(LEGAL).includes("[");
