const endpoints = [
  ["GET /api/v1/rankings/creators", "country, period (day|week|month), date, category (general|gaming), league (S–D), limit, offset"],
  ["GET /api/v1/rankings/gifters", "country, period, date, creator, limit, offset"],
  ["GET /api/v1/creators/:uniqueId", "date"],
  ["GET /api/v1/countries", "period, date"],
  ["GET /api/v1/leagues", "period"],
];

export default function Home() {
  return (
    <main>
      <h1>Live Rankings API</h1>
      <p>LIVE creator rankings, leagues and gifter leaderboards per country.</p>
      <p>Authenticate with <code>Authorization: Bearer &lt;key&gt;</code> or <code>x-api-key</code>.</p>
      <table cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Endpoint</th><th align="left">Query parameters</th></tr></thead>
        <tbody>
          {endpoints.map(([e, q]) => (
            <tr key={e} style={{ borderTop: "1px solid #ddd" }}><td><code>{e}</code></td><td>{q}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
