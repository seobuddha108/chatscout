import { legalIsDraft } from "./config";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal">
      {legalIsDraft() && (
        <p role="note" style={{ background: "#fff4ce", border: "1px solid #e0b400", padding: "10px 14px", borderRadius: 6 }}>
          <strong>Entwurf:</strong> Angaben in eckigen Klammern sind noch nicht ausgefüllt
          (<code>src/legal/config.ts</code>). Vor Veröffentlichung rechtlich prüfen lassen.
        </p>
      )}
      <h1>{title}</h1>
      {children}
    </main>
  );
}
