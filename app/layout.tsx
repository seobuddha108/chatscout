import "./globals.css";

export const metadata = { title: "ChatScout" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "40px auto", padding: "0 16px", lineHeight: 1.5 }}>
        {children}
        <footer style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #ddd", fontSize: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <a href="/impressum">Impressum</a>
          <a href="/datenschutz">Datenschutz</a>
          <a href="/agb">AGB</a>
          <a href="/privacy" hrefLang="en">Privacy (EN)</a>
          <a href="/terms" hrefLang="en">Terms (EN)</a>
        </footer>
      </body>
    </html>
  );
}
